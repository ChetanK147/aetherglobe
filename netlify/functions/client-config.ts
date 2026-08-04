import type { Config } from '@netlify/functions';

function tomTomKey() {
  return Netlify.env.get('TOMTOM_API_KEY')?.trim()
    || Netlify.env.get('VITE_TOMTOM_API_KEY')?.trim()
    || null;
}

export default async function clientConfig(request: Request) {
  if (request.method !== 'GET') {
    return Response.json({ error: 'Method not allowed' }, { status: 405, headers: { Allow: 'GET' } });
  }

  const tomtomApiKey = tomTomKey();
  return Response.json(
    {
      tomtomConfigured: Boolean(tomtomApiKey),
      tomtomApiKey,
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}

export const config: Config = {
  path: '/api/client-config',
};
