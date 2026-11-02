/**
 * Every response leaves no copy in caches and sends no Referer onwards: share URLs carry the
 * key in the fragment, and a cached or referred response must not hint at it.
 */

const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
  'Referrer-Policy': 'no-referrer',
};

export function json(body: unknown, status = 200, headers?: HeadersInit): Response {
  const out = new Headers(headers);
  out.set('Content-Type', 'application/json; charset=utf-8');
  return finish(new Response(JSON.stringify(body), { status, headers: out }));
}

/** All JSON errors are `{ error: string }`. */
export const error = (message: string, status: number, headers?: HeadersInit): Response =>
  json({ error: message }, status, headers);

export const empty = (status: number, headers?: HeadersInit): Response =>
  finish(new Response(null, { status, headers }));

export const notFound = (): Response => error('Not found', 404);

function finish(response: Response): Response {
  for (const [name, value] of Object.entries(BASE_HEADERS)) response.headers.set(name, value);
  return response;
}

/** Adds headers (e.g. CORS) to a response built elsewhere. */
export function withHeaders(response: Response, headers: HeadersInit): Response {
  for (const [name, value] of new Headers(headers)) response.headers.set(name, value);
  return response;
}
