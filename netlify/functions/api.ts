import type { Config, Context } from '@netlify/functions';
import { handleApiRequest } from '../../lib/api';

export default async function api(request: Request, context: Context) {
  return handleApiRequest(
    request,
    {
      OPENAI_API_KEY: Netlify.env.get('OPENAI_API_KEY'),
      OPENAI_MODEL: Netlify.env.get('OPENAI_MODEL'),
      DUMP1090_AIRCRAFT_URL: Netlify.env.get('DUMP1090_AIRCRAFT_URL'),
      DUMP1090_MAX_POSITION_AGE_SECONDS: Netlify.env.get('DUMP1090_MAX_POSITION_AGE_SECONDS'),
      AVIATIONSTACK_API_KEY: Netlify.env.get('AVIATIONSTACK_API_KEY'),
      AVIATIONSTACK_BASE_URL: Netlify.env.get('AVIATIONSTACK_BASE_URL'),
      AVIATIONSTACK_TRAFFIC_CACHE_SECONDS: Netlify.env.get('AVIATIONSTACK_TRAFFIC_CACHE_SECONDS'),
      AVIATIONSTACK_MAX_LIVE_AGE_SECONDS: Netlify.env.get('AVIATIONSTACK_MAX_LIVE_AGE_SECONDS'),
    },
    context.ip || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  );
}

export const config: Config = {
  path: [
    '/api/intelligence',
    '/api/weather',
    '/api/flights',
    '/api/flight-lookup',
    '/api/live/usgs',
    '/api/health',
  ],
};
