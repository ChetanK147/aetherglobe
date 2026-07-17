import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { createExpressRateLimiter } from '../lib/expressRateLimit';

interface MockResponseState {
  statusCode: number;
  body: unknown;
  headers: Map<string, number | string | readonly string[]>;
}

function createMockResponse() {
  const state: MockResponseState = {
    statusCode: 200,
    body: null,
    headers: new Map(),
  };

  const response = {
    setHeader(name: string, value: number | string | readonly string[]) {
      state.headers.set(name.toLowerCase(), value);
      return response;
    },
    status(code: number) {
      state.statusCode = code;
      return response;
    },
    json(body: unknown) {
      state.body = body;
      return response;
    },
  } as unknown as Response;

  return { response, state };
}

function createRequest(ip: string) {
  return {
    ip,
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

test('global Express limiter rejects requests above the configured limit', () => {
  const limiter = createExpressRateLimiter({ windowMs: 60_000, limit: 2, maxClients: 10 });
  const request = createRequest('203.0.113.10');
  let nextCalls = 0;
  const next = (() => { nextCalls += 1; }) as NextFunction;

  const first = createMockResponse();
  limiter(request, first.response, next);
  assert.equal(first.state.statusCode, 200);
  assert.equal(nextCalls, 1);
  assert.match(String(first.state.headers.get('ratelimit')), /remaining=1/);

  const second = createMockResponse();
  limiter(request, second.response, next);
  assert.equal(second.state.statusCode, 200);
  assert.equal(nextCalls, 2);
  assert.match(String(second.state.headers.get('ratelimit')), /remaining=0/);

  const third = createMockResponse();
  limiter(request, third.response, next);
  assert.equal(third.state.statusCode, 429);
  assert.equal(nextCalls, 2);
  assert.deepEqual(third.state.body, { error: 'Too many requests' });
  assert.ok(Number(third.state.headers.get('retry-after')) >= 1);
});

test('rate buckets are isolated by client IP', () => {
  const limiter = createExpressRateLimiter({ windowMs: 60_000, limit: 1, maxClients: 10 });
  let nextCalls = 0;
  const next = (() => { nextCalls += 1; }) as NextFunction;

  limiter(createRequest('203.0.113.20'), createMockResponse().response, next);
  limiter(createRequest('203.0.113.21'), createMockResponse().response, next);

  assert.equal(nextCalls, 2);
});

test('invalid limiter options fail during startup', () => {
  assert.throws(() => createExpressRateLimiter({ windowMs: 0 }), /windowMs/);
  assert.throws(() => createExpressRateLimiter({ limit: 0 }), /limit/);
  assert.throws(() => createExpressRateLimiter({ maxClients: 0 }), /maxClients/);
});
