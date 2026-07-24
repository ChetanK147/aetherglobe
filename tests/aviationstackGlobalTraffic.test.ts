import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApiRequest } from '../lib/api';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Aviationstack supplies a global sampled traffic layer when no local receiver is configured', async () => {
  const originalFetch = globalThis.fetch;
  const now = Date.now();
  let aviationstackRequests = 0;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.startsWith('https://global-test.aviationstack.com/v1/flights?')) {
      aviationstackRequests += 1;
      const requestedUrl = new URL(url);
      assert.equal(requestedUrl.searchParams.get('flight_status'), 'active');
      assert.equal(requestedUrl.searchParams.get('limit'), '100');

      return jsonResponse({
        pagination: { limit: 100, offset: 0, count: 2, total: 2 },
        data: [
          {
            flight_status: 'active',
            flight: { icao: 'AIC101' },
            aircraft: { registration: 'VT-ONE', icao: 'B789', icao24: '800001' },
            live: {
              updated: new Date(now - 30_000).toISOString(),
              latitude: 20,
              longitude: 74,
              altitude: 10_000,
              direction: 270,
              speed_horizontal: 800,
              is_ground: false,
            },
          },
          {
            flight_status: 'active',
            flight: { icao: 'UAL200' },
            aircraft: { registration: 'N200UA', icao: 'B77W', icao24: 'a00001' },
            live: {
              updated: new Date(now - 45_000).toISOString(),
              latitude: 40.7,
              longitude: -74,
              altitude: 9_000,
              direction: 90,
              speed_horizontal: 700,
              is_ground: false,
            },
          },
        ],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const requestUrl = 'http://localhost/api/flights?lamin=19&lamax=21&lomin=73&lomax=75';
    const env = {
      AVIATIONSTACK_API_KEY: 'test-global-key',
      AVIATIONSTACK_BASE_URL: 'https://global-test.aviationstack.com/v1',
      AVIATIONSTACK_TRAFFIC_CACHE_SECONDS: '900',
      AVIATIONSTACK_MAX_LIVE_AGE_SECONDS: '1800',
    };

    const response = await handleApiRequest(
      new Request(requestUrl),
      env,
      'test-aviationstack-global',
    );
    const body = await response.json() as {
      source?: string;
      scope?: string;
      sampled?: boolean;
      warning?: string;
      flights?: Array<{ id?: string; source?: string }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.source, 'aviationstack-live-fallback');
    assert.equal(body.scope, 'global');
    assert.equal(body.sampled, true);
    assert.match(body.warning || '', /global sample/i);
    assert.equal(body.flights?.length, 2);
    assert.deepEqual(body.flights?.map((flight) => flight.id), ['800001', 'a00001']);
    assert.ok(body.flights?.every((flight) => flight.source === 'aviationstack-live-fallback'));
    assert.equal(aviationstackRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
