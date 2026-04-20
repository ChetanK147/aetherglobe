import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { WebSocketServer } from "ws";
import { createServer as createHttpServer } from "http";
import dotenv from "dotenv";

dotenv.config();

interface DataCache {
  data: any;
  timestamp: number;
  ttl: number;
}

const dataCache = new Map<string, DataCache>();

function getCached(key: string, ttl: number): any | null {
  const cached = dataCache.get(key);
  if (cached && Date.now() - cached.timestamp < cached.ttl) {
    return cached.data;
  }
  return null;
}

function setCache(key: string, data: any, ttl: number) {
  dataCache.set(key, { data, timestamp: Date.now(), ttl });
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const wss = new WebSocketServer({ server: httpServer });
  const PORT = 3000;

  app.use(express.json());

  // ADS-B Exchange Proxy
  app.get("/api/live/adsb", async (req, res) => {
    const { lamin, lomin, lamax, lomax } = req.query;
    if (!lamin || !lomin || !lamax || !lomax) {
      return res.status(400).json({ error: "Missing bounding box parameters" });
    }

    const cacheKey = `adsb:${lamin}:${lomin}:${lamax}:${lomax}`;
    const cached = getCached(cacheKey, 15000);
    if (cached) return res.json(cached);

    try {
      const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&gliders=0&stats=0`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (!response.ok) throw new Error('API limits reached');

      const data = await response.json();
      const aircraft = Object.values(data)
        .filter((v: any) => Array.isArray(v))
        .map((f: any) => ({
          id: f[0],
          callsign: f[16] || f[13] || "UNKNOWN",
          lat: f[1],
          lng: f[2],
          altitude: f[4],
          velocity: f[5],
          track: f[3],
          squawk: f[7],
          aircraft: f[8],
          registration: f[9],
          timestamp: Date.now()
        }));

      const result = { aircraft, source: 'adsb', timestamp: Date.now() };
      setCache(cacheKey, result, 15000);
      res.json(result);
    } catch (error) {
      console.error('ADSB fetch failed:', error);
      res.json({ aircraft: [], source: 'adsb' });
    }
  });

  // Marine Traffic Proxy
  app.get("/api/live/marine", async (req, res) => {
    const { lamin, lomin, lamax, lomax } = req.query;
    const cacheKey = `marine:${lamin}:${lomin}:${lamax}:${lomax}`;
    const cached = getCached(cacheKey, 30000);
    if (cached) return res.json(cached);

    try {
      const vessels = [
        {
          mmsi: "211258520",
          lat: parseFloat(lamin as string) + 2,
          lng: parseFloat(lomin as string) + 2,
          name: "MSC GULSUN",
          type: "CONTAINER_SHIP",
          speed: 18.5,
          heading: 45,
          timestamp: Date.now()
        }
      ];

      const result = { vessels, source: 'marine', timestamp: Date.now() };
      setCache(cacheKey, result, 30000);
      res.json(result);
    } catch (error) {
      console.error('Marine fetch failed:', error);
      res.json({ vessels: [], source: 'marine' });
    }
  });

  // USGS Earthquakes Proxy
  app.get("/api/live/usgs", async (req, res) => {
    const cacheKey = "usgs:global";
    const cached = getCached(cacheKey, 60000);
    if (cached) return res.json(cached);

    try {
      const response = await fetch(
        'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/significant_month.geojson'
      );
      const data = await response.json();

      const earthquakes = data.features.map((f: any) => ({
        magnitude: f.properties.mag,
        depth: f.geometry.coordinates[2],
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        place: f.properties.place,
        time: f.properties.time,
        timestamp: Date.now()
      })).slice(0, 50);

      const result = { earthquakes, source: 'usgs', timestamp: Date.now() };
      setCache(cacheKey, result, 60000);
      res.json(result);
    } catch (error) {
      console.error('USGS fetch failed:', error);
      res.json({ earthquakes: [], source: 'usgs' });
    }
  });

  // NASA FIRMS Fire Data Proxy
  app.get("/api/live/nasa-firms", async (req, res) => {
    const cacheKey = "nasa-firms:global";
    const cached = getCached(cacheKey, 60000);
    if (cached) return res.json(cached);

    try {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];

      const response = await fetch(
        `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${process.env.NASA_API_KEY}/VIIRS_SNPP_NRT/world/10/${yesterday}`
      );
      const text = await response.text();
      const lines = text.split('\n').slice(1);

      const fires = lines.filter(l => l.length).map((line: string) => {
        const [lat, lng, confidence, acq_date, acq_time, satellite, instrument, frp] = line.split(',');
        return {
          lat: parseFloat(lat),
          lng: parseFloat(lng),
          confidence: parseInt(confidence),
          time: `${acq_date}T${acq_time}`,
          satellite,
          frp: parseFloat(frp),
          timestamp: Date.now()
        };
      }).slice(0, 100);

      const result = { fires, source: 'nasa-firms', timestamp: Date.now() };
      setCache(cacheKey, result, 60000);
      res.json(result);
    } catch (error) {
      console.error('NASA FIRMS fetch failed:', error);
      res.json({ fires: [], source: 'nasa-firms' });
    }
  });

  // GTFS Transit Proxy
  app.get("/api/live/gtfs/:city", async (req, res) => {
    const { city } = req.params;
    const cacheKey = `gtfs:${city}`;
    const cached = getCached(cacheKey, 45000);
    if (cached) return res.json(cached);

    const result = {
      routes: [],
      stops: [],
      alerts: [],
      source: 'gtfs',
      timestamp: Date.now()
    };

    setCache(cacheKey, result, 45000);
    res.json(result);
  });

  // TomTom Traffic Proxy
  app.get("/api/live/tomtom-traffic", async (req, res) => {
    const { lamin, lomin, lamax, lomax } = req.query;
    const cacheKey = `tomtom:${lamin}:${lomin}:${lamax}:${lomax}`;
    const cached = getCached(cacheKey, 20000);
    if (cached) return res.json(cached);

    try {
      const incidents = [];
      const flows = [];

      const result = { incidents, flows, source: 'tomtom', timestamp: Date.now() };
      setCache(cacheKey, result, 20000);
      res.json(result);
    } catch (error) {
      console.error('TomTom fetch failed:', error);
      res.json({ incidents: [], flows: [], source: 'tomtom' });
    }
  });

  // Proxy for Live Flights (FlightRadar24)
  app.get("/api/flights", async (req, res) => {
    const { lamin, lomin, lamax, lomax } = req.query;
    if (!lamin || !lomin || !lamax || !lomax) {
      return res.status(400).json({ error: "Missing bounding box parameters" });
    }

    try {
      const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&gliders=0&stats=0`;
      const response = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' }
      });

      if (!response.ok) throw new Error('API limits reached');

      const data = await response.json();
      const normalizedFlights = Object.values(data)
        .filter((v: any) => Array.isArray(v))
        .map((f: any) => ({
          callsign: f[16] || f[13] || "UNKNOWN",
          origin: f[11] || "UNKNOWN",
          lng: f[2],
          lat: f[1],
          velocity: f[5],
          altitude: f[4],
          trueTrack: f[3]
        }));

      res.json({ flights: normalizedFlights });
    } catch (error) {
      console.warn("Flight fetch failed:", error);
      res.json({ flights: [] });
    }
  });

  // CheckWX METAR Proxy
  app.get("/api/metar/:icao", async (req, res) => {
    const { icao } = req.params;
    const apiKey = process.env.CHECKWX_API_KEY;

    if (!apiKey) {
      return res.json({
        data: [{
          icao,
          raw_text: `${icao} 171351Z 24010KT 9999 FEW030 15/10 Q1013 NOSIG`,
          observed: new Date().toISOString(),
          temperature: { celsius: 15 },
          wind: { speed_kts: 10, degrees: 240 },
          visibility: { miles: 10 }
        }]
      });
    }

    try {
      const response = await fetch(`https://api.checkwx.com/metar/${icao}/decoded`, {
        headers: { "X-API-Key": apiKey }
      });
      const data = await response.json();
      res.json(data);
    } catch (error) {
      res.json({ data: [] });
    }
  });

  // WebSocket streams
  wss.on('connection', (ws, req) => {
    const url = req.url;

    if (url?.includes('/ws/live/adsb')) {
      const interval = setInterval(() => {
        const data = {
          type: 'adsb_update',
          aircraft: Math.floor(Math.random() * 500),
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(data));
      }, 5000);

      ws.on('close', () => clearInterval(interval));
    }

    if (url?.includes('/ws/live/marine')) {
      const interval = setInterval(() => {
        const data = {
          type: 'marine_update',
          vessels: Math.floor(Math.random() * 200),
          timestamp: Date.now()
        };
        ws.send(JSON.stringify(data));
      }, 10000);

      ws.on('close', () => clearInterval(interval));
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", version: "pro" });
  });

  // Vite middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`AetherGlobe Pro running on http://localhost:${PORT}`);
  });
}

startServer();
