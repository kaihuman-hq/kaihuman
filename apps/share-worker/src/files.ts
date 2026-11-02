/**
 * The files API: upload, list and revoke. Every query is scoped by the caller's GitHub id, so
 * one user can never see, revoke or count against another user's files.
 */

import { newShareToken } from '@kaihuman/formats/share';
import { insertFile, type Kind, listFiles, revokeFile, uploadsSince, usedBytes } from './db.js';
import { type Deps, type Env, objectKey } from './env.js';
import {
  CIPHER_OVERHEAD,
  fitsQuota,
  limitsOf,
  quotaReached,
  RATE_WINDOW_MS,
  TOO_MANY_UPLOADS,
  tooLarge,
  withinRate,
} from './limits.js';
import { empty, error, json, notFound } from './respond.js';

interface UploadMeta {
  kind: Kind;
  label: string;
  business: string;
  expires: string | null;
}

const LABEL = /^[A-Za-z0-9_.-]{1,80}$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isRealDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

/**
 * Headers are byte strings, so the console sends the business name percent-encoded
 * (`encodeURIComponent`) to carry any Unicode name.
 */
function decodeBusiness(raw: string | null): string | null {
  if (raw === null) return null;
  let name: string;
  try {
    name = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const length = [...name].length;
  if (length < 1 || length > 120 || name.trim() === '' || /\p{Cc}/u.test(name)) return null;
  return name;
}

function readMeta(headers: Headers): UploadMeta | string {
  const kind = headers.get('X-KH-Kind');
  if (kind !== 'pdf' && kind !== 'xml') return 'Unsupported kind (pdf or xml).';
  const label = headers.get('X-KH-Label') ?? '';
  if (!LABEL.test(label)) return 'Invalid label.';
  const business = decodeBusiness(headers.get('X-KH-Business'));
  if (business === null) return 'Invalid business name.';
  const expires = headers.get('X-KH-Expires');
  if (expires !== null && !isRealDate(expires)) return 'Invalid expiry date.';
  return { kind, label, business, expires };
}

export async function uploadFile(
  request: Request,
  env: Env,
  userId: number,
  deps: Deps,
): Promise<Response> {
  const meta = readMeta(request.headers);
  if (typeof meta === 'string') return error(meta, 400);

  const limits = limitsOf(env);
  const declared = Number(request.headers.get('Content-Length'));
  if (declared > limits.maxCipherBytes) return error(tooLarge(limits), 413);
  const body = new Uint8Array(await request.arrayBuffer());
  if (body.byteLength > limits.maxCipherBytes) return error(tooLarge(limits), 413);
  if (body.byteLength <= CIPHER_OVERHEAD) return error('The upload is not an encrypted file.', 400);

  const now = deps.now();
  const since = new Date(now - RATE_WINDOW_MS).toISOString();
  if (!withinRate(await uploadsSince(env.DB, userId, since), limits)) {
    return error(TOO_MANY_UPLOADS, 429);
  }
  // Two parallel uploads can both pass this check; the overshoot is at most one file.
  if (!fitsQuota(await usedBytes(env.DB, userId), body.byteLength, limits)) {
    return error(quotaReached(limits), 413);
  }

  const token = newShareToken();
  const created = new Date(now).toISOString();
  const key = objectKey(userId, token);
  await env.FILES.put(key, body);
  try {
    await insertFile(env.DB, {
      token,
      user_id: userId,
      label: meta.label,
      business: meta.business,
      kind: meta.kind,
      size: body.byteLength,
      created_at: created,
      expires_at: meta.expires,
    });
  } catch (cause) {
    // No row means no link: do not leave an object nobody can revoke.
    await env.FILES.delete(key);
    throw cause;
  }

  return json({ token, size: body.byteLength, created, expires: meta.expires }, 201);
}

export async function listOwnFiles(env: Env, userId: number): Promise<Response> {
  const [rows, used] = await Promise.all([listFiles(env.DB, userId), usedBytes(env.DB, userId)]);
  return json({
    files: rows.map((row) => ({
      token: row.token,
      label: row.label,
      kind: row.kind,
      size: row.size,
      created: row.created_at,
      expires: row.expires_at,
      revoked: row.revoked_at,
      downloads: row.downloads,
    })),
    used,
    quota: limitsOf(env).quotaBytes,
  });
}

export async function revokeOwnFile(
  env: Env,
  userId: number,
  token: string,
  deps: Deps,
): Promise<Response> {
  const revoked = await revokeFile(env.DB, userId, token, new Date(deps.now()).toISOString());
  if (!revoked) return notFound();
  await env.FILES.delete(objectKey(userId, token));
  return empty(204);
}
