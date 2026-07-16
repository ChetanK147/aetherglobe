import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import { LRUCache } from 'lru-cache';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const REQUEST_TIMEOUT_MS = 12_000;
const responseCache = new LRUCache<string, unknown>({ max: 500, ttl: 60_000 });
const rateBuckets = new LRUCache<string, { count: number; resetAt: number }>({ max: 5_000, ttl: 60_000 });

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const existing = rateBuckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + 60_000 }
    : { count: existing.count + 1, resetAt: existing.resetAt };

  rateBuckets.set(key, bucket, { ttl: Math.max(1, bucket.resetAt - now) });
  if (bucket.count > 120) {
    res.setHeader('Retry-After', Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ error: 'Too many requests' });
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

async function fetchWithTimeout(url: string, init: RequestInit = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
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

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  app.disable('x-powered-by');
  app.use(express.json({ limit: '32kb' }));
  app.use('/api', rateLimit);

  app.post('/api/intelligence', asyncRoute(async (req, res) => {
    const lat = parseCoordinate(req.body?.lat, -90, 90, 'latitude');
    const lng = parseCoordinate(req.body?.lng, -180, 180, 'longitude');
    const context = typeof req.body?.context === 'string' ? req.body.context.trim().slice(0, 1_200) : '';
    const useDeepThinking = req.body?.useDeepThinking === true;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.status(503).json({ error: 'AI service is not configured' });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const config: Record<string, unknown> = useDeepThinking
      ? { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: 'HIGH' } }
      : {
          tools: [{ googleMaps: {} }],
          toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } },
        };

    const response = await (ai.models as any).generateContent({
      model: useDeepThinking ? 'gemini-3.1-pro-preview' : 'gemini-3-flash-preview',
      contents: [{
        role: 'user',
        parts: [{
          text: `You are AetherAI, a location intelligence assistant. Analyze coordinates (${lat}, ${lng}). User request: ${context || 'General location overview'}. Separate sourced facts from estimates. Never imply that AetherGlobe has live traffic, transit, maritime, police, military, or emergency-response feeds. Use concise sections and name sources where possible.`,
        }],
      }],
      config,
    });

    res.json({ report: response.text || 'No intelligence report returned.' });
  }));

  app.get('/api/weather', asyncRoute(async (req, res) => {
    const lat = parseCoordinate(req.query.lat, -90, 90, 'latitude');
    const lng = parseCoordinate(req.query.lng, -180, 180, 'longitude');
    const cacheKey = `weather:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude', String(lat));
    url.searchParams.set('longitude', String(lng));
    url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
    url.searchParams.set('timezone', 'auto');

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) throw Object.assign(new Error('Weather provider unavailable'), { status: 502 });
    const data = await response.json() as any;
    const result = {
      temp: data.current?.temperature_2m ?? null,
      humidity: data.current?.relative_humidity_2m ?? null,
      windSpeed: data.current?.wind_speed_10m ?? null,
      weatherCode: data.current?.weather_code ?? null,
      observed: data.current?.time ?? null,
      source: 'open-meteo',
    };
    setCached(cacheKey, result, 5 * 60_000);
    res.json(result);
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
    const cacheKey = 'usgs:m4.5-day';
    const cached = getCached(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }

    const response = await fetchWithTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
    if (!response.ok) throw Object.assign(new Error('USGS unavailable'), { status: 502 });
    const data = await response.json() as any;
    const earthquakes = (data.features || []).slice(0, 100).map((feature: any) => ({
      id: feature.id,
      magnitude: feature.properties.mag,
      place: feature.properties.place,
      time: feature.properties.time,
      lat: feature.geometry.coordinates[1],
      lng: feature.geometry.coordinates[0],
      depth: feature.geometry.coordinates[2],
      url: feature.properties.url,
    }));
    const result = { earthquakes, source: 'usgs', timestamp: Date.now() };
    setCached(cacheKey, result, 60_000);
    res.json(result);
  }));

  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      version: '4.2.0',
      aiConfigured: Boolean(process.env.GEMINI_API_KEY),
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
