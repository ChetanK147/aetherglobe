import { handleApiRequest } from '../../lib/api';

type NetlifyContext = {
  ip?: string;
};

declare const Netlify: {
  env: {
    get(name: string): string | undefined;
  };
};

export default async function api(request: Request, context: NetlifyContext) {
  return handleApiRequest(
    request,
    {
      OPENAI_API_KEY: Netlify.env.get('OPENAI_API_KEY'),
      OPENAI_MODEL: Netlify.env.get('OPENAI_MODEL'),
    },
    context.ip || request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown',
  );
}

export const config = {
  path: [
    '/api/intelligence',
    '/api/weather',
    '/api/flights',
    '/api/live/usgs',
    '/api/health',
  ],
};
