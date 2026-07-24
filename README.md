# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring current location context with clearly identified public data sources.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- Current place name from OpenStreetMap Nominatim
- Current weather and air quality from Open-Meteo
- M4.5+ earthquake events from USGS
- Nearby aircraft from a local dump1090 receiver when configured
- Sampled Aviationstack live-position fallback when the configured receiver cannot be reached
- Sampled Aviationstack global live-position mode when no local receiver exists in the runtime
- Automatic fallback to the existing unofficial public aircraft feed when neither local nor Aviationstack live positions are usable
- On-demand Aviationstack flight-number lookup for airline, route, schedule, aircraft and available live fields
- Source-backed location intelligence that works without an AI key
- Optional OpenAI enrichment through the shared server-side API
- On-demand Aviationstack commercial-flight lookup
- Live maritime positions from AISstream in the persistent local Express runtime
- Direct source brief with no OpenAI or other language-model dependency
- Local Express development and Netlify Functions deployment
- Optional Google sign-in through Firebase
- OpenStreetMap/CARTO surface map

The former Tactical and Cinematic display buttons were removed because they only activated decorative overlays and did not provide separate operational tools.

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime or other operational decisions.

## Why the source brief does not scrape arbitrary sites

The source brief uses structured public endpoints instead of scraping miscellaneous webpages. This is more reliable, easier to attribute, and less likely to break when a website changes its layout.

For each selected coordinate, the backend directly aggregates:

- OpenStreetMap Nominatim reverse geocoding
- Open-Meteo current weather
- Open-Meteo current air quality
- USGS M4.5+ one-day earthquake GeoJSON

No language model is used to rewrite or interpret the data.

## Requirements

- Node.js 20 or newer
- An Aviationstack API key when flight-number lookup or Aviationstack traffic fallback is desired
- An OpenAI API key only when AI-enriched reports are desired
- A configured Firebase web project when authentication is required
- Node.js 22.4 or newer for the native server-side WebSocket used by AISstream
- An AISstream API key for maritime traffic
- An Aviationstack API key only when commercial flight lookup is desired
- A configured Firebase web project only when authentication is required

## Local setup

1. Install dependencies:

   ```bash
   npm ci
   ```

2. Create your private local environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Add your AISstream key to `.env.local`:

   ```text
   AISSTREAM_API_KEY=your_real_aisstream_key
   AISSTREAM_URL=wss://stream.aisstream.io/v0/stream
   AISSTREAM_MAX_POSITION_AGE_SECONDS=300
   ```

   Do not add quotes, do not use a `VITE_` prefix, and do not commit `.env.local`. The repository already ignores `.env.local`.

4. Keep or adjust the local receiver and fallback settings:
4. Keep or adjust the local ADS-B receiver URL:

   ```text
   DUMP1090_AIRCRAFT_URL=http://192.168.0.168/dump1090/data/aircraft.json
   DUMP1090_MAX_POSITION_AGE_SECONDS=20

   AVIATIONSTACK_TRAFFIC_CACHE_SECONDS=900
   AVIATIONSTACK_MAX_LIVE_AGE_SECONDS=1800
   ```

   This private receiver address works only when the Express server is running on a Mac or another device connected to the same network. ADS-B Radar can continue reading the receiver at the same time.

5. Optionally add a server-only OpenAI key:
5. Optionally add Aviationstack:

   ```text
   AVIATIONSTACK_API_KEY=your_real_aviationstack_key
   AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1
   ```

6. Start AetherGlobe:

   ```bash
   npm run dev
   ```

The local Express server runs on `http://localhost:3000` by default. Restart it after changing `.env.local`.

## Aircraft source order

`GET /api/flights` uses this source order:

1. Read fresh positions directly from dump1090 when a receiver URL is configured and reachable.
2. If dump1090 cannot be reached, request active flights from Aviationstack and keep only records with usable live coordinates inside the requested bounds.
3. When no local receiver exists in the runtime, use the Aviationstack live records as a clearly marked global sample.
4. Convert Aviationstack altitude from metres to feet and horizontal speed from kilometres per hour to knots so the existing globe can consume the same normalized structure.
5. If Aviationstack is unavailable or supplies no usable live positions, use the existing unofficial public feed as the final fallback.

The Aviationstack layer is deliberately labelled as sampled. It requests a maximum of 100 active records, and many commercial-flight records can omit live position fields. It is not equivalent to complete regional or global ADS-B radar coverage.

Successful Aviationstack traffic responses are cached for the configured interval. The default is 15 minutes. This is suitable for prototype testing and occasional outages, but continuous use can consume API quota quickly. Increase the cache interval or use a plan with enough requests before relying on the fallback continuously.

## Using flight lookup
Open `http://localhost:3000`. Restart the server after changing `.env.local`.

Never put service keys in a `VITE_` variable, React component, screenshot, or committed file.

On-demand lookup results are cached for 15 minutes so repeated searches do not repeatedly consume API quota.
## AISstream behavior

AISstream is consumed only on the backend through:

```text
wss://stream.aisstream.io/v0/stream
```

When a location is selected, the local Express server subscribes to a bounding box approximately three degrees around that point. The server keeps one WebSocket connection open, safely updates the subscription when the selected region changes, normalizes vessel positions, and exposes the current in-memory snapshot through:

```text
AVIATIONSTACK_API_KEY=your_real_aviationstack_key
AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1
AVIATIONSTACK_TRAFFIC_CACHE_SECONDS=900
AVIATIONSTACK_MAX_LIVE_AGE_SECONDS=1800
OPENAI_API_KEY=your_optional_openai_key
OPENAI_MODEL=gpt-5.2
```

A Netlify Function cannot directly reach a private `192.168.x.x` receiver. With an Aviationstack key configured, the public runtime displays a global sample of Aviationstack records that contain live positions and uses the existing public feed if that sample is unavailable. Publishing your own receiver observations publicly still requires a separate outbound authenticated bridge.
GET /api/vessels?lamin=...&lamax=...&lomin=...&lomax=...
```

The browser never receives the AISstream key and never connects to AISstream directly.

The globe displays only recent position reports. Static ship messages are used to enrich an already observed vessel with fields such as name, type, and destination when available.

### Public Netlify limitation

Netlify Functions are serverless and are not treated as a persistent AISstream collector. On Netlify, `/api/vessels` returns a clear `relay-required` status rather than repeatedly opening short-lived upstream WebSockets.

To show AISstream traffic continuously on the public website, deploy a small always-on relay on a persistent Node host, Raspberry Pi, VPS, Fly.io, Render, or similar service. The relay should keep the AISstream connection open and publish normalized snapshots to a shared database or authenticated endpoint consumed by Netlify.

The Aviationstack endpoints validate input, cap upstream result counts, and cache successful responses. The in-memory cache and rate limiter are best-effort safeguards for a warm runtime; they are not a globally shared production quota.
## Flight data

The local dump1090 receiver remains the preferred source for aircraft positions. Aviationstack is used only for deliberate flight-number lookups from the Status panel. The existing public aircraft fallback remains non-authoritative and must not be used operationally.

## API endpoints

- `POST /api/intelligence` — direct current source brief
- `GET /api/weather`
- `GET /api/flights`
- `GET /api/vessels`
- `GET /api/flight-lookup?flight=AI123`
- `GET /api/live/usgs`
- `GET /api/health`

`GET /api/health` reports whether ADS-B, Aviationstack, and AISstream are configured without exposing keys.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Place name | OpenStreetMap Nominatim | Cached reverse-geocoding result |
| Weather | Open-Meteo | Current coordinate-based observation |
| Air quality | Open-Meteo Air Quality | Current AQI and pollutant readings |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft positions | Local dump1090 receiver | Preferred locally; limited by antenna coverage and receiver availability |
| Aircraft fallback | Aviationstack active flights | Sampled and cached; only records with live positions are plotted |
| Final aircraft fallback | Unofficial public FlightRadar24 feed | Used when local and Aviationstack sources are unusable |
| Flight lookup | Aviationstack | On-demand commercial flight details; fields may be missing |
| Intelligence | Open-Meteo + USGS, optionally OpenAI | Local source summary always remains available |
| Surface map | OpenStreetMap and CARTO | Basemap only; no live incidents or routing |
| Aircraft positions | Local dump1090 receiver | Preferred locally; limited by receiver coverage |
| Commercial flight lookup | Aviationstack | On demand; fields can be absent |
| Vessel positions | AISstream | Persistent backend WebSocket; beta service |
| Surface map | OpenStreetMap and CARTO | Basemap only |

## Security model

- `.env.local` is ignored by Git.
- `.env.example` contains placeholders only.
- AISstream and Aviationstack keys are read only by server code.
- The AISstream subscription is sent within the backend WebSocket connection.
- API responses are rate-limited and do not include credentials.
- Firebase project identifiers do not replace authentication controls or Firestore rules.

## Validation

Pull requests run:

```bash
npm ci
npm run lint
npm test
npm run build
```

Unit tests cover coordinate validation, legitimate zero coordinates, model selection, Aviationstack key handling and response normalization, lookup caching, dump1090 position filtering, regional receiver-outage fallback, and global Aviationstack live-position mode without calling live services.
Tests cover coordinate validation, direct source aggregation, zero coordinates, AISstream serverless behavior, persistent WebSocket subscription formatting, vessel normalization, Aviationstack lookup, and dump1090 position filtering without using real credentials.
