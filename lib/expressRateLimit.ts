import type { NextFunction, Request, Response } from 'express';
import { LRUCache } from 'lru-cache';

export interface ExpressRateLimitOptions {
  windowMs?: number;
  limit?: number;
  maxClients?: number;
}

interface RateBucket {
  count: number;
  resetAt: number;
}

export function createExpressRateLimiter({
  windowMs = 60_000,
  limit = 300,
  maxClients = 10_000,
}: ExpressRateLimitOptions = {}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0) {
    throw new Error('windowMs must be a positive number');
  }
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error('limit must be a positive integer');
  }
  if (!Number.isInteger(maxClients) || maxClients <= 0) {
    throw new Error('maxClients must be a positive integer');
  }

  const buckets = new LRUCache<string, RateBucket>({ max: maxClients, ttl: windowMs });

  return function expressRateLimit(req: Request, res: Response, next: NextFunction) {
    const now = Date.now();
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const existing = buckets.get(key);
    const bucket = !existing || existing.resetAt <= now
      ? { count: 1, resetAt: now + windowMs }
      : { count: existing.count + 1, resetAt: existing.resetAt };

    buckets.set(key, bucket, { ttl: Math.max(1, bucket.resetAt - now) });

    const remaining = Math.max(0, limit - bucket.count);
    const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
    res.setHeader('RateLimit-Policy', `${limit};w=${windowMs / 1000}`);
    res.setHeader('RateLimit', `limit=${limit}, remaining=${remaining}, reset=${resetSeconds}`);

    if (bucket.count > limit) {
      res.setHeader('Retry-After', String(resetSeconds));
      res.status(429).json({ error: 'Too many requests' });
      return;
    }

    next();
  };
}
