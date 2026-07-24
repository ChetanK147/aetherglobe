# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring current location context with clearly identified public data sources.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- Current place name from OpenStreetMap Nominatim
- Current weather and air quality from Open-Meteo
- M4.5+ earthquake events from USGS
- Local dump1090 aircraft positions when configured
- Sampled Aviationstack live-position fallback and flight-number lookup when configured
- Live AISstream vessel positions in the persistent local Express runtime when configured
- OpenStreetMap/CARTO surface map
- Optional Google sign-in through Firebase

The former Tactical, Cinematic, and decorative aircraft-status modes were removed because they did not provide separate functional tools.

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime, or other operational decisions.

## No environment file is required

The application starts and remains useful without `.env.local`:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Without optional environment variables:

- place, weather, air quality, earthquake, and direct source-brief features work;
- aircraft use the existing unofficial public fallback;
- local dump1090, Aviationstack, and AISstream features remain disabled;
- the UI reports unavailable optional feeds instead of exposing placeholder credentials.

Node.js 22.4 or newer is required because the persistent AISstream integration uses the native server-side WebSocket implementation.

## Optional local configuration

Create `.env.local` only when enabling a private receiver or API-backed integration:

```bash
npm run setup:env
```

This copies `.env.example` only when `.env.local` does not already exist. The file is ignored by Git.

### Local dump1090 receiver

```text
DUMP1090_AIRCRAFT_URL=http://192.168.0.168/dump1090/data/aircraft.json
DUMP1090_MAX_POSITION_AGE_SECONDS=20
```

The receiver URL works only when the Express server is running on a computer that can reach that private address. ADS-B Radar can read the same dump1090 endpoint simultaneously.

### Aviationstack

```text
AVIATIONSTACK_API_KEY=your_real_aviationstack_key
AVIATIONSTACK_BASE_URL=https://api.aviationstack.com/v1
AVIATIONSTACK_TRAFFIC_CACHE_SECONDS=900
AVIATIONSTACK_MAX_LIVE_AGE_SECONDS=1800
```

Aviationstack is used for intentional flight-number lookups and as a sampled position fallback. Successful traffic snapshots are cached to reduce API usage.

### AISstream

```text
AISSTREAM_API_KEY=your_real_aisstream_key
AISSTREAM_URL=wss://stream.aisstream.io/v0/stream
AISSTREAM_MAX_POSITION_AGE_SECONDS=300
```

The browser never receives the AISstream key. The local Express process maintains one backend WebSocket, updates its geographic subscription when the selected region changes, and exposes normalized vessel snapshots through `/api/vessels`.

Restart `npm run dev` after changing `.env.local`.

Never put service keys in a `VITE_` variable, React component, screenshot, or committed file.

## Direct source brief

The source brief uses structured public endpoints rather than scraping arbitrary webpages. For each selected coordinate, the backend directly aggregates:

- OpenStreetMap Nominatim reverse geocoding
- Open-Meteo current weather
- Open-Meteo current air quality
- USGS M4.5+ one-day earthquake GeoJSON

No language model is used to rewrite or interpret the result.

## Aircraft source order

`GET /api/flights` follows this order:

1. Use fresh dump1090 positions when a configured local receiver is reachable.
2. When that receiver request fails, use Aviationstack records with usable live coordinates inside the selected bounds.
3. When no local receiver is configured but Aviationstack is configured, use a clearly labelled global sample of Aviationstack live-position records.
4. When Aviationstack is unavailable or has no usable positions, use the unofficial public aircraft fallback.

A healthy local receiver returning zero aircraft is treated as a valid empty sector. Aviationstack does not replace a healthy receiver merely because no aircraft are currently visible.

Aviationstack requests are capped at 100 active records. Many commercial-flight records omit live coordinates, so this is a sampled fallback rather than complete regional or global radar coverage. Cached positions are re-evaluated against the current time before being displayed.

## Flight lookup

Open **Status and sources → Flight Lookup**, enter an IATA or ICAO code such as `AI123` or `AIC123`, and submit it.

Lookup results are cached for 15 minutes. Fields can be missing because the upstream record may not include aircraft, route, terminal, gate, or live-position information.

## AISstream deployment behavior

AISstream is designed around a persistent WebSocket connection.

### Local Express

The local server can keep the connection open and display recent vessel positions in the selected sector.

### Public Netlify deployment

Netlify Functions are serverless and are not used as a continuous AISstream collector. On Netlify, `/api/vessels` returns `relay-required` instead of repeatedly opening short-lived upstream sockets.

Continuous public maritime traffic therefore requires a separate always-on relay on a persistent Node host, Raspberry Pi, VPS, or similar service. The relay should keep the AISstream connection open and provide normalized snapshots to the public application through an authenticated endpoint or shared store.

A Netlify Function also cannot reach the private `192.168.x.x` dump1090 receiver. Publishing local receiver observations requires an outbound bridge or relay.

## Netlify deployment

Use:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`
- Node version: `22`

Optional Aviationstack variables can be added under **Netlify → Site configuration → Environment variables**. Adding an AISstream key to Netlify alone does not create a persistent maritime feed; the relay described above is still required.

## API endpoints

- `POST /api/intelligence` — direct current source brief
- `GET /api/weather`
- `GET /api/flights`
- `GET /api/vessels`
- `GET /api/flight-lookup?flight=AI123`
- `GET /api/live/usgs`
- `GET /api/health`

`GET /api/health` reports optional integration status without returning keys or private receiver URLs.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| Place name | OpenStreetMap Nominatim | Cached reverse-geocoding result |
| Weather | Open-Meteo | Current coordinate-based observation |
| Air quality | Open-Meteo Air Quality | Current AQI and pollutant readings |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft positions | Local dump1090 receiver | Preferred when configured and reachable |
| Aircraft fallback | Aviationstack active flights | Optional sampled and cached live-position records |
| Final aircraft fallback | Unofficial public FlightRadar24 feed | Availability and accuracy are not guaranteed |
| Commercial flight lookup | Aviationstack | Optional and on demand; fields can be absent |
| Vessel positions | AISstream | Optional persistent backend WebSocket |
| Surface map | OpenStreetMap and CARTO | Basemap only |

## Security model

- `.env.local` is optional and ignored by Git.
- `.env.example` contains blank secret fields and safe defaults only.
- Service keys are read only by server code.
- The AISstream subscription is sent from the backend WebSocket.
- API routes validate inputs, limit request sizes, and apply rate limits.
- In-memory caches and rate limits are process-local and are not a distributed quota system.
- Firebase project identifiers do not replace authentication controls or Firestore rules.

## Validation

Pull requests run:

```bash
npm ci
npm run lint
npm test
npm run build
```

Tests cover coordinate validation, direct source aggregation, no-key behavior, dump1090 filtering, Aviationstack lookup and traffic fallback, cached live-position aging, AISstream subscription formatting, vessel normalization, and serverless relay guidance without using real credentials.
