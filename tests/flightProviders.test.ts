import assert from 'node:assert/strict';
import test from 'node:test';
import { handleApiRequest } from '../lib/api';

async function readJson(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

test('flight lookup explains how to configure a missing Aviationstack key', async () => {
  const response = await handleApiRequest(
    new Request('http://localhost/api/flight-lookup?flight=AI123'),
    {},
    'test-aviationstack-missing-key',
  );
  const body = await readJson(response);

  assert.equal(response.status, 503);
  assert.match(String(body.error), /AVIATIONSTACK_API_KEY/);
});

test('Aviationstack lookup validates, normalizes and caches a flight response', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    requestedUrls.push(url);

    return jsonResponse({
      data: [{
        flight_date: '2026-07-25',
        flight_status: 'active',
        airline: { name: 'Air India', iata: 'AI', icao: 'AIC' },
        flight: { number: '987', iata: 'AI987', icao: 'AIC987' },
        departure: {
          airport: 'Chhatrapati Shivaji Maharaj International Airport',
          iata: 'BOM',
          icao: 'VABB',
          scheduled: '2026-07-25T10:00:00+00:00',
        },
        arrival: {
          airport: 'Indira Gandhi International Airport',
          iata: 'DEL',
          icao: 'VIDP',
          scheduled: '2026-07-25T12:00:00+00:00',
        },
        aircraft: { registration: 'VT-TEST', icao24: '800001' },
        live: { latitude: 20.1, longitude: 74.2, altitude: 9100, updated: '2026-07-25T11:00:00+00:00' },
      }],
    });
  };

  try {
    const env = {
      AVIATIONSTACK_API_KEY: 'test-aviationstack-key',
      AVIATIONSTACK_BASE_URL: 'https://api.aviationstack.com/v1',
    };

    const firstResponse = await handleApiRequest(
      new Request('http://localhost/api/flight-lookup?flight=ai-987'),
      env,
      'test-aviationstack-success-1',
    );
    const firstBody = await readJson(firstResponse) as {
      query?: string;
      matches?: Array<{
        status?: string;
        airline?: { name?: string };
        flight?: { iata?: string };
        departure?: { iata?: string };
        arrival?: { iata?: string };
      }>;
    };

    const secondResponse = await handleApiRequest(
      new Request('http://localhost/api/flight-lookup?flight=AI987'),
      env,
      'test-aviationstack-success-2',
    );

    assert.equal(firstResponse.status, 200);
    assert.equal(secondResponse.status, 200);
    assert.equal(firstBody.query, 'AI987');
    assert.equal(firstBody.matches?.[0]?.status, 'active');
    assert.equal(firstBody.matches?.[0]?.airline?.name, 'Air India');
    assert.equal(firstBody.matches?.[0]?.flight?.iata, 'AI987');
    assert.equal(firstBody.matches?.[0]?.departure?.iata, 'BOM');
    assert.equal(firstBody.matches?.[0]?.arrival?.iata, 'DEL');
    assert.equal(requestedUrls.length, 1);

    const requestedUrl = new URL(requestedUrls[0]);
    assert.equal(requestedUrl.origin, 'https://api.aviationstack.com');
    assert.equal(requestedUrl.pathname, '/v1/flights');
    assert.equal(requestedUrl.searchParams.get('flight_iata'), 'AI987');
    assert.equal(requestedUrl.searchParams.get('access_key'), 'test-aviationstack-key');
    assert.equal(requestedUrl.searchParams.get('limit'), '10');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('configured dump1090 is preferred and filters stale or out-of-bounds positions', async () => {
  const originalFetch = globalThis.fetch;
  const receiverUrl = 'http://192.168.0.168/dump1090/data/aircraft.json';

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    assert.equal(url, receiverUrl);

    return jsonResponse({
      now: 2_000,
      messages: 123_456,
      aircraft: [
        {
          hex: '800001',
          flight: 'AIC101 ',
          lat: 20,
          lon: 74,
          alt_baro: 32_000,
          gs: 450,
          track: 280,
          seen: 1,
          seen_pos: 2,
          rssi: -18.5,
        },
        {
          hex: '800002',
          flight: 'STALE1',
          lat: 20.1,
          lon: 74.1,
          seen_pos: 45,
        },
        {
          hex: '800003',
          flight: 'OUTSIDE',
          lat: 30,
          lon: 84,
          seen_pos: 1,
        },
        {
          hex: '800004',
          flight: 'NO POSITION',
          seen_pos: 1,
        },
      ],
    });
  };

  try {
    const response = await handleApiRequest(
      new Request('http://localhost/api/flights?lamin=19&lamax=21&lomin=73&lomax=75'),
      {
        DUMP1090_AIRCRAFT_URL: receiverUrl,
        DUMP1090_MAX_POSITION_AGE_SECONDS: '20',
      },
      'test-dump1090-primary',
    );
    const body = await readJson(response) as {
      source?: string;
      receiverMessages?: number;
      flights?: Array<{
        id?: string;
        callsign?: string;
        altitude?: number;
        source?: string;
        positionAgeSeconds?: number;
      }>;
    };

    assert.equal(response.status, 200);
    assert.equal(body.source, 'local-dump1090');
    assert.equal(body.receiverMessages, 123_456);
    assert.equal(body.flights?.length, 1);
    assert.equal(body.flights?.[0]?.id, '800001');
    assert.equal(body.flights?.[0]?.callsign, 'AIC101');
    assert.equal(body.flights?.[0]?.altitude, 32_000);
    assert.equal(body.flights?.[0]?.source, 'local-dump1090');
    assert.equal(body.flights?.[0]?.positionAgeSeconds, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
