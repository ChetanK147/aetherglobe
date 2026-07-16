import express, { type NextFunction, type Request, type Response } from "express";
import path from "path";
import { createServer as createHttpServer } from "http";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";
import { LRUCache } from "lru-cache";
import { WebSocket, WebSocketServer } from "ws";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const REQUEST_TIMEOUT_MS = 12_000;
const cache = new LRUCache<string, unknown>({ max: 500, ttl: 60_000 });
const rateBuckets = new Map<string, { count: number; resetAt: number }>();

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function rateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const current = rateBuckets.get(key);
  const bucket = !current || current.resetAt <= now
    ? { count: 0, resetAt: now + 60_000 }
    : current;

  bucket.count += 1;
  rateBuckets.set(key, bucket);

  if (bucket.count > 120) {
    res.setHeader("Retry-After", Math.ceil((bucket.resetAt - now) / 1000));
    res.status(429).json({ error: "Too many requests" });
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

function parseBounds(query: Request["query"]) {
  const lamin = parseCoordinate(query.lamin, -90, 90, "lamin");
  const lamax = parseCoordinate(query.lamax, -90, 90, "lamax");
  const lomin = parseCoordinate(query.lomin, -180, 180, "lomin");
  const lomax = parseCoordinate(query.lomax, -180, 180, "lomax");
  if (lamin >= lamax || lomin >= lomax) {
    throw Object.assign(new Error("Invalid bounding box order"), { status: 400 });
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
  return cache.get(key) as T | undefined;
}

function setCached(key: string, value: unknown, ttl: number) {
  cache.set(key, value, { ttl });
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  app.disable("x-powered-by");
  app.use(express.json({ limit: "32kb" }));
  app.use("/api", rateLimit);

  app.post("/api/intelligence", asyncRoute(async (req, res) => {
    const lat = parseCoordinate(req.body?.lat, -90, 90, "latitude");
    const lng = parseCoordinate(req.body?.lng, -180, 180, "longitude");
    const context = typeof req.body?.context === "string" ? req.body.context.trim().slice(0, 1200) : "";
    const useDeepThinking = req.body?.useDeepThinking === true;
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      res.status(503).json({ error: "AI service is not configured" });
      return;
    }

    const ai = new GoogleGenAI({ apiKey });
    const config: Record<string, unknown> = useDeepThinking
      ? { tools: [{ googleSearch: {} }], thinkingConfig: { thinkingLevel: "HIGH" } }
      : {
          tools: [{ googleMaps: {} }],
          toolConfig: { retrievalConfig: { latLng: { latitude: lat, longitude: lng } } },
        };

    const response = await (ai.models as any).generateContent({
      model: useDeepThinking ? "gemini-3.1-pro-preview" : "gemini-3-flash-preview",
      contents: [{
        role: "user",
        parts: [{ text: `You are AetherAI, a global monitoring assistant. Analyze coordinates (${lat}, ${lng}). User context: ${context || "General location overview"}. Clearly distinguish verified facts from estimates. Use concise sections for Weather, Mobility, Logistics, Hazards, and Sources.` }],
      }],
      config,
    });

    res.json({ report: response.text || "No intelligence report returned." });
  }));

  app.get("/api/weather", asyncRoute(async (req, res) => {
    const lat = parseCoordinate(req.query.lat, -90, 90, "latitude");
    const lng = parseCoordinate(req.query.lng, -180, 180, "longitude");
    const cacheKey = `weather:${lat.toFixed(3)}:${lng.toFixed(3)}`;
    const cached = getCached(cacheKey);
    if (cached) return void res.json(cached);

    const url = new URL("https://api.open-meteo.com/v1/forecast");
    url.searchParams.set("latitude", String(lat));
    url.searchParams.set("longitude", String(lng));
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m");
    url.searchParams.set("timezone", "auto");

    const response = await fetchWithTimeout(url.toString());
    if (!response.ok) throw Object.assign(new Error("Weather provider unavailable"), { status: 502 });
    const data = await response.json() as any;
    const result = {
      temp: data.current?.temperature_2m ?? null,
      humidity: data.current?.relative_humidity_2m ?? null,
      windSpeed: data.current?.wind_speed_10m ?? null,
      weatherCode: data.current?.weather_code ?? null,
      observed: data.current?.time ?? null,
      source: "open-meteo",
      simulated: false,
    };
    setCached(cacheKey, result, 5 * 60_000);
    res.json(result);
  }));

  app.get("/api/live/adsb", asyncRoute(async (req, res) => {
    const { lamin, lamax, lomin, lomax } = parseBounds(req.query);
    const cacheKey = `adsb:${lamin}:${lomin}:${lamax}:${lomax}`;
    const cached = getCached(cacheKey);
    if (cached) return void res.json(cached);

    const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&stats=0`;
    const response = await fetchWithTimeout(url, { headers: { "User-Agent": "AetherGlobe/1.0" } });
    if (!response.ok) throw Object.assign(new Error("Flight provider unavailable"), { status: 502 });
    const data = await response.json() as Record<string, unknown>;
    const aircraft = Object.values(data).filter(Array.isArray).map((f: any) => ({
      id: f[0], callsign: f[16] || f[13] || "UNKNOWN", lat: f[1], lng: f[2],
      altitude: f[4], velocity: f[5], track: f[3], squawk: f[7], aircraft: f[8], registration: f[9],
    })).filter((item) => Number.isFinite(item.lat) && Number.isFinite(item.lng));
    const result = { aircraft, source: "flightradar24-unofficial", simulated: false, timestamp: Date.now() };
    setCached(cacheKey, result, 15_000);
    res.json(result);
  }));

  app.get("/api/flights", asyncRoute(async (req, res) => {
    const { lamin, lamax, lomin, lomax } = parseBounds(req.query);
    const response = await fetch(`http://127.0.0.1:${PORT}/api/live/adsb?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`);
    const data = await response.json() as any;
    res.status(response.status).json({ flights: data.aircraft || [], source: data.source, simulated: data.simulated });
  }));

  app.get("/api/live/usgs", asyncRoute(async (_req, res) => {
    const cacheKey = "usgs:global";
    const cached = getCached(cacheKey);
    if (cached) return void res.json(cached);
    const response = await fetchWithTimeout("https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson");
    if (!response.ok) throw Object.assign(new Error("USGS unavailable"), { status: 502 });
    const data = await response.json() as any;
    const earthquakes = (data.features || []).slice(0, 100).map((f: any) => ({
      id: f.id, magnitude: f.properties.mag, place: f.properties.place, time: f.properties.time,
      lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0], depth: f.geometry.coordinates[2], url: f.properties.url,
    }));
    const result = { earthquakes, source: "usgs", simulated: false, timestamp: Date.now() };
    setCached(cacheKey, result, 60_000);
    res.json(result);
  }));

  app.get("/api/live/nasa-firms", asyncRoute(async (_req, res) => {
    if (!process.env.NASA_API_KEY) {
      res.status(503).json({ fires: [], source: "nasa-firms", simulated: false, error: "NASA_API_KEY is not configured" });
      return;
    }
    const cacheKey = "nasa-firms:global";
    const cached = getCached(cacheKey);
    if (cached) return void res.json(cached);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().split("T")[0];
    const response = await fetchWithTimeout(`https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.NASA_API_KEY}/VIIRS_SNPP_NRT/world/1/${yesterday}`);
    if (!response.ok) throw Object.assign(new Error("NASA FIRMS unavailable"), { status: 502 });
    const text = await response.text();
    const fires = text.split("\n").slice(1).filter(Boolean).map((line) => {
      const [lat, lng, brightness, scan, track, acqDate, acqTime, satellite, instrument, confidence, version, brightT31, frp] = line.split(",");
      return { lat: Number(lat), lng: Number(lng), brightness: Number(brightness), confidence, acqDate, acqTime, satellite, instrument, frp: Number(frp) };
    }).filter((fire) => Number.isFinite(fire.lat) && Number.isFinite(fire.lng)).slice(0, 500);
    const result = { fires, source: "nasa-firms", simulated: false, timestamp: Date.now() };
    setCached(cacheKey, result, 60_000);
    res.json(result);
  }));

  app.get("/api/live/marine", (req, res) => {
    const { lamin, lamax, lomin, lomax } = parseBounds(req.query);
    res.json({ vessels: [], bounds: { lamin, lamax, lomin, lomax }, source: "demo", simulated: true, message: "AIS provider not configured" });
  });

  app.get("/api/live/gtfs/:city", (req, res) => {
    res.json({ routes: [], stops: [], alerts: [], city: req.params.city.slice(0, 80), source: "demo", simulated: true, message: "GTFS provider not configured" });
  });

  app.get("/api/live/tomtom-traffic", (req, res) => {
    const bounds = parseBounds(req.query);
    res.json({ incidents: [], flows: [], bounds, source: "demo", simulated: true, message: "Traffic provider not configured" });
  });

  app.get("/api/metar/:icao", asyncRoute(async (req, res) => {
    const icao = req.params.icao.toUpperCase();
    if (!/^[A-Z0-9]{4}$/.test(icao)) {
      res.status(400).json({ error: "Invalid ICAO code" });
      return;
    }
    if (!process.env.CHECKWX_API_KEY) {
      res.status(503).json({ data: [], source: "checkwx", simulated: false, error: "CHECKWX_API_KEY is not configured" });
      return;
    }
    const response = await fetchWithTimeout(`https://api.checkwx.com/metar/${icao}/decoded`, { headers: { "X-API-Key": process.env.CHECKWX_API_KEY } });
    if (!response.ok) throw Object.assign(new Error("METAR provider unavailable"), { status: 502 });
    res.json(await response.json());
  }));

  wss.on("connection", (ws, req) => {
    const source = req.url?.split("/").pop() || "unknown";
    ws.send(JSON.stringify({ type: "status", source, simulated: true, message: "Real-time provider not configured", timestamp: Date.now() }));
    const interval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: "heartbeat", source, simulated: true, timestamp: Date.now() }));
    }, 15_000);
    ws.on("close", () => clearInterval(interval));
  });

  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", version: "4.1.0", aiConfigured: Boolean(process.env.GEMINI_API_KEY), cacheEntries: cache.size });
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status || (error.name === "AbortError" ? 504 : 500);
    console.error(error);
    res.status(status).json({ error: status >= 500 ? "Upstream service error" : error.message });
  });

  httpServer.listen(PORT, "0.0.0.0", () => console.log(`AetherGlobe running on http://localhost:${PORT}`));
}

startServer().catch((error) => {
  console.error("Server startup failed", error);
  process.exit(1);
});
