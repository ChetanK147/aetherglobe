import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Proxy for Live Flights (using FlightRadar24 as backend since OpenSky timeouts)
  app.get("/api/flights", async (req, res) => {
    const { lamin, lomin, lamax, lomax } = req.query;
    if (!lamin || !lomin || !lamax || !lomax) {
      return res.status(400).json({ error: "Missing bounding box parameters" });
    }

    try {
      // url format bounds: lamax,lamin,lomin,lomax
      const url = `https://data-cloud.flightradar24.com/zones/fcgi/feed.js?bounds=${lamax},${lamin},${lomin},${lomax}&faa=1&satellite=1&mlat=1&flarm=1&adsb=1&gnd=1&air=1&vehicles=0&estimated=1&maxage=14400&gliders=0&stats=0`;
      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
        }
      });
      
      if (!response.ok) throw new Error('API limits reached');
      
      const data = await response.json();
      
      // Normalize to AetherGlobe format
      const normalizedFlights = Object.values(data)
        .filter((v: any) => Array.isArray(v)) // ignore stats/version keys
        .map((f: any) => ({
          callsign: f[16] || f[13] || "UNKNOWN",
          origin: f[11] || "UNKNOWN",
          lng: f[2],
          lat: f[1],
          velocity: f[5],
          altitude: f[4], // in feet
          trueTrack: f[3]
        }));

      res.json({ flights: normalizedFlights });
    } catch (error) {
      console.warn("Flight fetch failed, returning mock fallback:", error);
      res.json({ flights: [] });
    }
  });

  // Proxy for CheckWX METAR data
  app.get("/api/metar/:icao", async (req, res) => {
    const { icao } = req.params;
    const apiKey = process.env.CHECKWX_API_KEY;

    if (!apiKey) {
      // Mock data if no API key is provided
      return res.json({
        data: [{
          icao,
          raw_text: `${icao} 171351Z 24010KT 9999 FEW030 15/10 Q1013 NOSIG`,
          observed: new Date().toISOString(),
          temperature: { celsius: 15 },
          wind: { speed_kts: 10, degrees: 240 },
          visibility: { miles: 10 },
          clouds: [{ code: "FEW", base_feet_agl: 3000 }]
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
      res.status(500).json({ error: "Failed to fetch METAR data" });
    }
  });

  // Health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
