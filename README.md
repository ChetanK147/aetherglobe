# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring location context with a small set of clearly identified data sources.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- Current weather from Open-Meteo
- M4.5+ earthquake events from USGS
- Nearby aircraft from an unofficial public FlightRadar24 feed
- Source-backed location intelligence that works without an AI key
- Optional Gemini enrichment through the Express backend
- Optional Google sign-in through Firebase
- OpenStreetMap/CARTO surface map

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime or other operational decisions.

## Requirements

- Node.js 20 or newer
- A Gemini API key only when AI-enriched reports are desired
- A configured Firebase web project when authentication is required

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create a local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Optionally add a server-only Gemini key to `.env.local`:

   ```bash
   GEMINI_API_KEY=your_key_here
   GEMINI_MODEL=gemini-3.5-flash
   ```

   When no Gemini key is configured—or when Gemini is unavailable—the intelligence endpoint still returns a coordinate summary built directly from Open-Meteo and USGS data. The server also falls back from the configured stable model to `gemini-2.5-flash`.

4. Start the app:

   ```bash
   npm run dev
   ```

The development server runs on `http://localhost:3000` by default.

## Security model

`GEMINI_API_KEY` is read only by `server.ts`. Never expose it with a `VITE_` prefix or inject it through `vite.config.ts`, because Vite variables are delivered to the browser.

Firebase web configuration is stored in `firebase-applet-config.json`. Firebase API keys identify the project but do not replace Firestore rules, authorized domains or authentication controls.

## Intelligence behavior

`POST /api/intelligence` always returns a report for valid coordinates:

1. Open-Meteo and USGS are queried for a verified local summary.
2. When `GEMINI_API_KEY` is present, the server attempts the configured stable model (default `gemini-3.5-flash`).
3. If that model fails, the server tries `gemini-2.5-flash`.
4. If Gemini remains unavailable, the verified local summary is returned instead of an error.

`GET /api/health` reports whether the server is using Gemini-with-fallback or local-source-summary mode.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Weather | Open-Meteo | Current coordinate-based observation |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft | Unofficial FlightRadar24 public feed | Can be delayed, incomplete or unavailable |
| Intelligence | Open-Meteo + USGS, optionally Gemini | Local source summary always remains available |
| Surface map | OpenStreetMap and CARTO | Basemap only; no live incidents or routing |

## Validation

Pull requests run:

```bash
npm ci
npm run lint
npm run build
```

through `.github/workflows/ci.yml`.
