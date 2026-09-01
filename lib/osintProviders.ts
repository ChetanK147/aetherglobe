import { LRUCache } from 'lru-cache';

const REQUEST_TIMEOUT_MS = 12_000;
const osintCache = new LRUCache<string, unknown>({ max: 250, ttl: 2 * 60_000 });

interface WeatherSnapshot {
  temp: number | null;
  humidity: number | null;
  windSpeed: number | null;
  weatherCode: number | null;
  observed: string | null;
}

interface AirQualitySnapshot {
  usAqi: number | null;
  pm25: number | null;
  pm10: number | null;
  nitrogenDioxide: number | null;
  ozone: number | null;
  observed: string | null;
}

interface PlaceSnapshot {
  displayName: string | null;
  locality: string | null;
  region: string | null;
  country: string | null;
  countryCode: string | null;
}

interface Earthquake {
  id: string;
  magnitude: number | null;
  place: string;
  time: number;
  lat: number;
  lng: number;
  depth: number | null;
  url: string;
}

interface InfrastructureItem {
  id: string;
  label: string;
  category: InfrastructureCategory;
  tags: Record<string, string>;
}

type InfrastructureCategory =
  | 'air'
  | 'maritime'
  | 'road'
  | 'rail'
  | 'power'
  | 'industrial'
  | 'water'
  | 'emergency'
  | 'public-safety'
  | 'military-public-map-tag';

interface InfrastructureSummary {
  source: 'openstreetmap-overpass';
  count: number;
  counts: Record<InfrastructureCategory, number>;
  examples: InfrastructureItem[];
  confidence: 'medium' | 'low';
  warning: string;
}

interface GdeltArticle {
  title: string;
  url: string;
  domain: string | null;
  seendate: string | null;
  socialimage?: string | null;
  sourceCountry?: string | null;
  language?: string | null;
}

interface GdeltSummary {
  source: 'gdelt-doc-2';
  query: string | null;
  articles: GdeltArticle[];
  confidence: 'medium' | 'low';
  warning: string;
}

function parseCoordinate(value: unknown, min: number, max: number, name: string) {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
    throw Object.assign(new Error(`Invalid ${name}`), { status: 400 });
  }
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw Object.assign(new Error(`Invalid ${name}`), { status: 400 });
  }
  return parsed;
}

function toNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function getCached<T>(key: string): T | undefined {
  return osintCache.get(key) as T | undefined;
}

function setCached(key: string, value: unknown, ttl: number) {
  osintCache.set(key, value, { ttl });
}

function boundingBox(lat: number, lng: number, radiusKm: number) {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
  return {
    south: Math.max(-90, lat - latDelta),
    west: Math.max(-180, lng - lngDelta),
    north: Math.min(90, lat + latDelta),
    east: Math.min(180, lng + lngDelta),
  };
}

async function getPlaceSnapshot(lat: number, lng: number): Promise<PlaceSnapshot> {
  const cacheKey = `osint-place:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = getCached<PlaceSnapshot>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://nominatim.openstreetmap.org/reverse');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lng));
  url.searchParams.set('zoom', '10');
  url.searchParams.set('addressdetails', '1');

  const response = await fetchWithTimeout(url.toString(), {
    headers: {
      Accept: 'application/json',
      'Accept-Language': 'en',
      'User-Agent': 'AetherGlobe-OSINT/1.0 (https://github.com/ChetanK147/aetherglobe)',
    },
  });
  if (!response.ok) throw new Error('OpenStreetMap place lookup unavailable');
  const data = await response.json() as {
    display_name?: string;
    address?: {
      city?: string;
      town?: string;
      village?: string;
      municipality?: string;
      county?: string;
      state?: string;
      region?: string;
      country?: string;
      country_code?: string;
    };
  };

  const result: PlaceSnapshot = {
    displayName: data.display_name ?? null,
    locality: data.address?.city
      ?? data.address?.town
      ?? data.address?.village
      ?? data.address?.municipality
      ?? data.address?.county
      ?? null,
    region: data.address?.state ?? data.address?.region ?? null,
    country: data.address?.country ?? null,
    countryCode: data.address?.country_code?.toUpperCase() ?? null,
  };
  setCached(cacheKey, result, 24 * 60 * 60_000);
  return result;
}

async function getWeatherSnapshot(lat: number, lng: number): Promise<WeatherSnapshot> {
  const cacheKey = `osint-weather:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = getCached<WeatherSnapshot>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m');
  url.searchParams.set('timezone', 'auto');

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw new Error('Weather provider unavailable');
  const data = await response.json() as {
    current?: {
      temperature_2m?: number;
      relative_humidity_2m?: number;
      weather_code?: number;
      wind_speed_10m?: number;
      time?: string;
    };
  };
  const result = {
    temp: data.current?.temperature_2m ?? null,
    humidity: data.current?.relative_humidity_2m ?? null,
    windSpeed: data.current?.wind_speed_10m ?? null,
    weatherCode: data.current?.weather_code ?? null,
    observed: data.current?.time ?? null,
  };
  setCached(cacheKey, result, 5 * 60_000);
  return result;
}

async function getAirQualitySnapshot(lat: number, lng: number): Promise<AirQualitySnapshot> {
  const cacheKey = `osint-air-quality:${lat.toFixed(3)}:${lng.toFixed(3)}`;
  const cached = getCached<AirQualitySnapshot>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://air-quality-api.open-meteo.com/v1/air-quality');
  url.searchParams.set('latitude', String(lat));
  url.searchParams.set('longitude', String(lng));
  url.searchParams.set('current', 'us_aqi,pm2_5,pm10,nitrogen_dioxide,ozone');
  url.searchParams.set('timezone', 'auto');

  const response = await fetchWithTimeout(url.toString());
  if (!response.ok) throw new Error('Air-quality provider unavailable');
  const data = await response.json() as {
    current?: {
      us_aqi?: number;
      pm2_5?: number;
      pm10?: number;
      nitrogen_dioxide?: number;
      ozone?: number;
      time?: string;
    };
  };
  const result = {
    usAqi: data.current?.us_aqi ?? null,
    pm25: data.current?.pm2_5 ?? null,
    pm10: data.current?.pm10 ?? null,
    nitrogenDioxide: data.current?.nitrogen_dioxide ?? null,
    ozone: data.current?.ozone ?? null,
    observed: data.current?.time ?? null,
  };
  setCached(cacheKey, result, 10 * 60_000);
  return result;
}

async function getEarthquakes(): Promise<Earthquake[]> {
  const cacheKey = 'osint-usgs:m4.5-day';
  const cached = getCached<Earthquake[]>(cacheKey);
  if (cached) return cached;

  const response = await fetchWithTimeout('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_day.geojson');
  if (!response.ok) throw new Error('USGS unavailable');
  const data = await response.json() as {
    features?: Array<{
      id?: string;
      properties?: { mag?: number; place?: string; time?: number; url?: string };
      geometry?: { coordinates?: unknown[] };
    }>;
  };
  const earthquakes = (data.features || []).flatMap((feature): Earthquake[] => {
    const coordinates = feature.geometry?.coordinates;
    const lng = Number(coordinates?.[0]);
    const lat = Number(coordinates?.[1]);
    const depth = Number(coordinates?.[2]);
    if (!feature.id || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    return [{
      id: feature.id,
      magnitude: Number.isFinite(feature.properties?.mag) ? feature.properties?.mag ?? null : null,
      place: feature.properties?.place || 'Unknown location',
      time: Number.isFinite(feature.properties?.time) ? feature.properties?.time ?? 0 : 0,
      lat,
      lng,
      depth: Number.isFinite(depth) ? depth : null,
      url: feature.properties?.url || '',
    }];
  }).slice(0, 100);
  setCached(cacheKey, earthquakes, 60_000);
  return earthquakes;
}

function infrastructureCategory(tags: Record<string, string>): InfrastructureCategory | null {
  if (tags.aeroway) return 'air';
  if (tags.harbour || tags.man_made === 'pier' || tags.waterway === 'dock' || tags.amenity === 'ferry_terminal') return 'maritime';
  if (tags.highway && ['motorway', 'trunk', 'primary'].includes(tags.highway)) return 'road';
  if (tags.railway) return 'rail';
  if (tags.power) return 'power';
  if (tags.landuse === 'industrial' || tags.industrial || tags.man_made === 'works') return 'industrial';
  if (tags.natural === 'water' || tags.waterway) return 'water';
  if (tags.amenity === 'hospital' || tags.amenity === 'fire_station' || tags.emergency) return 'emergency';
  if (tags.amenity === 'police') return 'public-safety';
  if (tags.military) return 'military-public-map-tag';
  return null;
}

function infrastructureLabel(tags: Record<string, string>, category: InfrastructureCategory) {
  return tags.name
    || tags.operator
    || tags.ref
    || tags.iata
    || tags.icao
    || tags.aeroway
    || tags.amenity
    || tags.highway
    || tags.railway
    || tags.power
    || tags.landuse
    || category.replace(/-/g, ' ');
}

async function getInfrastructure(lat: number, lng: number): Promise<InfrastructureSummary> {
  const radiusKm = 25;
  const bounds = boundingBox(lat, lng, radiusKm);
  const cacheKey = `overpass:${bounds.south.toFixed(2)}:${bounds.west.toFixed(2)}:${bounds.north.toFixed(2)}:${bounds.east.toFixed(2)}`;
  const cached = getCached<InfrastructureSummary>(cacheKey);
  if (cached) return cached;

  const bbox = `${bounds.south},${bounds.west},${bounds.north},${bounds.east}`;
  const query = `[out:json][timeout:15];(
    nwr["aeroway"~"^(aerodrome|heliport|helipad)$"](${bbox});
    nwr["amenity"~"^(ferry_terminal|hospital|fire_station|police)$"](${bbox});
    nwr["harbour"](${bbox});
    nwr["man_made"~"^(pier|works)$"](${bbox});
    nwr["waterway"~"^(river|canal|dock)$"](${bbox});
    nwr["natural"="water"](${bbox});
    nwr["highway"~"^(motorway|trunk|primary)$"](${bbox});
    nwr["railway"~"^(rail|station)$"](${bbox});
    nwr["power"~"^(plant|substation|line)$"](${bbox});
    nwr["landuse"="industrial"](${bbox});
    nwr["industrial"](${bbox});
    nwr["emergency"](${bbox});
    nwr["military"](${bbox});
  );out tags center 150;`;

  const response = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      Accept: 'application/json',
      'User-Agent': 'AetherGlobe-OSINT/1.0 (https://github.com/ChetanK147/aetherglobe)',
    },
    body: new URLSearchParams({ data: query }),
  }, 18_000);
  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
  const data = await response.json() as { elements?: Array<{ id?: number; type?: string; tags?: Record<string, string> }> };

  const items: InfrastructureItem[] = [];
  for (const element of data.elements || []) {
    if (!element.id || !element.tags) continue;
    const category = infrastructureCategory(element.tags);
    if (!category) continue;
    items.push({
      id: `${element.type || 'osm'}:${element.id}`,
      label: infrastructureLabel(element.tags, category),
      category,
      tags: element.tags,
    });
  }

  const counts = {
    air: 0,
    maritime: 0,
    road: 0,
    rail: 0,
    power: 0,
    industrial: 0,
    water: 0,
    emergency: 0,
    'public-safety': 0,
    'military-public-map-tag': 0,
  } satisfies Record<InfrastructureCategory, number>;
  for (const item of items) counts[item.category] += 1;

  const result: InfrastructureSummary = {
    source: 'openstreetmap-overpass',
    count: items.length,
    counts,
    examples: items.slice(0, 12),
    confidence: items.length > 0 ? 'medium' : 'low',
    warning: 'OpenStreetMap is community-maintained. Absence of a mapped feature does not prove absence on the ground.',
  };
  setCached(cacheKey, result, 10 * 60_000);
  return result;
}

function safeGdeltTerm(value: string | null | undefined) {
  const cleaned = value?.replace(/["\\]/g, '').replace(/\s+/g, ' ').trim();
  if (!cleaned || cleaned.length < 3) return null;
  return cleaned.length > 80 ? cleaned.slice(0, 80) : cleaned;
}

function gdeltQuery(place: PlaceSnapshot | null) {
  const candidates = [place?.locality, place?.region, place?.country].map(safeGdeltTerm).filter(Boolean) as string[];
  const unique = [...new Set(candidates)].slice(0, 3);
  if (unique.length === 0) return null;
  const locationQuery = unique.map((term) => `"${term}"`).join(' OR ');
  return `(${locationQuery}) (flood OR cyclone OR storm OR earthquake OR airport OR port OR protest OR strike OR fire OR security OR accident OR disruption)`;
}

async function getGdeltSignals(place: PlaceSnapshot | null): Promise<GdeltSummary> {
  const query = gdeltQuery(place);
  if (!query) {
    return {
      source: 'gdelt-doc-2',
      query: null,
      articles: [],
      confidence: 'low',
      warning: 'No usable place name was available for GDELT search.',
    };
  }

  const cacheKey = `gdelt:${query.toLowerCase()}`;
  const cached = getCached<GdeltSummary>(cacheKey);
  if (cached) return cached;

  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'ArtList');
  url.searchParams.set('format', 'json');
  url.searchParams.set('timespan', '24h');
  url.searchParams.set('maxrecords', '10');
  url.searchParams.set('sort', 'DateDesc');

  const response = await fetchWithTimeout(url.toString(), { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`GDELT returned ${response.status}`);
  const data = await response.json().catch(() => ({})) as {
    articles?: Array<{
      title?: string;
      url?: string;
      domain?: string;
      seendate?: string;
      socialimage?: string;
      sourceCountry?: string;
      language?: string;
    }>;
  };
  const articles = (data.articles || [])
    .filter((article) => article.title && article.url)
    .slice(0, 6)
    .map((article) => ({
      title: article.title || 'Untitled article',
      url: article.url || '',
      domain: article.domain ?? null,
      seendate: article.seendate ?? null,
      socialimage: article.socialimage ?? null,
      sourceCountry: article.sourceCountry ?? null,
      language: article.language ?? null,
    }));

  const result: GdeltSummary = {
    source: 'gdelt-doc-2',
    query,
    articles,
    confidence: articles.length > 0 ? 'medium' : 'low',
    warning: 'GDELT is a global news index. Matching articles are signals, not verified incident confirmation.',
  };
  setCached(cacheKey, result, 10 * 60_000);
  return result;
}

function distanceKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const earthRadiusKm = 6_371;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatNumber(value: number | null, suffix = '', digits = 0) {
  return value === null ? 'Unavailable' : `${value.toFixed(digits)}${suffix}`;
}

function aqiCategory(aqi: number | null) {
  if (aqi === null) return 'Unavailable';
  if (aqi <= 50) return 'Good';
  if (aqi <= 100) return 'Moderate';
  if (aqi <= 150) return 'Unhealthy for sensitive groups';
  if (aqi <= 200) return 'Unhealthy';
  if (aqi <= 300) return 'Very unhealthy';
  return 'Hazardous';
}

function weatherLabel(code: number | null) {
  if (code === null) return 'Unavailable';
  if (code === 0) return 'Clear';
  if ([1, 2, 3].includes(code)) return 'Partly cloudy';
  if ([45, 48].includes(code)) return 'Fog';
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return 'Rain';
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow';
  if ([95, 96, 99].includes(code)) return 'Thunderstorm';
  return 'Mixed conditions';
}

function buildInfrastructureLines(infra: InfrastructureSummary | null) {
  if (!infra) return '- Infrastructure layer unavailable.';
  const lines = Object.entries(infra.counts)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => `- ${category.replace(/-/g, ' ')}: ${count}`);
  if (lines.length === 0) return '- No selected infrastructure tags were returned in the 25 km OpenStreetMap query.';
  const examples = infra.examples.length > 0
    ? `\n\nExamples: ${infra.examples.slice(0, 5).map((item) => item.label).join('; ')}`
    : '';
  return `${lines.join('\n')}${examples}`;
}

function buildNewsLines(news: GdeltSummary | null) {
  if (!news) return '- GDELT news signals unavailable.';
  if (news.articles.length === 0) return '- No matching GDELT news/event signals were returned for the last 24 hours.';
  return news.articles.map((article) => {
    const source = article.domain ? ` · ${article.domain}` : '';
    const seen = article.seendate ? ` · ${article.seendate}` : '';
    return `- ${article.title}${source}${seen}`;
  }).join('\n');
}

function buildOsintReport(
  lat: number,
  lng: number,
  place: PlaceSnapshot | null,
  weather: WeatherSnapshot | null,
  airQuality: AirQualitySnapshot | null,
  earthquakes: Earthquake[],
  infrastructure: InfrastructureSummary | null,
  gdelt: GdeltSummary | null,
) {
  const nearby = earthquakes
    .map((event) => ({ ...event, distanceKm: distanceKm(lat, lng, event.lat, event.lng) }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, 3);
  const seismicLines = nearby.length > 0
    ? nearby.map((event) => `- M${event.magnitude ?? '—'} · ${event.place} · approximately ${Math.round(event.distanceKm)} km away`).join('\n')
    : '- No M4.5+ events were available in the current USGS one-day feed.';

  const locationName = place?.displayName
    || [place?.locality, place?.region, place?.country].filter(Boolean).join(', ')
    || 'Name unavailable';

  const sourceCount = [place, weather, airQuality, earthquakes.length > 0, infrastructure, gdelt].filter(Boolean).length;
  const confidence = sourceCount >= 5 ? 'Medium-high' : sourceCount >= 3 ? 'Medium' : 'Low';

  return `# OSINT Brief\n\n**Location:** ${locationName}  \n**Coordinates:** ${lat.toFixed(4)}, ${lng.toFixed(4)}  \n**Overall confidence:** ${confidence}  \n**Method:** Open-source data aggregation with source labels; no private data and no language model\n\n## Environmental snapshot\n- Weather: ${weather ? weatherLabel(weather.weatherCode) : 'Unavailable'}\n- Temperature: ${formatNumber(weather?.temp ?? null, '°C', 1)}\n- Humidity: ${formatNumber(weather?.humidity ?? null, '%')}\n- Wind: ${formatNumber(weather?.windSpeed ?? null, ' km/h', 1)}\n- US AQI: ${formatNumber(airQuality?.usAqi ?? null)} (${aqiCategory(airQuality?.usAqi ?? null)})\n- PM2.5: ${formatNumber(airQuality?.pm25 ?? null, ' μg/m³', 1)}\n\n## Infrastructure within approximately 25 km\n${buildInfrastructureLines(infrastructure)}\n\n## Recent public-event signals\n${buildNewsLines(gdelt)}\n\n## Seismic context\n${seismicLines}\n\n## Source confidence and limits\n- OpenStreetMap/Nominatim: place naming and reverse geocoding; community-maintained.\n- Open-Meteo: current weather and air-quality values.\n- OpenStreetMap/Overpass: visible mapped infrastructure tags within a bounded query.\n- GDELT DOC 2.0: recent global news mentions; signals only, not incident confirmation.\n- USGS: M4.5+ one-day earthquake feed.\n- Aircraft and maritime markers remain separate live layers and are not interpreted as operational traffic control data.\n- AetherGlobe is exploratory OSINT visualization and must not be used for navigation, emergency response, targeting, surveillance, or other operational decisions.`;
}

async function readJsonBody(request: Request) {
  const declaredLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declaredLength) && declaredLength > 32_768) {
    throw Object.assign(new Error('Request body too large'), { status: 413 });
  }
  const raw = await request.text();
  if (new TextEncoder().encode(raw).byteLength > 32_768) {
    throw Object.assign(new Error('Request body too large'), { status: 413 });
  }
  try {
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    throw Object.assign(new Error('Invalid JSON body'), { status: 400 });
  }
}

function jsonResponse(payload: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
    },
  });
}

export async function generateOsintBrief(body: Record<string, unknown>) {
  const lat = parseCoordinate(body.lat, -90, 90, 'latitude');
  const lng = parseCoordinate(body.lng, -180, 180, 'longitude');
  const cacheKey = `osint-brief:${lat.toFixed(4)}:${lng.toFixed(4)}`;
  const cached = getCached(cacheKey);
  if (cached) return cached;

  const placeResult = await Promise.allSettled([getPlaceSnapshot(lat, lng)]).then(([result]) => result);
  const place = placeResult.status === 'fulfilled' ? placeResult.value : null;

  const [weatherResult, airQualityResult, earthquakeResult, infrastructureResult, gdeltResult] = await Promise.allSettled([
    getWeatherSnapshot(lat, lng),
    getAirQualitySnapshot(lat, lng),
    getEarthquakes(),
    getInfrastructure(lat, lng),
    getGdeltSignals(place),
  ]);

  const weather = weatherResult.status === 'fulfilled' ? weatherResult.value : null;
  const airQuality = airQualityResult.status === 'fulfilled' ? airQualityResult.value : null;
  const earthquakes = earthquakeResult.status === 'fulfilled' ? earthquakeResult.value : [];
  const infrastructure = infrastructureResult.status === 'fulfilled' ? infrastructureResult.value : null;
  const gdelt = gdeltResult.status === 'fulfilled' ? gdeltResult.value : null;

  const result = {
    report: buildOsintReport(lat, lng, place, weather, airQuality, earthquakes, infrastructure, gdelt),
    mode: 'osint-brief',
    model: null,
    timestamp: Date.now(),
    confidence: {
      infrastructure: infrastructure?.confidence ?? 'low',
      publicEvents: gdelt?.confidence ?? 'low',
    },
    data: {
      place,
      weather,
      airQuality,
      earthquakes: earthquakes.slice(0, 10),
      infrastructure,
      publicEvents: gdelt,
    },
    sources: [
      ...(place ? ['openstreetmap-nominatim'] : []),
      ...(weather ? ['open-meteo'] : []),
      ...(airQuality ? ['open-meteo-air-quality'] : []),
      ...(earthquakeResult.status === 'fulfilled' ? ['usgs'] : []),
      ...(infrastructure ? ['openstreetmap-overpass'] : []),
      ...(gdelt ? ['gdelt-doc-2'] : []),
    ],
  };
  setCached(cacheKey, result, 2 * 60_000);
  return result;
}

export async function handleOsintRequest(request: Request) {
  try {
    if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed' }, 405, { Allow: 'POST' });
    return jsonResponse(await generateOsintBrief(await readJsonBody(request)));
  } catch (error) {
    const typedError = error as Error & { status?: number; expose?: boolean };
    const status = typedError.status || (typedError.name === 'AbortError' ? 504 : 500);
    console.error(typedError);
    const message = status >= 500 && !typedError.expose ? 'OSINT source aggregation failed' : typedError.message;
    return jsonResponse({ error: message }, status);
  }
}
