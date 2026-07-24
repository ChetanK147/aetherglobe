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

test('health reports direct source aggregation and maritime runtime status', async () => {
  const defaultResponse = await handleApiRequest(
    new Request('http://localhost/api/health'),
    {},
    'test-health-defaults',
  );
  const defaultBody = await readJson(defaultResponse);

  assert.equal(defaultResponse.status, 200);
  assert.equal(defaultBody.intelligenceMode, 'direct-source-brief');
  assert.equal(defaultBody.aisstreamConfigured, false);
  assert.equal(defaultBody.aisstreamMode, 'disabled');

  const configuredResponse = await handleApiRequest(
    new Request('http://localhost/api/health'),
    { AISSTREAM_API_KEY: 'test-key', AISSTREAM_RUNTIME: 'persistent' },
    'test-health-aisstream',
  );
  const configuredBody = await readJson(configuredResponse);

  assert.equal(configuredResponse.status, 200);
  assert.equal(configuredBody.aisstreamConfigured, true);
  assert.equal(configuredBody.aisstreamMode, 'persistent-websocket');
});

test('coordinate endpoints reject missing or empty values', async (t) => {
  await t.test('weather rejects missing latitude and longitude', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/api/weather'),
      {},
      'test-weather-missing',
    );
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid latitude');
  });

  await t.test('weather rejects an empty latitude', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/api/weather?lat=&lng=73.7898'),
      {},
      'test-weather-empty',
    );
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid latitude');
  });

  await t.test('flights reject an incomplete bounding box', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/api/flights?lamin=10&lamax=20'),
      {},
      'test-flights-missing',
    );
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid lomin');
  });

  await t.test('vessels reject an incomplete bounding box', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/api/vessels?lamin=10&lamax=20'),
      {},
      'test-vessels-missing',
    );
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid lomin');
  });

  await t.test('source brief rejects a missing coordinate', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lng: 73.7898 }),
      }),
      {},
      'test-intelligence-missing',
    );
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid latitude');
  });
});

test('valid zero coordinates return a direct current source brief', async () => {
  const originalFetch = globalThis.fetch;
  const requestedUrls: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    requestedUrls.push(url);

    if (url.startsWith('https://api.open-meteo.com/v1/forecast')) {
      return jsonResponse({
        current: {
          temperature_2m: 25,
          relative_humidity_2m: 70,
          weather_code: 1,
          wind_speed_10m: 8,
          time: '2026-07-25T12:00',
        },
      });
    }

    if (url.startsWith('https://air-quality-api.open-meteo.com/v1/air-quality')) {
      return jsonResponse({
        current: {
          us_aqi: 42,
          pm2_5: 8.5,
          pm10: 14.2,
          nitrogen_dioxide: 4.2,
          ozone: 61.1,
          time: '2026-07-25T12:00',
        },
      });
    }

    if (url.startsWith('https://nominatim.openstreetmap.org/reverse')) {
      return jsonResponse({
        display_name: 'Gulf of Guinea',
        address: { country: 'International waters' },
      });
    }

    if (url.startsWith('https://earthquake.usgs.gov/')) {
      return jsonResponse({ features: [] });
    }

    throw new Error(`Unexpected test request: ${url}`);
  };

  try {
    const response = await handleApiRequest(
      new Request('http://localhost/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 0, lng: 0 }),
      }),
      {},
      'test-zero-coordinate',
    );
    const body = await readJson(response);

    assert.equal(response.status, 200);
    assert.equal(body.mode, 'direct-source-brief');
    assert.equal(body.model, null);
    assert.match(String(body.report), /0\.0000, 0\.0000/);
    assert.match(String(body.report), /Gulf of Guinea/);
    assert.match(String(body.report), /US AQI: 42/);
    assert.match(String(body.report), /no language model/i);
    assert.ok(requestedUrls.some((url) => url.includes('nominatim.openstreetmap.org')));
    assert.ok(requestedUrls.some((url) => url.includes('air-quality-api.open-meteo.com')));
    assert.ok(!requestedUrls.some((url) => url.includes('api.openai.com')));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('serverless maritime endpoint explains that a persistent relay is required', async () => {
  const response = await handleApiRequest(
    new Request('http://localhost/api/vessels?lamin=10&lamax=20&lomin=70&lomax=80'),
    {
      AISSTREAM_API_KEY: 'test-key',
      AISSTREAM_RUNTIME: 'serverless',
    },
    'test-aisstream-serverless',
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.connection, 'relay-required');
  assert.equal(body.configured, true);
  assert.deepEqual(body.vessels, []);
  assert.match(String(body.warning), /persistent backend WebSocket or relay/i);
});
