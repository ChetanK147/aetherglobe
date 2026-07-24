import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApiRequest } from '../lib/api';

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('Aviationstack supplies sampled live traffic when dump1090 is unavailable', async () => {
  const originalFetch = globalThis.fetch;
  const receiverUrl = 'http://192.168.0.168/dump1090/data/aircraft.json';
  const now = Date.now();
  let receiverRequests = 0;
  let aviationstackRequests = 0;

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url === receiverUrl) {
      receiverRequests += 1;
      throw new Error('receiver offline');
    }

    if (url.startsWith('https://api.aviationstack.com/v1/flights?')) {
      aviationstackRequests += 1;
      const requestedUrl = new URL(url);
      assert.equal(requestedUrl.searchParams.get('access_key'), 'test-traffic-key');
      assert.equal(requestedUrl.searchParams.get('flight_status'), 'active');
      assert.equal(requestedUrl.searchParams.get('limit'), '100');

      return jsonResponse({
        pagination: { limit: 100, offset: 0, count: 4, total: 500 },
        data: [
          {
            flight_status: 'active',
            flight: { iata: 'AI101', icao: 'AIC101', number: '101' },
            aircraft: {
              registration: 'VT-TEST',
              iata: '789',
              icao: 'B789',
              icao24: '800001',
            },
            live: {
              updated: new Date(now - 60_000).toISOString(),
              latitude: 20,
              longitude: 74,
              altitude: 10_000,
              direction: 275,
              speed_horizontal: 800,
              speed_vertical: 4,
              is_ground: false,
            },
          },
          {
            flight_status: 'active',
            flight: { icao: 'OUTSIDE1' },
            aircraft: { icao24: '800002' },
            live: {
              updated: new Date(now - 60_000).toISOString(),
              latitude: 30,
              longitude: 84,
            },
          },
          {
            flight_status: 'active',
            flight: { icao: 'NOLOC1' },
            aircraft: { icao24: '800003' },
            live: null,
          },
          {
            flight_status: 'active',
            flight: { icao: 'STALE1' },
            aircraft: { icao24: '800004' },
            live: {
              updated: new Date(now - 7_200_000).toISOString(),
              latitude: 20.2,
              longitude: 74.2,
            },
          },
        ],
      });
    }

    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const env = {
      DUMP1090_AIRCRAFT_URL: receiverUrl,
      AVIATIONSTACK_API_KEY: 'test-traffic-key',
      AVIATIONSTACK_BASE_URL: 'https://api.aviationstack.com/v1',
      AVIATIONSTACK_TRAFFIC_CACHE_SECONDS: '900',
      AVIATIONSTACK_MAX_LIVE_AGE_SECONDS: '1800',
    };
    const requestUrl = 'http://localhost/api/flights?lamin=19&lamax=21&lomin=73&lomax=75';

    const firstResponse = await handleApiRequest(
      new Request(requestUrl),
      env,
      'test-aviationstack-traffic-1',
    );
    const firstBody = await firstResponse.json() as {
      source?: string;
      sampled?: boolean;
      upstreamCount?: number;
      upstreamTotal?: number;
      warning?: string;
      flights?: Array<{
        id?: string;
        callsign?: string;
        altitude?: number | null;
        velocity?: number | null;
        track?: number | null;
        source?: string;
        registration?: string | null;
      }>;
    };

    const secondResponse = await handleApiRequest(
      new Request(requestUrl),
      env,
      'test-aviationstack-traffic-2',
    );

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(firstBody.source, 'aviationstack-live-fallback');
    assert.equal(firstBody.sampled, true);
    assert.equal(firstBody.upstreamCount, 4);
    assert.equal(firstBody.upstreamTotal, 500);
    assert.match(firstBody.warning || '', /capped 100-record response/i);
    assert.equal(firstBody.flights?.length, 1);
    assert.equal(firstBody.flights?.[0]?.id, '800001');
    assert.equal(firstBody.flights?.[0]?.callsign, 'AIC101');
    assert.equal(firstBody.flights?.[0]?.altitude, 32_808);
    assert.equal(firstBody.flights?.[0]?.velocity, 432);
    assert.equal(firstBody.flights?.[0]?.track, 275);
    assert.equal(firstBody.flights?.[0]?.registration, 'VT-TEST');
    assert.equal(firstBody.flights?.[0]?.source, 'aviationstack-live-fallback');
    assert.equal(receiverRequests, 2);
    assert.equal(aviationstackRequests, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
