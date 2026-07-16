import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createHash } from 'crypto';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import { LRUCache } from 'lru-cache';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const REQUEST_TIMEOUT_MS = 12_000;
const GEMINI_TIMEOUT_MS = 30_000;
const responseCache = new LRUCache<string, unknown>({ max: 500, ttl: 60_000 });
const rateBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });
const intelligenceBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });

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

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
  error?: { message?: string };
}

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
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

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const { bucket, exceeded, now } = consumeRateBucket(rateBuckets, key, 120);
  if (exceeded) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests' });
    return;
  }
  next();
}

function intelligenceRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const { bucket, exceeded, now } = consumeRateBucket(intelligenceBuckets, key, 20);
  if (exceeded) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many intelligence requests' });
    return;
  }
  next();
}

function parseCoordinate(value: unknown, min: number, max: number, name: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`Invalid ${name}`), { status: 400 });
  }
  return parsed;
}

function parseBounds(query: Request['query']) {
  const lamin = parseCoordinate(query.lamin, -90, 90, 'lamin');
  const lamax = parseCoordinate(query.lamax, -90, 90, 'lamax');
  const lomin = parseCoordinate(query.lomin, -180, 180, 'lomin');
  const lomax = parseCoordinate(query.lomax, -180, 180, 'lomax');
  if (lamin >= lamax || lomin >= lomax) {
    throw Object.assign(new Error('Invalid bounding box order'), { status: 400 });
  }
  return { lamin, lamax, lomin, lomax };
}

function normalizeGeminiModel(value: string | undefined) {
  const model = value?.trim().replace(/^models\//, '');
  return model && /^[a-z0-9._-]+$/i.test(model) ? model : undefined;
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
      id: string;
      properties: { mag?: number; place?: string; time?: number; url?: string };
      geometry: { coordinates: [number, number, number] };
    }>;
  };
  const earthquakes = (data.features || []).slice(0, 100).map((feature) => ({
    id: feature.id,
    magnitude: feature.properties.mag ?? null,
    place: feature.properties.place || 'Unknown location',
    time: feature.properties.time || 0,
    lat: feature.geometry.coordinates[1],
    lng: feature.geometry.coordinates[0],
    depth: feature.geometry.coordinates[2] ?? null,
    url: feature.properties.url || '',
  }));
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

async function callGemini(model: string, apiKey: string, prompt: string) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.2,
        maxOutputTokens: 2_500,
      },
    }),
  }, GEMINI_TIMEOUT_MS);

  const payload = await response.json() as GeminiGenerateResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `Gemini ${model} request failed with ${response.status}`);
  }

  const text = payload.candidates
    ?.flatMap((candidate) => candidate.content?.parts || [])
    .map((part) => part.text || '')
    .join('\n')
    .trim();
  if (!text) throw new Error(`Gemini ${model} returned no text`);
  return text;
}

async function enrichIntelligence(
  localReport: string,
  context: string,
  useDeepThinking: boolean,
  apiKey: string,
) {
  const configuredModel = normalizeGeminiModel(process.env.GEMINI_MODEL);
  const models = Array.from(new Set([
    configuredModel,
    'gemini-3.5-flash',
    'gemini-2.5-flash',
  ].filter((model): model is string => Boolean(model))));

  const prompt = `You are AetherAI, a cautious location intelligence assistant. Rewrite and enrich the verified source summary below for the user's request. Preserve every source limitation, clearly distinguish sourced current observations from general background, and do not invent live traffic, transit, maritime, police, military or emergency-response feeds. ${useDeepThinking ? 'Provide a more detailed risk-aware interpretation, but remain concise and explicit about uncertainty.' : 'Keep the response concise and practical.'}\n\nUSER REQUEST:\n${context || 'General location overview'}\n\nVERIFIED SOURCE SUMMARY:\n${localReport}`;

  const failures: string[] = [];
  for (const model of models) {
    try {
      return { report: await callGemini(model, apiKey, prompt), model };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      failures.push(`${model}: ${message}`);
      console.warn(`Gemini model fallback failed (${model}):`, message);
    }
  }
  throw new Error(failures.join(' | '));
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', rateLimit);

  app.post('/api/intelligence', intelligenceRateLimit, asyncRoute(async (req, res) => {
    const lat = parseCoordinate(req.body?.lat, -90, 90, 'latitude');
    const lng = parseCoordinate(req.body?.lng, -180, 180, 'longitude');
    const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 1_200) : '';
    const useDeepThinking = req.body?.useDeepThinking === true;
    const contextHash = createHash('sha256').update(`${lat}:${lng}:${context}:${useDeepThinking}`).digest('hex').slice(0, 20);
    const cacheKey = `intelligence:${contextHash}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const [weatherResult, earthquakeResult] = await Promise.allSettled([
      getWeatherSnapshot(lat, lng),
      getEarthquakes(),
    ]);
    const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
    const earthquakes = earthquakeResult.status === 'fulfilled' ? earthquakeResult.value : [];
    const localReport = buildLocalIntelligence(lat, lng, context, weather, earthquakes);
    const apiKey = process.env.GEMINI_API_KEY?.trim();

    let result: Record<string, unknown> = {
      report: `${localReport}\n\n> AI enrichment is not configured; this report was generated directly from the named data sources.`,
      mode: 'local-fallback',
      model: null,
      sources: ['open-meteo', 'usgs'],
    };

    if (apiKey) {
      try {
        const enriched = await enrichIntelligence(localReport, context, useDeepThinking, apiKey);
        result = {
          report: `${enriched.report}\n\n---\n**Verified current sources:** Open-Meteo weather and USGS M4.5+ one-day seismic feed. Gemini provided narrative enrichment; verify important claims.`,
          mode: 'gemini-enriched',
          model: enriched.model,
          sources: ['open-meteo', 'usgs', 'gemini'],
        };
      } catch (error) {
        console.error('Gemini enrichment unavailable; returning local report:', error);
        result = {
          report: `${localReport}\n\n> Gemini enrichment was unavailable, so AetherGlobe returned its verified source summary instead.`,
          mode: 'local-fallback',
          model: null,
          sources: ['open-meteo', 'usgs'],
          warning: 'Gemini enrichment unavailable',
        };
      }
    }

    setCached(cacheKey, result, 2 * 60_000);
    res.json(result);
  }));

  app.get('/api/weather', asyncRoute(async (req, res) => {
    const lat = parseCoordinate(req.query.lat, -90, 90, 'latitude');
    const lng = parseCoordinate(req.query.lng, -180, 180, 'longitude');
    res.json(await getWeatherSnapshot(lat, lng));
  }));

  app.get('/api/flights', asyncRoute(async (req, res) => {
    const { lamin, lamax, lomin, lomax } = parseBounds(req.query);
    const cacheKey = `flights:${lamin.toFixed(2)}:${lomin.toFixed(2)}:${lamax.toFixed(2)}:${lomax.toFixed(2)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&stats=0`;
    const response = await fetchWithTimeout(url, { headers: { 'User-Agent': 'AetherGlobe/1.0' } });
    if (!response.ok) throw Object.assign(new Error('Flight provider unavailable'), { status: 502 });
    const data = await response.json() as Record<string, unknown>;
    const flights = Object.values(data)
      .filter(Array.isArray)
      .map((flight: any) => ({
        id: flight[0],
        callsign: flight[16] || flight[13] || 'UNKNOWN',
        lat: flight[1],
        lng: flight[2],
        altitude: flight[4] ?? null,
        velocity: flight[5] ?? null,
        track: flight[3] ?? null,
        squawk: flight[7] ?? null,
        aircraft: flight[8] ?? null,
        registration: flight[9] ?? null,
      }))
      .filter((flight) => Number.isFinite(flight.lat) && Number.isFinite(flight.lng));

    const result = {
      flights,
      source: 'flightradar24-unofficial',
      timestamp: Date.now(),
      warning: 'Unofficial public feed; availability and accuracy are not guaranteed.',
    };
    setCached(cacheKey, result, 15_000);
    res.json(result);
  }));

  app.get('/api/live/usgs', asyncRoute(async (_req, res) => {
    res.json({ earthquakes: await getEarthquakes(), source: 'usgs', timestamp: Date.now() });
  }));

  app.get('/api/health', (_req, res) => {
    const configuredModel = normalizeGeminiModel(process.env.GEMINI_MODEL) || 'gemini-3.5-flash';
    res.json({
      status: 'ok',
      version: '4.3.0',
      intelligenceMode: process.env.GEMINI_API_KEY?.trim() ? 'gemini-with-local-fallback' : 'local-source-summary',
      configuredModel,
      fallbackModel: 'gemini-2.5-flash',
      cacheEntries: responseCache.size,
      feeds: ['open-meteo', 'usgs', 'flightradar24-unofficial'],
    });
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found' }));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }

  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status || (error.name === 'AbortError' ? 504 : 500);
    console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Upstream service error' : error.message });
  });

  httpServer.listen(PORT, '0.0.0.0', () => console.log(`AetherGlobe running on http://localhost:${PORT}`));
}

startServer().catch((error) => {
  console.error('Server startup failed', error);
  process.exit(1);
});
