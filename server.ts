import express, { type NextFunction, type Request, type Response } from 'express';
import path from 'path';
import { readFile } from 'fs/promises';
import { createServer as createHttpServer } from 'http';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { handleApiRequest } from './lib/api.ts';
import { createExpressRateLimiter } from './lib/expressRateLimit.ts';

dotenv.config({ path: '.env.local' });
dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const globalRateLimit = createExpressRateLimiter({
  windowMs: 60_000,
  limit: 300,
  maxClients: 10_000,
});

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
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
        DUMP1090_AIRCRAFT_URL: process.env.DUMP1090_AIRCRAFT_URL,
        DUMP1090_MAX_POSITION_AGE_SECONDS: process.env.DUMP1090_MAX_POSITION_AGE_SECONDS,
        AVIATIONSTACK_API_KEY: process.env.AVIATIONSTACK_API_KEY,
        AVIATIONSTACK_BASE_URL: process.env.AVIATIONSTACK_BASE_URL,
        AVIATIONSTACK_TRAFFIC_CACHE_SECONDS: process.env.AVIATIONSTACK_TRAFFIC_CACHE_SECONDS,
        AVIATIONSTACK_MAX_LIVE_AGE_SECONDS: process.env.AVIATIONSTACK_MAX_LIVE_AGE_SECONDS,
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
