/**
 * Share links for kaihuman business documents. The console encrypts a document in the
 * browser and uploads only the ciphertext; the key stays in the link's fragment, so this
 * worker can store and serve files but never read them.
 *
 * `/d/:token` is the public landing page and `/d/:token/blob` the ciphertext; only the blob
 * records a download. `/api/*` is for the signed-in console (GitHub token, CORS for
 * `CONSOLE_ORIGINS`).
 */

import { deleteAccount } from './account.js';
import { authUser } from './auth.js';
import { corsHeaders, preflight } from './cors.js';
import { downloadBlob } from './download.js';
import type { Deps, Env } from './env.js';
import { listOwnEvents } from './events.js';
import { listOwnFiles, revokeOwnFile, uploadFile } from './files.js';
import { landingPage } from './landing.js';
import { error, notFound, withHeaders } from './respond.js';

export type { Env } from './env.js';

const FILE_PATH = /^\/api\/files\/([A-Za-z0-9_-]{22})$/;
const LINK_PATH = /^\/d\/([A-Za-z0-9_-]{22})(\/blob)?$/;

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
  if (path === '/api/events') {
    if (request.method === 'GET') return (id) => listOwnEvents(request, env, id);
    return methodNotAllowed('GET');
  }
  if (path === '/api/account') {
    if (request.method === 'DELETE') return (id) => deleteAccount(env, id);
    return methodNotAllowed('DELETE');
  }
  return notFound();
}

/** `/d/*`: public, no auth and no CORS. */
async function link(request: Request, env: Env, deps: Deps, path: string): Promise<Response> {
  const match = LINK_PATH.exec(path);
  const token = match?.[1] ?? null;
  if (token && match?.[2]) {
    if (request.method !== 'GET') return methodNotAllowed('GET');
    return failSafe(() => downloadBlob(request, env, token, deps));
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed('GET, HEAD');
  return failSafe(() => landingPage(request, env, token, deps));
}

function methodNotAllowed(allow: string): Response {
  return error('Method not allowed', 405, { Allow: allow });
}

async function api(request: Request, env: Env, deps: Deps, path: string): Promise<Response> {
  const handler = route(request, env, deps, path);
  if (handler instanceof Response) return handler;
  const user = await authUser(request, env, deps.fetch, deps.now);
  if (user instanceof Response) return user;
  return failSafe(() => handler(user.id));
}

async function failSafe(run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (cause) {
    console.error('share-worker: request failed', cause instanceof Error ? cause.message : cause);
    return error('Something went wrong. Try again later.', 500);
  }
}

export async function handle(request: Request, env: Env, deps: Deps): Promise<Response> {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/d/')) return link(request, env, deps, path);
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
