import { LRUCache } from 'lru-cache';

const REQUEST_TIMEOUT_MS = 12_000;
const OPENAI_TIMEOUT_MS = 30_000;
const DEFAULT_OPENAI_MODEL = 'gpt-5.2';
const FALLBACK_OPENAI_MODEL = 'gpt-5-mini';
const responseCache = new LRUCache<string, unknown>({ max: 500, ttl: 60_000 });
const rateBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });
const intelligenceBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });

export interface RuntimeEnv {
  OPENAI_API_KEY?: string;
  OPENAI_MODEL?: string;
}

interface WeatherSnapshot {
  temp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  observed: string | null;
  source: 'open-meteo';
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

interface OpenAIResponse {
  output_text?: string;
  output?: Array<{
    type?: string;
    content?: Array<{ type?: string; text?: string }>;
  }>;
  error?: { message?: string };
}

interface FlightRecord {
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
}

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

function normalizeOpenAIModel(value: string | undefined) {
  const model = value?.trim();
  return model && /^[a-z0-9][a-z0-9._:-]{0,100}$/i.test(model) ? model : undefined;
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

function toNullableNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function parseFlight(value: unknown): FlightRecord | null {
  if (!Array.isArray(value)) return null;
  const lat = Number(value[1]);
  const lng = Number(value[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

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
  };
}

async function getFlights(searchParams: URLSearchParams) {
  const { lamin, lamax, lomin, lomax } = parseBounds(searchParams);
  const cacheKey = `flights:${lamin.toFixed(2)}:${lomin.toFixed(2)}:${lamax.toFixed(2)}:${lomax.toFixed(2)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&stats=0`;
  const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'AetherGlobe/1.0' } });
  if (!response.ok) throw Object.assign(new Error('Flight provider unavailable'), { status: 502 });
  const data = await response.json() as Record<string, unknown>;
  const flights = Object.values(data).map(parseFlight).filter((flight): flight is FlightRecord => flight !== null);

  const result = {
    flights,
    source: 'flightradar24-unofficial',
    timestamp: Date.now(),
    warning: 'Unofficial public feed; availability and accuracy are not guaranteed.',
  };
  setCached(cacheKey, result, 15_000);
  return result;
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

function formatNumber(value: number | null, suffix = '') {
  return value === null ? 'Unavailable' : `${Math.round(value)}${suffix}`;
}

function buildLocalIntelligence(
  lat: number,
  lng: number,
  context: string,
  weather: WeatherSnapshot | null,
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
        `- Temperature: ${formatNumber(weather.temp, '°C')}`,
        `- Humidity: ${formatNumber(weather.humidity, '%')}`,
        `- Wind: ${formatNumber(weather.windSpeed, ' km/h')}`,
        `- Observation time: ${weather.observed || 'Unavailable'}`,
      ].join('\n')
    : '- Current weather could not be retrieved.';

  return `# Location Intelligence\n\n**Coordinates:** ${lat.toFixed(4)}, ${lng.toFixed(4)}  \n**Mode:** Verified source summary\n\n## Current weather\n${weatherLines}\n\n## Nearby seismic context\n${seismicLines}\n\n## Requested focus\n${context || 'General location overview'}\n\n## Sources and limits\n- Weather: Open-Meteo current conditions.\n- Seismic events: USGS M4.5+ one-day feed.\n- This fallback does not infer live traffic, transit, maritime, police, military or emergency-response activity.\n- AetherGlobe is exploratory and must not be used for operational decisions.`;
}

function extractOpenAIText(payload: OpenAIResponse) {
  const topLevel = payload.output_text?.trim();
  if (topLevel) return topLevel;

  return payload.output
    ?.filter((item) => item.type === 'message')
    .flatMap((item) => item.content || [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text || '')
    .join('\n')
    .trim();
}

async function callOpenAI(
  model: string,
  apiKey: string,
  prompt: string,
  useDeepThinking: boolean,
) {
  const body: Record<string, unknown> = {
    model,
    instructions: 'You are AetherAI, a cautious location intelligence assistant. Preserve source limitations, distinguish current sourced observations from general background, and never invent live traffic, transit, maritime, police, military, or emergency-response feeds.',
    input: prompt,
    max_output_tokens: 2_500,
    store: false,
  };
  if (/^(gpt-5|o\d)/i.test(model)) {
    body.reasoning = { effort: useDeepThinking ? 'medium' : 'low' };
  }

  const response = await fetchWithTimeout('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  }, OPENAI_TIMEOUT_MS);

  const payload = await response.json() as OpenAIResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `OpenAI ${model} request failed with ${response.status}`);
  }

  const text = extractOpenAIText(payload);
  if (!text) throw new Error(`OpenAI ${model} returned no text`);
  return text;
}

async function enrichIntelligence(
  localReport: string,
  context: string,
  useDeepThinking: boolean,
  apiKey: string,
  configuredModel?: string,
) {
  const models = Array.from(new Set([
    normalizeOpenAIModel(configuredModel),
    DEFAULT_OPENAI_MODEL,
    FALLBACK_OPENAI_MODEL,
  ].filter((model): model is string => Boolean(model))));

  const prompt = `${useDeepThinking ? 'Provide a detailed, risk-aware interpretation while remaining concise and explicit about uncertainty.' : 'Keep the response concise, practical, and explicit about uncertainty.'}\n\nUSER REQUEST:\n${context || 'General location overview'}\n\nVERIFIED SOURCE SUMMARY:\n${localReport}`;

  const failures: string[] = [];
  for (const model of models) {
    try {
      return { report: await callOpenAI(model, apiKey, prompt, useDeepThinking), model };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model}: ${message}`);
      console.warn(`OpenAI model fallback failed (${model}):`, message);
    }
  }
  throw new Error(failures.join(' | '));
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

function applyRateLimit(clientIp: string, intelligence: boolean) {
  const general = consumeRateBucket(rateBuckets, clientIp, 120);
  if (general.exceeded) return general;
  if (intelligence) return consumeRateBucket(intelligenceBuckets, clientIp, 20);
  return general;
}

async function generateIntelligence(body: Record<string, unknown>, env: RuntimeEnv) {
  const lat = parseCoordinate(body.lat, -90, 90, 'latitude');
  const lng = parseCoordinate(body.lng, -180, 180, 'longitude');
  const context = typeof body.context === 'string' ? body.context.trim().slice(0, 1_200) : '';
  const useDeepThinking = body.useDeepThinking === true;
  const cacheKey = `intelligence:${lat.toFixed(4)}:${lng.toFixed(4)}:${context}:${useDeepThinking}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const [weatherResult, earthquakeResult] = await Promise.allSettled([
    getWeatherSnapshot(lat, lng),
    getEarthquakes(),
  ]);
  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const earthquakes = earthquakeResult.status === 'fulfilled' ? earthquakeResult.value : [];
  const localReport = buildLocalIntelligence(lat, lng, context, weather, earthquakes);
  const apiKey = env.OPENAI_API_KEY?.trim();

  let result: Record<string, unknown> = {
    report: `${localReport}\n\n> AI enrichment is not configured; this report was generated directly from the named data sources.`,
    mode: 'local-fallback',
    model: null,
    sources: ['open-meteo', 'usgs'],
  };

  if (apiKey) {
    try {
      const enriched = await enrichIntelligence(localReport, context, useDeepThinking, apiKey, env.OPENAI_MODEL);
      result = {
        report: `${enriched.report}\n\n---\n**Verified current sources:** Open-Meteo weather and USGS M4.5+ one-day seismic feed. OpenAI provided narrative enrichment; verify important claims.`,
        mode: 'openai-enriched',
        model: enriched.model,
        sources: ['open-meteo', 'usgs', 'openai'],
      };
    } catch (error) {
      console.error('OpenAI enrichment unavailable; returning local report:', error);
      result = {
        report: `${localReport}\n\n> OpenAI enrichment was unavailable, so AetherGlobe returned its verified source summary instead.`,
        mode: 'local-fallback',
        model: null,
        sources: ['open-meteo', 'usgs'],
        warning: 'OpenAI enrichment unavailable',
      };
    }
  }

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
    const intelligenceRequest = pathname === '/api/intelligence';
    const rate = applyRateLimit(clientIp || 'unknown', intelligenceRequest);
    if (rate.exceeded) {
      return jsonResponse(
        { error: intelligenceRequest ? 'Too many intelligence requests' : 'Too many requests' },
        429,
        { 'Retry-After': String(Math.ceil((rate.bucket.resetAt - rate.now) / 1000)) },
      );
    }

    if (pathname === '/api/intelligence') {
      if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
      return jsonResponse(await generateIntelligence(await readJsonBody(request), env));
    }

    if (pathname === '/api/weather') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      const lat = parseCoordinate(url.searchParams.get('lat'), -90, 90, 'latitude');
      const lng = parseCoordinate(url.searchParams.get('lng'), -180, 180, 'longitude');
      return jsonResponse(await getWeatherSnapshot(lat, lng));
    }

    if (pathname === '/api/flights') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse(await getFlights(url.searchParams));
    }

    if (pathname === '/api/live/usgs') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse({ earthquakes: await getEarthquakes(), source: 'usgs', timestamp: Date.now() });
    }

    if (pathname === '/api/health') {
      if (request.method !== 'GET') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'GET' });
      return jsonResponse({
        status: 'ok',
        version: '4.3.0',
        runtime: 'shared-api',
        intelligenceMode: env.OPENAI_API_KEY?.trim() ? 'openai-with-local-fallback' : 'local-source-summary',
        configuredModel: normalizeOpenAIModel(env.OPENAI_MODEL) || DEFAULT_OPENAI_MODEL,
        fallbackModel: FALLBACK_OPENAI_MODEL,
        cacheEntries: responseCache.size,
        feeds: ['open-meteo', 'usgs', 'flightradar24-unofficial'],
      });
    }

    return jsonResponse({ error: 'API endpoint not found' }, 404);
  } catch (error) {
    const typedError = error as Error & { status?: number };
    const status = typedError.status || (typedError.name === 'AbortError' ? 504 : 500);
    console.error(typedError);
    return jsonResponse({ error: status >= 500 ? 'Upstream service error' : typedError.message }, status);
  }
}
