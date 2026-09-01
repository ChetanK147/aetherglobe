# AetherGlobe

AetherGlobe is a cinematic 3D globe for exploring current location context with clearly identified public data sources and OSINT-style source notes.

## Current capabilities

- Interactive Three.js globe and coordinate selection
- OSINT Brief from named public/open sources
- Current place name from OpenStreetMap Nominatim
- Current weather and air quality from Open-Meteo
- M4.5+ earthquake events from USGS
- Infrastructure signals from OpenStreetMap Overpass
- Recent public-event and news signals from GDELT DOC 2.0
- Local dump1090 aircraft positions when configured
- Sampled Aviationstack live-position fallback and flight-number lookup when configured
- Live AISstream vessel positions in the persistent local Express runtime when configured
- TomTom Orbis dark surface map with AetherGlobe aircraft overlays
- Optional Google sign-in through Firebase

The former Tactical, Cinematic, and decorative aircraft-status modes were removed because they did not provide separate functional tools.

AetherGlobe is an exploratory visualization. It is not suitable for aviation, emergency, traffic, military, maritime, targeting, surveillance, or other operational decisions.

## No environment file is required

The application starts and remains useful without `.env.local`:

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

Without optional environment variables:

- OSINT Brief, place, weather, air quality, earthquake, infrastructure and GDELT public-event signals work from public sources;
- aircraft use the existing unofficial public fallback;
- local dump1090, Aviationstack, AISstream, and TomTom features remain disabled;
- the TomTom surface map shows a clear configuration message rather than a broken tile layer.

Node.js 22.4 or newer is required because the persistent AISstream integration uses the native server-side WebSocket implementation.

## OSINT Brief

The left Sources panel is now an **OSINT Brief**. For each selected coordinate, `/api/osint` aggregates public data directly and returns a source-labelled Markdown report.

Included sections:

- location identity and coordinates;
- environmental snapshot;
- air quality;
- selected infrastructure within approximately 25 km;
- recent GDELT public-event/news signals from the last 24 hours;
- recent USGS M4.5+ seismic context;
- source confidence and limitations.

The OSINT Brief uses only public/open data and direct APIs. It does not hack, bypass login pages, collect private data, scrape social media, or use a language model for conclusions. GDELT matches are treated as signals, not confirmed incidents. OpenStreetMap/Overpass results are community-maintained; missing map data does not prove a feature is absent.

## Optional local configuration

Create `.env.local` only when enabling a private receiver or API-backed integration:

```bash
npm run setup:env
```

This copies `.env.example` only when `.env.local` does not already exist. The file is ignored by Git.

### TomTom surface map

```text
TOMTOM_API_KEY=your_tomtom_browser_key
```

The Surface Map uses TomTom Orbis raster tiles in the `street-dark` style while keeping AetherGlobe's existing aircraft markers, heading rotation, popups, selected-coordinate marker, and fit-to-sector behavior.

A browser map key is included in tile requests and is therefore visible to site visitors. Restrict it to approved origins in the TomTom dashboard, including your production domain and deploy-preview domains. Do not reuse it as a server-side secret.

Restart `npm run dev` after changing the key.

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

Server-side keys such as Aviationstack and AISstream must never use a `VITE_` prefix. Never commit `.env.local`.

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

Set `TOMTOM_API_KEY` for production and deploy previews. The app exposes that browser map key through `/api/client-config` so the map can load without depending on Vite build-time injection. Optional Aviationstack variables can also be added under **Netlify → Site configuration → Environment variables**. Adding an AISstream key to Netlify alone does not create a persistent maritime feed; the relay described above is still required.

## API endpoints

- `GET /api/client-config` — browser-visible map configuration
- `POST /api/osint` — OSINT Brief from public/open sources
- `POST /api/intelligence` — legacy direct current source brief
- `GET /api/weather`
- `GET /api/flights`
- `GET /api/vessels`
- `GET /api/flight-lookup?flight=AI123`
- `GET /api/live/usgs`
- `GET /api/health`

`GET /api/health` reports optional server integration status without returning keys or private receiver URLs. The TomTom key is intentionally returned only through `/api/client-config` as a browser map configuration value.

## Data sources

| Feature | Source | Notes |
|---|---|---|
| OSINT Brief | Combined public sources | Source-labelled report; no language model |
| Place name | OpenStreetMap Nominatim | Cached reverse-geocoding result |
| Weather | Open-Meteo | Current coordinate-based observation |
| Air quality | Open-Meteo Air Quality | Current AQI and pollutant readings |
| Infrastructure | OpenStreetMap Overpass | Selected public map tags within approximately 25 km |
| News/event signals | GDELT DOC 2.0 | Recent articles matching location and event terms; signals only |
| Earthquakes | USGS | M4.5+ events from the past day |
| Aircraft positions | Local dump1090 receiver | Preferred when configured and reachable |
| Aircraft fallback | Aviationstack active flights | Optional sampled and cached live-position records |
| Final aircraft fallback | Unofficial public FlightRadar24 feed | Availability and accuracy are not guaranteed |
| Commercial flight lookup | Aviationstack | Optional and on demand; fields can be absent |
| Vessel positions | AISstream | Optional persistent backend WebSocket |
| Surface map | TomTom Orbis Map Display API | Dark raster basemap; aircraft overlays use separate sources |

## Security model

- `.env.local` is optional and ignored by Git.
- `.env.example` contains blank credential fields and safe defaults only.
- TomTom's browser key is intentionally exposed in tile requests and should be origin-restricted.
- Server-side service keys are read only by server code and must not use a `VITE_` prefix.
- The AISstream subscription is sent from the backend WebSocket.
- OSINT collection is limited to public/open sources and named APIs.
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

Tests cover coordinate validation, OSINT aggregation, infrastructure categorization, GDELT signal handling, direct source aggregation, no-key behavior, dump1090 filtering, Aviationstack lookup and traffic fallback, cached live-position aging, AISstream subscription formatting, vessel normalization, and serverless relay guidance without using real credentials.
