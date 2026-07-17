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

test('health reports supported default and fallback models', async () => {
  const response = await handleApiRequest(
    new Request('http://localhost/api/health'),
    {},
    'test-health-defaults',
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.configuredModel, 'gpt-5.2');
  assert.equal(body.fallbackModel, 'gpt-5-mini');
});

test('health preserves a valid configured model override', async () => {
  const response = await handleApiRequest(
    new Request('http://localhost/api/health'),
    { OPENAI_MODEL: 'gpt-5.1' },
    'test-health-override',
  );
  const body = await readJson(response);

  assert.equal(response.status, 200);
  assert.equal(body.configuredModel, 'gpt-5.1');
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

  await t.test('intelligence rejects a missing coordinate', async () => {
    const response = await handleApiRequest(
      new Request('http://localhost/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lng: 73.7898, context: 'Missing latitude' }),
      }),
      {},
      'test-intelligence-missing',
    );
    const body = await readJson(response);

    assert.equal(response.status, 400);
    assert.equal(body.error, 'Invalid latitude');
  });
});

test('valid zero coordinates and OpenAI enrichment remain supported', async () => {
  const originalFetch = globalThis.fetch;
  const requestedModels: string[] = [];

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;

    if (url.startsWith('https://api.open-meteo.com/')) {
      return jsonResponse({
        current: {
          temperature_2m: 25,
          relative_humidity_2m: 70,
          weather_code: 1,
          wind_speed_10m: 8,
          time: '2026-07-17T12:00',
        },
      });
    }

    if (url.startsWith('https://earthquake.usgs.gov/')) {
      return jsonResponse({ features: [] });
    }

    if (url === 'https://api.openai.com/v1/responses') {
      const requestBody = JSON.parse(String(init?.body || '{}')) as { model?: string };
      requestedModels.push(requestBody.model || '');
      return jsonResponse({ output_text: 'Enriched location summary.' });
    }

    throw new Error(`Unexpected test request: ${url}`);
  };

  try {
    const localResponse = await handleApiRequest(
      new Request('http://localhost/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 0, lng: 0, context: 'Zero coordinate check' }),
      }),
      {},
      'test-zero-coordinate',
    );
    const localBody = await readJson(localResponse);

    assert.equal(localResponse.status, 200);
    assert.equal(localBody.mode, 'local-fallback');
    assert.match(String(localBody.report), /0\.0000, 0\.0000/);

    const enrichedResponse = await handleApiRequest(
      new Request('http://localhost/api/intelligence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat: 19.9975, lng: 73.7898, context: 'OpenAI response parsing check' }),
      }),
      { OPENAI_API_KEY: 'test-key' },
      'test-openai-output-text',
    );
    const enrichedBody = await readJson(enrichedResponse);

    assert.equal(enrichedResponse.status, 200);
    assert.equal(enrichedBody.mode, 'openai-enriched');
    assert.equal(enrichedBody.model, 'gpt-5.2');
    assert.match(String(enrichedBody.report), /Enriched location summary/);
    assert.deepEqual(requestedModels, ['gpt-5.2']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
