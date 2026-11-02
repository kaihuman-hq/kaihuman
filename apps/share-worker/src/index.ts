/**
 * Share links for kaihuman business documents. The console encrypts a document in the
 * browser and uploads only the ciphertext; the key stays in the link's fragment, so this
 * worker can store and serve files but never read them.
 *
 * `/api/*` is for the signed-in console (GitHub token, CORS for `CONSOLE_ORIGINS`).
 */

import { authUser } from './auth.js';
import { corsHeaders, preflight } from './cors.js';
import type { Deps, Env } from './env.js';
import { listOwnFiles, revokeOwnFile, uploadFile } from './files.js';
import { error, notFound, withHeaders } from './respond.js';

export type { Env } from './env.js';

const FILE_PATH = /^\/api\/files\/([A-Za-z0-9_-]{22})$/;

type Handler = (userId: number) => Promise<Response>;

/** The handler for an `/api/*` request, a 404/405 response, before any auth. */
function route(request: Request, env: Env, deps: Deps, path: string): Handler | Response {
  if (path === '/api/files') {
    if (request.method === 'POST') return (id) => uploadFile(request, env, id, deps);
    if (request.method === 'GET') return (id) => listOwnFiles(env, id);
    return methodNotAllowed('GET, POST');
  }
  const token = FILE_PATH.exec(path)?.[1];
  if (token) {
    if (request.method === 'DELETE') return (id) => revokeOwnFile(env, id, token, deps);
    return methodNotAllowed('DELETE');
  }
  return notFound();
}

function methodNotAllowed(allow: string): Response {
  return error('Method not allowed', 405, { Allow: allow });
}

async function api(request: Request, env: Env, deps: Deps, path: string): Promise<Response> {
  const handler = route(request, env, deps, path);
  if (handler instanceof Response) return handler;
  const user = await authUser(request, env, deps.fetch, deps.now);
  if (user instanceof Response) return user;
  try {
    return await handler(user.id);
  } catch (cause) {
    console.error('share-worker: request failed', cause instanceof Error ? cause.message : cause);
    return error('Something went wrong. Try again later.', 500);
  }
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (!path.startsWith('/api/')) return notFound();
  if (request.method === 'OPTIONS') return preflight(request, env);
  // CORS headers on every API answer, errors included, so the console can read the message.
  return withHeaders(await api(request, env, deps, path), corsHeaders(request, env));
}

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    // Wrapped: workerd refuses `fetch` called as a method of another object.
    return handle(request, env, { fetch: (input, init) => fetch(input, init), now: Date.now });
  },
};
