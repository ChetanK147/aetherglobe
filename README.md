# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring location context with a small set of clearly identified data sources.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- Current weather from Open-Meteo
- M4.5+ earthquake events from USGS
- Nearby aircraft from an unofficial public FlightRadar24 feed
- Server-side Gemini location analysis
- Optional Google sign-in through Firebase
- OpenStreetMap/CARTO surface map

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime or other operational decisions.

## Requirements

- Node.js 20 or newer
- A Gemini API key for AI reports
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

3. Add the server-only Gemini key to `.env.local`:

   ```bash
   GEMINI_API_KEY=your_key_here
   ```

4. Start the app:

   ```bash
   npm run dev
   ```

The development server runs on `http://localhost:3000` by default.

## Security model

`GEMINI_API_KEY` is read only by `server.ts`. Never expose it with a `VITE_` prefix or inject it through `vite.config.ts`, because Vite variables are delivered to the browser.

Firebase web configuration is stored in `firebase-applet-config.json`. Firebase API keys identify the project but do not replace Firestore rules, authorized domains or authentication controls.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Weather | Open-Meteo | Current coordinate-based observation |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft | Unofficial FlightRadar24 public feed | Can be delayed, incomplete or unavailable |
| AI analysis | Gemini via the Express backend | Generated output must be verified |
| Surface map | OpenStreetMap and CARTO | Basemap only; no live incidents or routing |

## Validation

Pull requests run:

```bash
npm run lint
npm run build
```

through `.github/workflows/ci.yml`.
