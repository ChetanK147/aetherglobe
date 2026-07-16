# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring location context with a small set of clearly identified data sources.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- Current weather from Open-Meteo
- M4.5+ earthquake events from USGS
- Nearby aircraft from an unofficial public FlightRadar24 feed
- Source-backed location intelligence that works without an AI key
- Optional OpenAI enrichment through the shared server-side API
- Local Express development and Netlify Functions deployment
- Optional Google sign-in through Firebase
- OpenStreetMap/CARTO surface map

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime or other operational decisions.

## Requirements

- Node.js 20 or newer
- An OpenAI API key only when AI-enriched reports are desired
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

3. Optionally add a server-only OpenAI key to `.env.local`:

   ```bash
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-5.6-terra
   ```

   When no OpenAI key is configured—or when OpenAI is unavailable—the intelligence endpoint still returns a coordinate summary built directly from Open-Meteo and USGS data. The API falls back from the configured model to `gpt-5.6-terra` and then `gpt-5.6-luna`.

4. Start the app:

   ```bash
   npm run dev
   ```

The local Express server runs on `http://localhost:3000` by default and uses the same shared API code as Netlify Functions.

## Netlify deployment

The repository includes `netlify.toml` and a Netlify Function that serves:

- `POST /api/intelligence`
- `GET /api/weather`
- `GET /api/flights`
- `GET /api/live/usgs`
- `GET /api/health`

Use these Netlify settings when linking the GitHub repository:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node version: 20

Set secrets in **Netlify → Site configuration → Environment variables** rather than committing them:

```text
OPENAI_API_KEY=your_key_here
OPENAI_MODEL=gpt-5.6-terra
```

The OpenAI key is optional. A deploy without it remains functional in local-source-summary mode. After the first deploy, add the generated Netlify domain to **Firebase Authentication → Settings → Authorized domains** if Google sign-in is enabled.

For a test deployment, use a Netlify Deploy Preview before publishing to production.

## Security model

`OPENAI_API_KEY` is read only by `server.ts` or the Netlify Function runtime. Never expose it with a `VITE_` prefix or inject it through `vite.config.ts`, because Vite variables are delivered to the browser.

Firebase web configuration is stored in `firebase-applet-config.json`. Firebase API keys identify the project but do not replace Firestore rules, authorized domains or authentication controls.

The in-memory cache and rate limiter are best-effort safeguards. They persist during a warm Express process or warm serverless instance, but they are not a globally shared production quota. Use a shared rate-limit store before exposing a high-volume public deployment.

## Intelligence behavior

`POST /api/intelligence` always returns a report for valid coordinates:

1. Open-Meteo and USGS are queried for a verified local summary.
2. When `OPENAI_API_KEY` is present, the API attempts the configured model, defaulting to `gpt-5.6-terra`.
3. If that model fails, the API tries `gpt-5.6-luna`.
4. If OpenAI remains unavailable, the verified local summary is returned instead of an error.

`GET /api/health` reports whether the runtime is using OpenAI-with-fallback or local-source-summary mode.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Weather | Open-Meteo | Current coordinate-based observation |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft | Unofficial FlightRadar24 public feed | Can be delayed, incomplete or unavailable |
| Intelligence | Open-Meteo + USGS, optionally OpenAI | Local source summary always remains available |
| Surface map | OpenStreetMap and CARTO | Basemap only; no live incidents or routing |

## Validation

Pull requests run:

```bash
npm ci
npm run lint
npm run build
```

The CI smoke test starts the local Express adapter without an OpenAI key, checks `/api/health`, and verifies that `/api/intelligence` returns a substantial local fallback report. Netlify Functions are included in the TypeScript validation through `.github/workflows/ci.yml`.
