import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApiRequest } from '../lib/api';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('cached Aviationstack positions are re-aged at request time', async () => {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  const receiverUrl = 'http://192.168.0.250/dump1090/data/aircraft.json';
  let currentTime = 1_800_000_000_000;
  let aviationstackRequests = 0;
  let publicFallbackRequests = 0;

  Date.now = () => currentTime;
  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === receiverUrl) throw new Error('receiver offline');

    if (url.startsWith('https://cached-age-test.aviationstack.com/v1/flights?')) {
      aviationstackRequests += 1;
      return jsonResponse({
        pagination: { limit: 100, offset: 0, count: 1, total: 1 },
        data: [{
          flight_status: 'active',
          flight: { icao: 'AIC101' },
          aircraft: { registration: 'VT-TEST', icao24: '800001' },
          live: {
            updated: new Date(currentTime - 30_000).toISOString(),
            latitude: 20,
            longitude: 74,
            altitude: 10_000,
            speed_horizontal: 800,
            direction: 270,
            is_ground: false,
          },
        }],
      });
    }

    if (url.startsWith('https://data-cloud.flightradar24.com/')) {
      publicFallbackRequests += 1;
      return jsonResponse({
        fallback: [
          'fr24-fallback', 20, 74, 90, 12_000, 250, null, '1200',
          'A320', 'VT-FB', null, null, null, 'FB101', null, null, 'FB101',
        ],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const env = {
      DUMP1090_AIRCRAFT_URL: receiverUrl,
      AVIATIONSTACK_API_KEY: 'cached-age-test-key',
      AVIATIONSTACK_BASE_URL: 'https://cached-age-test.aviationstack.com/v1',
      AVIATIONSTACK_TRAFFIC_CACHE_SECONDS: '900',
      AVIATIONSTACK_MAX_LIVE_AGE_SECONDS: '60',
    };
    const requestUrl = 'http://localhost/api/flights?lamin=19&lamax=21&lomin=73&lomax=75';

    const firstResponse = await handleApiRequest(
      new Request(requestUrl),
      env,
      'cached-age-first-request',
    );
    const firstBody = await firstResponse.json() as {
      source?: string;
      flights?: Array<{ id?: string }>;
    };

    currentTime += 120_000;

    const secondResponse = await handleApiRequest(
      new Request(requestUrl),
      env,
      'cached-age-second-request',
    );
    const secondBody = await secondResponse.json() as {
      source?: string;
      flights?: Array<{ id?: string }>;
    };

    assert.equal(firstResponse.status, 200);
    assert.equal(firstBody.source, 'aviationstack-live-fallback');
    assert.equal(firstBody.flights?.[0]?.id, '800001');

    assert.equal(secondResponse.status, 200);
    assert.equal(secondBody.source, 'flightradar24-unofficial');
    assert.equal(secondBody.flights?.[0]?.id, 'fr24-fallback');
    assert.equal(aviationstackRequests, 1);
    assert.equal(publicFallbackRequests, 1);
  } finally {
    Date.now = originalDateNow;
    globalThis.fetch = originalFetch;
  }
});
