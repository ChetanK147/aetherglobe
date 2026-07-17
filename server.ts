import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { readFile } from 'fs/promises';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import { LRUCache } from 'lru-cache';
import dotenv from 'dotenv';
import { handleApiRequest } from './lib/api.ts';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const EXPRESS_RATE_WINDOW_MS = 60_000;
const EXPRESS_RATE_LIMIT = 300;
const expressRateBuckets = new LRUCache<string, { count: number; resetAt: number }>({
  max: 10_000,
  ttl: EXPRESS_RATE_WINDOW_MS,
});

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

function globalRateLimit(req: Request, res: Response, next: NextFunction) {
  const now = Date.now();
  const key = req.ip || req.socket.remoteAddress || 'unknown';
  const existing = expressRateBuckets.get(key);
  const bucket = !existing || existing.resetAt <= now
    ? { count: 1, resetAt: now + EXPRESS_RATE_WINDOW_MS }
    : { count: existing.count + 1, resetAt: existing.resetAt };

  expressRateBuckets.set(key, bucket, { ttl: Math.max(1, bucket.resetAt - now) });

  const remaining = Math.max(0, EXPRESS_RATE_LIMIT - bucket.count);
  const resetSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  res.setHeader('RateLimit-Policy', `${EXPRESS_RATE_LIMIT};w=${EXPRESS_RATE_WINDOW_MS / 1000}`);
  res.setHeader('RateLimit', `limit=${EXPRESS_RATE_LIMIT}, remaining=${remaining}, reset=${resetSeconds}`);

  if (bucket.count > EXPRESS_RATE_LIMIT) {
    res.setHeader('Retry-After', String(resetSeconds));
    res.status(429).json({ error: 'Too many requests' });
    return;
  }

  next();
}

function toFetchHeaders(req: Request) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(', '));
    else if (value !== undefined) headers.set(name, value);
  }
  return headers;
}

async function startServer() {
  const app = express();
  const httpServer = createHttpServer(app);

  app.disable('x-powered-by');
  app.use(globalRateLimit);
  app.use(express.json({ limit: '32kb' }));

  app.all('/api/*', asyncRoute(async (req, res) => {
    const protocol = req.protocol || 'http';
    const host = req.get('host') || `127.0.0.1:${PORT}`;
    const requestInit: RequestInit = {
      method: req.method,
      headers: toFetchHeaders(req),
    };
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      requestInit.body = JSON.stringify(req.body ?? {});
    }

    const apiResponse = await handleApiRequest(
      new globalThis.Request(`${protocol}://${host}${req.originalUrl}`, requestInit),
      {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
      },
      req.ip || req.socket.remoteAddress || 'unknown',
    );

    apiResponse.headers.forEach((value, name) => res.setHeader(name, value));
    res.status(apiResponse.status).send(await apiResponse.text());
  }));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    const indexHtml = await readFile(path.join(distPath, 'index.html'), 'utf8');
    app.use(express.static(distPath, { index: false }));
    app.get('*', (_req, res) => res.type('html').send(indexHtml));
  }

  app.use((error: Error & { status?: number }, _req: Request, res: Response, _next: NextFunction) => {
    const status = error.status || (error.name === 'AbortError' ? 504 : 500);
    console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Internal server error' : error.message });
  });

  httpServer.listen(PORT, '0.0.0.0', () => console.log(`AetherGlobe running on http://localhost:${PORT}`));
}

startServer().catch((error) => {
  console.error('Server startup failed', error);
  process.exit(1);
});
