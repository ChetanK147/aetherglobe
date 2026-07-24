# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring location context with clearly identified data sources.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- Current weather from Open-Meteo
- M4.5+ earthquake events from USGS
- Nearby aircraft from a local dump1090 receiver when configured
- Automatic fallback to the existing unofficial public aircraft feed when the local receiver is unavailable
- On-demand Aviationstack flight-number lookup for airline, route, schedule, aircraft and available live fields
- Source-backed location intelligence that works without an AI key
- Optional OpenAI enrichment through the shared server-side API
- Local Express development and Netlify Functions deployment
- Optional Google sign-in through Firebase
- OpenStreetMap/CARTO surface map

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime or other operational decisions.

## Requirements

- Node.js 20 or newer
- An Aviationstack API key only when flight-number lookup is desired
- An OpenAI API key only when AI-enriched reports are desired
- A configured Firebase web project when authentication is required

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create your private local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Open `.env.local` and replace this placeholder:

   ```text
   AVIATIONSTACK_API_KEY=PASTE_YOUR_AVIATIONSTACK_KEY_HERE
   ```

   with your real key:

   ```text
   AVIATIONSTACK_API_KEY=your_real_aviationstack_key
   ```

   Do not add quotes, do not use a `VITE_` prefix, and do not commit `.env.local`. The repository already ignores `.env.local`.

4. Keep or adjust the local receiver URL:

   ```text
   DUMP1090_AIRCRAFT_URL=http://192.168.0.168/dump1090/data/aircraft.json
   DUMP1090_MAX_POSITION_AGE_SECONDS=20
   ```

   This private address works only when the Express server is running on a Mac or another device connected to the same network as the receiver. ADS-B Radar can continue reading the receiver at the same time.

5. Optionally add a server-only OpenAI key:

   ```text
   OPENAI_API_KEY=your_key_here
   OPENAI_MODEL=gpt-5.2
   ```

6. Start AetherGlobe:

   ```bash
   npm run dev
   ```

The local Express server runs on `http://localhost:3000` by default. Restart it after changing `.env.local`.

## Using flight lookup

Open the **Status and sources** panel, expand **Flight Lookup**, enter a code such as `AI123` or `AIC123`, and press search.

Aviationstack is called only when a lookup is submitted. Results are cached for 15 minutes so repeated searches do not repeatedly consume API quota. It is not used as the high-frequency radar-position source.

The local dump1090 receiver remains the preferred source for aircraft positions inside its reception area. If it cannot be reached, AetherGlobe falls back to the existing unofficial public feed and clearly labels that limitation.

## API endpoints

The shared Express/Netlify API serves:

- `POST /api/intelligence`
- `GET /api/weather`
- `GET /api/flights`
- `GET /api/flight-lookup?flight=AI123`
- `GET /api/live/usgs`
- `GET /api/health`

`GET /api/health` reports whether the local receiver and Aviationstack are configured without exposing either URL credentials or API keys.

## Netlify deployment

Use these Netlify settings when linking the GitHub repository:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node version: 20

Add secrets under **Netlify → Site configuration → Environment variables**:

```text
AVIATIONSTACK_API_KEY=your_real_aviationstack_key
AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1
OPENAI_API_KEY=your_optional_openai_key
OPENAI_MODEL=gpt-5.2
```

Do not add `DUMP1090_AIRCRAFT_URL=http://192.168.0.168/...` to Netlify expecting it to work. A Netlify Function cannot reach a private address on your home network. The public deployment can use Aviationstack lookup, while publishing your local receiver data requires a separate outbound authenticated bridge.

For a test deployment, use a Netlify Deploy Preview before publishing to production.

## Security model

All service keys are read only by `server.ts` or the Netlify Function runtime. Never expose them with a `VITE_` prefix or inject them through `vite.config.ts`, because Vite variables are delivered to the browser.

`.env.local` is ignored by Git. `.env.example` contains placeholders only.

The Aviationstack endpoint validates flight codes, rate-limits lookups, caps upstream result count and caches successful responses. The in-memory cache and rate limiter are best-effort safeguards for a warm runtime; they are not a globally shared production quota.

Firebase web configuration is stored in `firebase-applet-config.json`. Firebase API keys identify the project but do not replace Firestore rules, authorized domains or authentication controls.

## Intelligence behavior

`POST /api/intelligence` always returns a report for valid coordinates:

1. Open-Meteo and USGS are queried for a verified local summary.
2. When `OPENAI_API_KEY` is present, the API attempts the configured model, defaulting to `gpt-5.2`.
3. If that model fails, the API tries `gpt-5-mini`.
4. If OpenAI remains unavailable, the verified local summary is returned instead of an error.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Weather | Open-Meteo | Current coordinate-based observation |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft positions | Local dump1090 receiver | Preferred locally; limited by antenna coverage and receiver availability |
| Aircraft fallback | Unofficial public FlightRadar24 feed | Used only when dump1090 is not configured or cannot be reached |
| Flight lookup | Aviationstack | On-demand commercial flight details; fields may be missing |
| Intelligence | Open-Meteo + USGS, optionally OpenAI | Local source summary always remains available |
| Surface map | OpenStreetMap and CARTO | Basemap only; no live incidents or routing |

## Validation

Pull requests run:

```bash
npm ci
npm run lint
npm test
npm run build
```

Unit tests cover coordinate validation, legitimate zero coordinates, model selection, Aviationstack key handling and response normalization, lookup caching, and dump1090 position filtering without calling live services.
