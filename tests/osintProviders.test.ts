import assert from 'node:assert/strict';
import test from 'node:test';
import { handleOsintRequest } from '../lib/osintProviders';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('OSINT brief aggregates public source signals and infrastructure', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    requestedUrls.push(url);

    const parsed = new URL(url);
    if (parsed.hostname === 'nominatim.openstreetmap.org') {
      return jsonResponse({
        display_name: 'Nashik, Maharashtra, India',
        address: {
          city: 'Nashik',
          state: 'Maharashtra',
          country: 'India',
          country_code: 'in',
        },
      });
    }

    if (parsed.hostname === 'api.open-meteo.com') {
      return jsonResponse({
        current: {
          temperature_2m: 29.2,
          relative_humidity_2m: 61,
          weather_code: 3,
          wind_speed_10m: 12.4,
          time: '2026-09-01T17:30',
        },
      });
    }

    if (parsed.hostname === 'air-quality-api.open-meteo.com') {
      return jsonResponse({
        current: {
          us_aqi: 74,
          pm2_5: 22.1,
          pm10: 51.3,
          nitrogen_dioxide: 10,
          ozone: 33,
          time: '2026-09-01T17:00',
        },
      });
    }

    if (parsed.hostname === 'earthquake.usgs.gov') {
      return jsonResponse({
        features: [{
          id: 'quake-1',
          properties: {
            mag: 5.1,
            place: 'Arabian Sea',
            time: 1_780_000_000_000,
            url: 'https://earthquake.usgs.gov/example',
          },
          geometry: { coordinates: [66, 18, 10] },
        }],
      });
    }

    if (parsed.hostname === 'overpass-api.de') {
      return jsonResponse({
        elements: [
          { type: 'node', id: 1, tags: { aeroway: 'aerodrome', name: 'Test Airfield' } },
          { type: 'way', id: 2, tags: { highway: 'primary', ref: 'NH-TEST' } },
          { type: 'node', id: 3, tags: { amenity: 'hospital', name: 'Civil Hospital' } },
          { type: 'relation', id: 4, tags: { landuse: 'industrial', name: 'Industrial Estate' } },
          { type: 'node', id: 5, tags: { power: 'substation', name: 'Substation' } },
        ],
      });
    }

    if (parsed.hostname === 'api.gdeltproject.org') {
      assert.equal(parsed.searchParams.get('mode'), 'ArtList');
      assert.equal(parsed.searchParams.get('format'), 'json');
      assert.equal(parsed.searchParams.get('timespan'), '24h');
      return jsonResponse({
        articles: [{
          title: 'Airport disruption reported near Nashik',
          url: 'https://example.com/airport-disruption',
          domain: 'example.com',
          seendate: '20260901T170000Z',
          sourceCountry: 'IN',
          language: 'English',
        }],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const response = await handleOsintRequest(new Request('http://localhost/api/osint', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat: 19.9975, lng: 73.7898 }),
    }));
    const body = await response.json() as {
      mode?: string;
      model?: string | null;
      report?: string;
      sources?: string[];
      confidence?: { infrastructure?: string; publicEvents?: string };
      data?: {
        infrastructure?: { count?: number; counts?: Record<string, number> };
        publicEvents?: { articles?: Array<{ title?: string }> };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.mode, 'osint-brief');
    assert.equal(body.model, null);
    assert.match(body.report || '', /# OSINT Brief/);
    assert.match(body.report || '', /Infrastructure within approximately 25 km/);
    assert.match(body.report || '', /Airport disruption reported near Nashik/);
    assert.ok(body.sources?.includes('openstreetmap-overpass'));
    assert.ok(body.sources?.includes('gdelt-doc-2'));
    assert.equal(body.confidence?.infrastructure, 'medium');
    assert.equal(body.confidence?.publicEvents, 'medium');
    assert.equal(body.data?.infrastructure?.count, 5);
    assert.equal(body.data?.infrastructure?.counts?.air, 1);
    assert.equal(body.data?.infrastructure?.counts?.road, 1);
    assert.equal(body.data?.infrastructure?.counts?.emergency, 1);
    assert.equal(body.data?.publicEvents?.articles?.[0]?.title, 'Airport disruption reported near Nashik');
    assert.ok(requestedUrls.some((url) => new URL(url).hostname === 'overpass-api.de'));
    assert.ok(requestedUrls.some((url) => new URL(url).hostname === 'api.gdeltproject.org'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('OSINT endpoint rejects invalid coordinates', async () => {
  const response = await handleOsintRequest(new Request('http://localhost/api/osint', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lat: 99, lng: 73 }),
  }));
  const body = await response.json() as { error?: string };
  assert.equal(response.status, 400);
  assert.match(body.error || '', /Invalid latitude/);
});
