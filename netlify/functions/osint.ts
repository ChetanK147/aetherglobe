import type { Config } from '@netlify/functions';
import { handleOsintRequest } from '../../lib/osintProviders';

export default async function osint(request: Request) {
  return handleOsintRequest(request);
}

export const config: Config = {
  path: '/api/osint',
};
