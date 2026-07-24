import { LRUCache } from 'lru-cache';

const REQUEST_TIMEOUT_MS = 10_000;
const LOCAL_RECEIVER_TIMEOUT_MS = 3_000;
const flightCache = new LRUCache<string, unknown>({ max: 250 });
const lookupCache = new LRUCache<string, unknown>({ max: 250 });

export interface FlightProviderEnv {
  DUMP1090_AIRCRAFT_URL?: string;
  DUMP1090_MAX_POSITION_AGE_SECONDS?: string;
  AVIATIONSTACK_API_KEY?: string;
  AVIATIONSTACK_BASE_URL?: string;
}

export interface FlightBounds {
  lamin: number;
  lamax: number;
  lomin: number;
  lomax: number;
}

export interface NormalizedFlight {
  id: string;
  callsign: string;
  lat: number;
  lng: number;
  altitude: number | null;
  velocity: number | null;
  track: number | null;
  squawk: string | number | null;
  aircraft: string | null;
  registration: string | null;
  onGround?: boolean;
  observedAt?: number | null;
  positionAgeSeconds?: number | null;
  signalDbfs?: number | null;
  source?: 'local-dump1090' | 'flightradar24-unofficial';
}

interface Dump1090Aircraft {
  hex?: unknown;
  flight?: unknown;
  lat?: unknown;
  lon?: unknown;
  alt_baro?: unknown;
  alt_geom?: unknown;
  altitude?: unknown;
  gs?: unknown;
  speed?: unknown;
  track?: unknown;
  baro_rate?: unknown;
  squawk?: unknown;
  category?: unknown;
  t?: unknown;
  r?: unknown;
  seen?: unknown;
  seen_pos?: unknown;
  rssi?: unknown;
}

interface Dump1090Response {
  now?: unknown;
  messages?: unknown;
  aircraft?: unknown;
}

interface AviationstackError {
  code?: string | number;
  type?: string;
  message?: string;
  info?: string;
}

interface AviationstackAirport {
  airport?: string | null;
  timezone?: string | null;
  iata?: string | null;
  icao?: string | null;
  terminal?: string | null;
  gate?: string | null;
  baggage?: string | null;
  delay?: number | null;
  scheduled?: string | null;
  estimated?: string | null;
  actual?: string | null;
  estimated_runway?: string | null;
  actual_runway?: string | null;
}

interface AviationstackFlight {
  flight_date?: string | null;
  flight_status?: string | null;
  departure?: AviationstackAirport | null;
  arrival?: AviationstackAirport | null;
  airline?: {
    name?: string | null;
    iata?: string | null;
    icao?: string | null;
  } | null;
  flight?: {
    number?: string | null;
    iata?: string | null;
    icao?: string | null;
    codeshared?: {
      airline_name?: string | null;
      airline_iata?: string | null;
      airline_icao?: string | null;
      flight_number?: string | null;
      flight_iata?: string | null;
      flight_icao?: string | null;
    } | null;
  } | null;
  aircraft?: {
    registration?: string | null;
    iata?: string | null;
    icao?: string | null;
    icao24?: string | null;
  } | null;
  live?: {
    updated?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    altitude?: number | null;
    direction?: number | null;
    speed_horizontal?: number | null;
    speed_vertical?: number | null;
    is_ground?: boolean | null;
  } | null;
}

interface AviationstackResponse {
  data?: AviationstackFlight[];
  error?: AviationstackError;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function toEpochSeconds(value: unknown): number {
  const parsed = toNullableNumber(value) ?? Date.now() / 1000;
  return parsed > 10_000_000_000 ? parsed / 1000 : parsed;
}

function configuredSecret(value: string | undefined): string | null {
  const secret = value?.trim();
  if (!secret || /^(paste|your)[-_ ]/i.test(secret)) return null;
  return secret;
}

function parsePositiveNumber(value: string | undefined, fallback: number, max: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(max, parsed);
}

function parseHttpUrl(value: string, label: string, requireHttps = false): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw Object.assign(new Error(`Invalid ${label}`), { status: 500 });
  }
  const allowed = requireHttps ? url.protocol === 'https:' : ['http:', 'https:'].includes(url.protocol);
  if (!allowed) throw Object.assign(new Error(`Invalid ${label}`), { status: 500 });
  return url;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function isInsideBounds(lat: number, lng: number, bounds: FlightBounds) {
  return lat >= bounds.lamin && lat <= bounds.lamax && lng >= bounds.lomin && lng <= bounds.lomax;
}

function normalizeDump1090Aircraft(
  value: unknown,
  generatedAtSeconds: number,
  maxPositionAgeSeconds: number,
  bounds: FlightBounds,
): NormalizedFlight | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const aircraft = value as Dump1090Aircraft;
  const lat = toNullableNumber(aircraft.lat);
  const lng = toNullableNumber(aircraft.lon);
  if (lat === null || lng === null || !isInsideBounds(lat, lng, bounds)) return null;

  const positionAge = toNullableNumber(aircraft.seen_pos) ?? toNullableNumber(aircraft.seen);
  if (positionAge !== null && positionAge > maxPositionAgeSeconds) return null;

  const hex = toNullableString(aircraft.hex)?.toLowerCase();
  if (!hex || !/^[0-9a-f]{6}$/i.test(hex)) return null;

  const altitudeValue = aircraft.alt_baro ?? aircraft.alt_geom ?? aircraft.altitude;
  const onGround = altitudeValue === 'ground';

  return {
    id: hex,
    callsign: toNullableString(aircraft.flight) || hex.toUpperCase(),
    lat,
    lng,
    altitude: onGround ? 0 : toNullableNumber(altitudeValue),
    velocity: toNullableNumber(aircraft.gs ?? aircraft.speed),
    track: toNullableNumber(aircraft.track),
    squawk: typeof aircraft.squawk === 'string' || typeof aircraft.squawk === 'number'
      ? aircraft.squawk
      : null,
    aircraft: toNullableString(aircraft.t) || toNullableString(aircraft.category),
    registration: toNullableString(aircraft.r),
    onGround,
    observedAt: Math.round((generatedAtSeconds - (positionAge ?? 0)) * 1000),
    positionAgeSeconds: positionAge,
    signalDbfs: toNullableNumber(aircraft.rssi),
    source: 'local-dump1090',
  };
}

async function getDump1090Flights(bounds: FlightBounds, env: FlightProviderEnv) {
  const configuredUrl = env.DUMP1090_AIRCRAFT_URL?.trim();
  if (!configuredUrl) return null;
  const url = parseHttpUrl(configuredUrl, 'DUMP1090_AIRCRAFT_URL');
  const maxPositionAge = parsePositiveNumber(env.DUMP1090_MAX_POSITION_AGE_SECONDS, 20, 120);
  const cacheKey = `dump1090:${url.toString()}:${bounds.lamin.toFixed(2)}:${bounds.lomin.toFixed(2)}:${bounds.lamax.toFixed(2)}:${bounds.lomax.toFixed(2)}`;
  const cached = flightCache.get(cacheKey);
  if (cached) return cached;

  const response = await fetchWithTimeout(url.toString(), {
    headers: { Accept: 'application/json' },
  }, LOCAL_RECEIVER_TIMEOUT_MS);
  if (!response.ok) throw new Error(`Local dump1090 receiver returned ${response.status}`);

  const payload = await response.json() as Dump1090Response;
  const generatedAtSeconds = toEpochSeconds(payload.now);
  const aircraft = Array.isArray(payload.aircraft) ? payload.aircraft : [];
  const flights = aircraft
    .map((entry) => normalizeDump1090Aircraft(entry, generatedAtSeconds, maxPositionAge, bounds))
    .filter((entry): entry is NormalizedFlight => entry !== null);

  const result = {
    flights,
    source: 'local-dump1090',
    timestamp: Math.round(generatedAtSeconds * 1000),
    receiverMessages: toNullableNumber(payload.messages),
    warning: 'Direct local ADS-B observations; coverage and completeness depend on the receiver and antenna.',
  };
  flightCache.set(cacheKey, result, { ttl: 2_000 });
  return result;
}

function parseFlightradar24Flight(value: unknown): NormalizedFlight | null {
  if (!Array.isArray(value)) return null;
  const lat = toNullableNumber(value[1]);
  const lng = toNullableNumber(value[2]);
  if (lat === null || lng === null) return null;

  return {
    id: String(value[0] ?? `${lat}:${lng}`),
    callsign: toNullableString(value[16]) || toNullableString(value[13]) || 'UNKNOWN',
    lat,
    lng,
    altitude: toNullableNumber(value[4]),
    velocity: toNullableNumber(value[5]),
    track: toNullableNumber(value[3]),
    squawk: typeof value[7] === 'string' || typeof value[7] === 'number' ? value[7] : null,
    aircraft: toNullableString(value[8]),
    registration: toNullableString(value[9]),
    source: 'flightradar24-unofficial',
  };
}

async function getFlightradar24Flights(bounds: FlightBounds, fallbackWarning?: string) {
  const cacheKey = `fr24:${bounds.lamin.toFixed(2)}:${bounds.lomin.toFixed(2)}:${bounds.lamax.toFixed(2)}:${bounds.lomax.toFixed(2)}`;
  const cached = flightCache.get(cacheKey);
  if (cached) return cached;

  const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${bounds.lamax},${bounds.lamin},${bounds.lomin},${bounds.lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&stats=0`;
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'AetherGlobe/1.0' } });
  if (!response.ok) throw Object.assign(new Error('Flight provider unavailable'), { status: 502 });
  const payload = await response.json() as Record<string, unknown>;
  const flights = Object.values(payload)
    .map(parseFlightradar24Flight)
    .filter((entry): entry is NormalizedFlight => entry !== null);

  const result = {
    flights,
    source: 'flightradar24-unofficial',
    timestamp: Date.now(),
    warning: fallbackWarning
      ? `${fallbackWarning} Using the unofficial public fallback; availability and accuracy are not guaranteed.`
      : 'Unofficial public feed; availability and accuracy are not guaranteed.',
  };
  flightCache.set(cacheKey, result, { ttl: 15_000 });
  return result;
}

export async function getFlightsForBounds(bounds: FlightBounds, env: FlightProviderEnv) {
  if (env.DUMP1090_AIRCRAFT_URL?.trim()) {
    try {
      const localResult = await getDump1090Flights(bounds, env);
      if (localResult) return localResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn('Local dump1090 receiver unavailable:', message);
      return getFlightradar24Flights(bounds, `Local dump1090 receiver unavailable: ${message}.`);
    }
  }
  return getFlightradar24Flights(bounds);
}

function normalizeFlightQuery(value: string | null): { query: string; filter: 'flight_iata' | 'flight_icao' | 'flight_number' } {
  const query = value?.replace(/[\s-]+/g, '').toUpperCase() || '';
  if (/^[A-Z]{2}\d{1,4}[A-Z]?$/.test(query)) return { query, filter: 'flight_iata' };
  if (/^[A-Z]{3}\d{1,4}[A-Z]?$/.test(query)) return { query, filter: 'flight_icao' };
  if (/^\d{1,4}$/.test(query)) return { query, filter: 'flight_number' };
  throw Object.assign(new Error('Enter an IATA or ICAO flight code such as AI123 or AIC123'), { status: 400 });
}

function normalizeAviationstackFlight(flight: AviationstackFlight) {
  return {
    flightDate: flight.flight_date ?? null,
    status: flight.flight_status ?? null,
    airline: {
      name: flight.airline?.name ?? null,
      iata: flight.airline?.iata ?? null,
      icao: flight.airline?.icao ?? null,
    },
    flight: {
      number: flight.flight?.number ?? null,
      iata: flight.flight?.iata ?? null,
      icao: flight.flight?.icao ?? null,
      codeshared: flight.flight?.codeshared ?? null,
    },
    departure: flight.departure ?? null,
    arrival: flight.arrival ?? null,
    aircraft: flight.aircraft ?? null,
    live: flight.live ?? null,
  };
}

function aviationstackErrorStatus(error: AviationstackError | undefined) {
  const code = String(error?.code ?? error?.type ?? '').toLowerCase();
  if (code.includes('usage') || code.includes('limit') || code === '104') return 429;
  if (code.includes('access') || code.includes('key') || code === '101') return 503;
  return 502;
}

export async function lookupAviationstackFlight(value: string | null, env: FlightProviderEnv) {
  const { query, filter } = normalizeFlightQuery(value);
  const apiKey = configuredSecret(env.AVIATIONSTACK_API_KEY);
  if (!apiKey) {
    throw Object.assign(
      new Error('Aviationstack is not configured. Add AVIATIONSTACK_API_KEY to .env.local and restart the server.'),
      { status: 503, expose: true },
    );
  }

  const cacheKey = `aviationstack:${filter}:${query}`;
  const cached = lookupCache.get(cacheKey);
  if (cached) return cached;

  const baseUrl = parseHttpUrl(
    env.AVIATIONSTACK_BASE_URL?.trim() || 'https://api.aviationstack.com/v1',
    'AVIATIONSTACK_BASE_URL',
    true,
  );
  const base = baseUrl.toString().endsWith('/') ? baseUrl.toString() : `${baseUrl.toString()}/`;
  const url = new URL('flights', base);
  url.searchParams.set('access_key', apiKey);
  url.searchParams.set(filter, query);
  url.searchParams.set('limit', '10');

  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  const payload = await response.json().catch(() => ({})) as AviationstackResponse;
  if (!response.ok || payload.error) {
    const status = payload.error ? aviationstackErrorStatus(payload.error) : 502;
    const message = payload.error?.message || payload.error?.info || `Aviationstack returned ${response.status}`;
    throw Object.assign(new Error(message), { status, expose: status === 503 });
  }

  const result = {
    query,
    source: 'aviationstack',
    timestamp: Date.now(),
    matches: (Array.isArray(payload.data) ? payload.data : []).map(normalizeAviationstackFlight),
  };
  lookupCache.set(cacheKey, result, { ttl: 15 * 60_000 });
  return result;
}

export function getFlightProviderStatus(env: FlightProviderEnv) {
  const localReceiverConfigured = Boolean(env.DUMP1090_AIRCRAFT_URL?.trim());
  const aviationstackConfigured = Boolean(configuredSecret(env.AVIATIONSTACK_API_KEY));
  return {
    localReceiverConfigured,
    aviationstackConfigured,
    primaryFlightSource: localReceiverConfigured
      ? 'local-dump1090-with-public-fallback'
      : 'flightradar24-unofficial',
  };
}
