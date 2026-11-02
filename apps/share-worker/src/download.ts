/**
 * Public share links: finding a link's file and serving its ciphertext. Only the blob counts
 * as a download; the landing page uses `openLink` and changes nothing.
 */

import { ulid } from '@kaihuman/formats/business';
import { clientClass } from './client-class.js';
import { type FileRow, findFile, insertEvent } from './db.js';
import { type Deps, type Env, objectKey } from './env.js';
import { error, stream } from './respond.js';

export const NOT_FOUND = 'This link does not exist.';
export const GONE = 'This link is no longer available.';

export type Link = { state: 'missing' } | { state: 'gone' } | { state: 'open'; file: FileRow };

/** Today as `YYYY-MM-DD` in UTC; a link expires after the end of its `expires_at` day. */
const utcDay = (nowMs: number): string => new Date(nowMs).toISOString().slice(0, 10);

export async function openLink(env: Env, token: string, nowMs: number): Promise<Link> {
  const file = await findFile(env.DB, token);
  if (!file) return { state: 'missing' };
  if (file.revoked_at !== null) return { state: 'gone' };
  if (file.expires_at !== null && file.expires_at < utcDay(nowMs)) return { state: 'gone' };
  return { state: 'open', file };
}

export async function downloadBlob(
  request: Request,
  env: Env,
  token: string,
  deps: Deps,
): Promise<Response> {
  const now = deps.now();
  const link = await openLink(env, token, now);
  if (link.state === 'missing') return error(NOT_FOUND, 404);
  if (link.state === 'gone') return error(GONE, 410);
  const object = await env.FILES.get(objectKey(link.file.user_id, token));
  if (!object) return error(GONE, 410);

  await insertEvent(env.DB, {
    id: ulid(),
    token,
    user_id: link.file.user_id,
    at: new Date(now).toISOString(),
    client: clientClass(request.headers.get('User-Agent')),
  });
  return stream(object.body, {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(object.size),
    'X-Content-Type-Options': 'nosniff',
  });
}
