import type { Config, Context } from '@netlify/functions';
import { handleApiRequest } from '../../lib/api';

export default async function api(request: Request, context: Context) {
  return handleApiRequest(
    request,
    {
      DUMP1090_AIRCRAFT_URL: Netlify.env.get('DUMP1090_AIRCRAFT_URL'),
      DUMP1090_MAX_POSITION_AGE_SECONDS: Netlify.env.get('DUMP1090_MAX_POSITION_AGE_SECONDS'),
      AVIATIONSTACK_API_KEY: Netlify.env.get('AVIATIONSTACK_API_KEY'),
      AVIATIONSTACK_BASE_URL: Netlify.env.get('AVIATIONSTACK_BASE_URL'),
      AISSTREAM_API_KEY: Netlify.env.get('AISSTREAM_API_KEY'),
      AISSTREAM_URL: Netlify.env.get('AISSTREAM_URL'),
      AISSTREAM_MAX_POSITION_AGE_SECONDS: Netlify.env.get('AISSTREAM_MAX_POSITION_AGE_SECONDS'),
      AISSTREAM_RUNTIME: 'serverless',
    },
    context.ip || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  );
}

export const config: Config = {
  path: [
    '/api/intelligence',
    '/api/weather',
    '/api/flights',
    '/api/vessels',
    '/api/flight-lookup',
    '/api/live/usgs',
    '/api/health',
  ],
};
