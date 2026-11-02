/** CORS for `/api/*`: only the console origins listed in `CONSOLE_ORIGINS` may call it. */

import type { Env } from './env.js';
import { empty } from './respond.js';

const ALLOW_METHODS = 'GET, POST, DELETE';
const ALLOW_HEADERS =
  'Authorization, Content-Type, X-KH-Label, X-KH-Business, X-KH-Kind, X-KH-Expires';

function allowedOrigins(env: Env): string[] {
  return env.CONSOLE_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

/** Headers for an `/api/*` response; an unlisted origin gets no `Access-Control-Allow-Origin`. */
export function corsHeaders(request: Request, env: Env): Headers {
  // The answer differs per Origin, so caches must not reuse it across origins.
  const headers = new Headers({ Vary: 'Origin' });
  const origin = request.headers.get('Origin');
  if (origin && allowedOrigins(env).includes(origin)) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
    headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
    headers.set('Access-Control-Max-Age', '600');
  }
  return headers;
}

export const preflight = (request: Request, env: Env): Response =>
  empty(204, corsHeaders(request, env));
