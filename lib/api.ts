import { LRUCache } from 'lru-cache';
import {
  getFlightProviderStatus,
  getFlightsForBounds,
  lookupAviationstackFlight,
  type FlightProviderEnv,
} from './flightProviders.ts';
import {
  getAisStreamSnapshot,
  getAisStreamStatus,
  type AisStreamEnv,
} from './aisStreamHub.ts';

const REQUEST_TIMEOUT_MS = 12_000;
const responseCache = new LRUCache<string, unknown>({ max: 500, ttl: 60_000 });
const rateBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });
const intelligenceBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });
const flightLookupBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });

export interface RuntimeEnv extends FlightProviderEnv, AisStreamEnv {}

interface WeatherSnapshot {
  temp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  observed: string | null;
  source: 'open-meteo';
}

interface AirQualitySnapshot {
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  nitrogenDioxide: number | null;
  ozone: number | null;
  observed: string | null;
  source: 'open-meteo-air-quality';
}

interface PlaceSnapshot {
  displayName: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
  source: 'openstreetmap-nominatim';
}

interface Earthquake {
  id: string;
  magnitude: number | null;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depth: number | null;
  url: string;
}

type RestrictedRequest = 'intelligence' | 'flight-lookup' | null;

function consumeRateBucket(
  cache: LRUCache<string, { count: number; resetAt: number }>,
  key: string,
  limit: number,
) {
  const now = Date.now();
  const existing = cache.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + 60_000 }
    : { count: existing.count + 1, resetAt: existing.resetAt };
  cache.set(key, bucket, { ttl: Math.max(1, bucket.resetAt - now) });
  return { bucket, exceeded: bucket.count > limit, now };
}

function parseCoordinate(value: unknown, min: number, max: number, name: string) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw Object.assign(new Error(`Invalid ${name}`), { status: 400 });
  }

  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`Invalid ${name}`), { status: 400 });
  }
  return parsed;
}

function parseBounds(searchParams: URLSearchParams) {
  const lamin = parseCoordinate(searchParams.get('lamin'), -90, 90, 'lamin');
  const lamax = parseCoordinate(searchParams.get('lamax'), -90, 90, 'lamax');
  const lomin = parseCoordinate(searchParams.get('lomin'), -180, 180, 'lomin');
  const lomax = parseCoordinate(searchParams.get('lomax'), -180, 180, 'lomax');
  if (lamin >= lamax || lomin >= lomax) {
    throw Object.assign(new Error('Invalid bounding box order'), { status: 400 });
  }
  return { lamin, lamax, lomin, lomax };
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

function getCached<T>(key: string): T | undefined {
  return responseCache.get(key) as T | undefined;
}

function setCached(key: string, value: unknown, ttl: number) {
  responseCache.set(key, value, { ttl });
}

async function getWeatherSnapshot(lat: number, lng: number): Promise<WeatherSnapshot> {
  const cacheKey = `weather:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = getCached<WeatherSnapshot>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
  url.searchParams.set('timezone', 'auto');

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw Object.assign(new Error('Weather provider unavailable'), { status: 502 });
  const data = await response.json() as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      time?: string;
    };
  };

  const result: WeatherSnapshot = {
    temp: data.current?.temperature_2m ?? null,
    humidity: data.current?.relative_humidity_2m ?? null,
    windSpeed: data.current?.wind_speed_10m ?? null,
    weatherCode: data.current?.weather_code ?? null,
    observed: data.current?.time ?? null,
    source: 'open-meteo',
  };
  setCached(cacheKey, result, 5 * 60_000);
  return result;
}

async function getAirQualitySnapshot(lat: number, lng: number): Promise<AirQualitySnapshot> {
  const cacheKey = `air-quality:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = getCached<AirQualitySnapshot>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone');
  url.searchParams.set('timezone', 'auto');

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw Object.assign(new Error('Air-quality provider unavailable'), { status: 502 });
  const data = await response.json() as {
    current?: {
      us_aqi?: number;
      pm2_5?: number;
      pm10?: number;
      nitrogen_dioxide?: number;
      ozone?: number;
      time?: string;
    };
  };

  const result: AirQualitySnapshot = {
    usAqi: data.current?.us_aqi ?? null,
    pm25: data.current?.pm2_5 ?? null,
    pm10: data.current?.pm10 ?? null,
    nitrogenDioxide: data.current?.nitrogen_dioxide ?? null,
    ozone: data.current?.ozone ?? null,
    observed: data.current?.time ?? null,
    source: 'open-meteo-air-quality',
  };
  setCached(cacheKey, result, 10 * 60_000);
  return result;
}

async function getPlaceSnapshot(lat: number, lng: number): Promise<PlaceSnapshot> {
  const cacheKey = `place:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = getCached<PlaceSnapshot>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'AetherGlobe/4.4 (https://github.com/ChetanK147/aetherglobe)',
    },
  });
  if (!response.ok) throw Object.assign(new Error('OpenStreetMap place lookup unavailable'), { status: 502 });
  const data = await response.json() as {
    display_name?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      county?: string;
      state?: string;
      region?: string;
      country?: string;
      country_code?: string;
    };
  };

  const result: PlaceSnapshot = {
    displayName: data.display_name ?? null,
    locality: data.address?.city
      ?? data.address?.town
      ?? data.address?.village
      ?? data.address?.municipality
      ?? data.address?.county
      ?? null,
    region: data.address?.state ?? data.address?.region ?? null,
    country: data.address?.country ?? null,
    countryCode: data.address?.country_code?.toUpperCase() ?? null,
    source: 'openstreetmap-nominatim',
  };
  setCached(cacheKey, result, 24 * 60 * 60_000);
  return result;
}

async function getEarthquakes(): Promise<Earthquake[]> {
  const cacheKey = 'usgs:m4.5-day';
  const cached = getCached<{ earthquakes: Earthquake[] }>(cacheKey);
  if (cached) return cached.earthquakes;

  const response = await fetchWithTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
  if (!response.ok) throw Object.assign(new Error('USGS unavailable'), { status: 502 });
  const data = await response.json() as {
    features?: Array<{
      id?: string;
      properties?: { mag?: number; place?: string; time?: number; url?: string };
      geometry?: { coordinates?: unknown[] };
    }>;
  };

  const earthquakes = (data.features || []).flatMap((feature): Earthquake[] => {
    const coordinates = feature.geometry?.coordinates;
    const lng = Number(coordinates?.[0]);
    const lat = Number(coordinates?.[1]);
    const depth = Number(coordinates?.[2]);
    if (!feature.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];

    return [{
      id: feature.id,
      magnitude: Number.isFinite(feature.properties?.mag) ? feature.properties?.mag ?? null : null,
      place: feature.properties?.place || 'Unknown location',
      time: Number.isFinite(feature.properties?.time) ? feature.properties?.time ?? 0 : 0,
      lat,
      lng,
      depth: Number.isFinite(depth) ? depth : null,
      url: feature.properties?.url || '',
    }];
  }).slice(0, 100);

  setCached(cacheKey, { earthquakes, source: 'usgs', timestamp: Date.now() }, 60_000);
  return earthquakes;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6_371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatNumber(value: number | null, suffix = '', digits = 0) {
  return value === null ? 'Unavailable' : `${value.toFixed(digits)}${suffix}`;
}

function aqiCategory(aqi: number | null) {
  if (aqi === null) return 'Unavailable';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

function buildSourceBrief(
  lat: number,
  lng: number,
  place: PlaceSnapshot | null,
  weather: WeatherSnapshot | null,
  airQuality: AirQualitySnapshot | null,
  earthquakes: Earthquake[],
) {
  const nearby = earthquakes
    .map((event) => ({ ...event, distanceKm: distanceKm(lat, lng, event.lat, event.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);

  const seismicLines = nearby.length > 0
    ? nearby.map((event) => `- M${event.magnitude ?? '—'} · ${event.place} · approximately ${Math.round(event.distanceKm)} km away`).join('\n')
    : '- No M4.5+ events were available in the current USGS one-day feed.';

  const weatherLines = weather
    ? [
        `- Temperature: ${formatNumber(weather.temp, '°C', 1)}`,
        `- Humidity: ${formatNumber(weather.humidity, '%')}`,
        `- Wind: ${formatNumber(weather.windSpeed, ' km/h', 1)}`,
        `- Observation time: ${weather.observed || 'Unavailable'}`,
      ].join('\n')
    : '- Current weather could not be retrieved.';

  const airQualityLines = airQuality
    ? [
        `- US AQI: ${formatNumber(airQuality.usAqi)} (${aqiCategory(airQuality.usAqi)})`,
        `- PM2.5: ${formatNumber(airQuality.pm25, ' μg/m³', 1)}`,
        `- PM10: ${formatNumber(airQuality.pm10, ' μg/m³', 1)}`,
        `- Nitrogen dioxide: ${formatNumber(airQuality.nitrogenDioxide, ' μg/m³', 1)}`,
        `- Ozone: ${formatNumber(airQuality.ozone, ' μg/m³', 1)}`,
        `- Observation time: ${airQuality.observed || 'Unavailable'}`,
      ].join('\n')
    : '- Current air-quality data could not be retrieved.';

  const locationName = place?.displayName
    || [place?.locality, place?.region, place?.country].filter(Boolean).join(', ')
    || 'Name unavailable';

  return `# Current Source Brief\n\n**Location:** ${locationName}  \n**Coordinates:** ${lat.toFixed(4)}, ${lng.toFixed(4)}  \n**Method:** Direct public data aggregation; no language model\n\n## Current weather\n${weatherLines}\n\n## Current air quality\n${airQualityLines}\n\n## Nearby seismic context\n${seismicLines}\n\n## Sources and limits\n- Place name: OpenStreetMap Nominatim reverse geocoding.\n- Weather: Open-Meteo current conditions.\n- Air quality: Open-Meteo Air Quality current conditions.\n- Seismic events: USGS M4.5+ one-day GeoJSON feed.\n- Aircraft and vessel positions are displayed as separate live layers and are not interpreted in this text brief.\n- Data can be delayed, incomplete, or unavailable. AetherGlobe is exploratory and must not be used for operational decisions.`;
}

async function readJsonBody(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 32_768) {
    throw Object.assign(new Error('Request body too large'), { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_768) {
    throw Object.assign(new Error('Request body too large'), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

function applyRateLimit(clientIp: string, requestType: RestrictedRequest) {
  const general = consumeRateBucket(rateBuckets, clientIp, 120);
  if (general.exceeded) return general;
  if (requestType === 'intelligence') return consumeRateBucket(intelligenceBuckets, clientIp, 20);
  if (requestType === 'flight-lookup') return consumeRateBucket(flightLookupBuckets, clientIp, 10);
  return general;
}

async function generateSourceBrief(body: Record<string, unknown>) {
  const lat = parseCoordinate(body.lat, -90, 90, 'latitude');
  const lng = parseCoordinate(body.lng, -180, 180, 'longitude');
  const cacheKey = `source-brief:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [placeResult, weatherResult, airQualityResult, earthquakeResult] = await Promise.allSettled([
    getPlaceSnapshot(lat, lng),
    getWeatherSnapshot(lat, lng),
    getAirQualitySnapshot(lat, lng),
    getEarthquakes(),
  ]);
  const place = placeResult.status === 'fulfilled' ? placeResult.value : null;
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const airQuality = airQualityResult.status === 'fulfilled' ? airQualityResult.value : null;
  const earthquakes = earthquakeResult.status === 'fulfilled' ? earthquakeResult.value : [];

  const result = {
    report: buildSourceBrief(lat, lng, place, weather, airQuality, earthquakes),
    mode: 'direct-source-brief',
    model: null,
    sources: [
      ...(place ? ['openstreetmap-nominatim'] : []),
      ...(weather ? ['open-meteo'] : []),
      ...(airQuality ? ['open-meteo-air-quality'] : []),
      ...(earthquakeResult.status === 'fulfilled' ? ['usgs'] : []),
    ],
  };
  setCached(cacheKey, result, 2 * 60_000);
  return result;
}

export async function handleApiRequest(
  request: Request,
  env: RuntimeEnv,
  clientIp = 'unknown',
): Promise<Response> {
  try {
    const url = new URL(request.url);
    const pathname = url.pathname.replace(/\/$/, '');
    const restrictedRequest: RestrictedRequest = pathname === '/api/intelligence'
      ? 'intelligence'
      : pathname === '/api/flight-lookup'
        ? 'flight-lookup'
        : null;
    const rate = applyRateLimit(clientIp || 'unknown', restrictedRequest);
    if (rate.exceeded) {
      const message = restrictedRequest === 'intelligence'
        ? 'Too many source brief requests'
        : restrictedRequest === 'flight-lookup'
          ? 'Too many flight lookup requests'
          : 'Too many requests';
      return jsonResponse(
        { error: message },
        429,
        { 'Retry-After': String(Math.ceil((rate.bucket.resetAt - rate.now) / 1000)) },
      );
    }

    if (pathname === '/api/intelligence') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      return jsonResponse(await generateSourceBrief(await readJsonBody(request)));
    }

    if (pathname === '/api/weather') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      const lat = parseCoordinate(url.searchParams.get('lat'), -90, 90, 'latitude');
      const lng = parseCoordinate(url.searchParams.get('lng'), -180, 180, 'longitude');
      return jsonResponse(await getWeatherSnapshot(lat, lng));
    }

    if (pathname === '/api/flights') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse(await getFlightsForBounds(parseBounds(url.searchParams), env));
    }

    if (pathname === '/api/vessels') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse(getAisStreamSnapshot(parseBounds(url.searchParams), env));
    }

    if (pathname === '/api/flight-lookup') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse(await lookupAviationstackFlight(url.searchParams.get('flight'), env));
    }

    if (pathname === '/api/live/usgs') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse({ earthquakes: await getEarthquakes(), source: 'usgs', timestamp: Date.now() });
    }

    if (pathname === '/api/health') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      const flightStatus = getFlightProviderStatus(env);
      const maritimeStatus = getAisStreamStatus(env);
      return jsonResponse({
        status: 'ok',
        version: '4.4.0',
        runtime: 'shared-api',
        intelligenceMode: 'direct-source-brief',
        cacheEntries: responseCache.size,
        flightSource: flightStatus.primaryFlightSource,
        localReceiverConfigured: flightStatus.localReceiverConfigured,
        aviationstackConfigured: flightStatus.aviationstackConfigured,
        aisstreamConfigured: maritimeStatus.configured,
        aisstreamMode: maritimeStatus.mode,
        feeds: [
          'openstreetmap-nominatim',
          'open-meteo',
          'open-meteo-air-quality',
          'usgs',
          flightStatus.primaryFlightSource,
          ...(flightStatus.aviationstackConfigured ? ['aviationstack-on-demand'] : []),
          ...(maritimeStatus.configured ? [`aisstream-${maritimeStatus.mode}`] : []),
        ],
      });
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
  } catch (error) {
    const typedError = error as Error & { status?: number; expose?: boolean };
    const status = typedError.status || (typedError.name === 'AbortError' ? 504 : 500);
    console.error(typedError);
    const message = status >= 500 && !typedError.expose ? 'Upstream service error' : typedError.message;
    return jsonResponse({ error: message }, status);
  }
}
