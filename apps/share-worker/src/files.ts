/**
 * The files API: upload, list and revoke. Every query is scoped by the caller's GitHub id, so
 * one user can never see, revoke or count against another user's files.
 */

import { newShareToken } from '@kaihuman/formats/share';
import {
  findFile,
  insertFile,
  type Kind,
  listFiles,
  revokeFile,
  uploadsSince,
  usedBytes,
} from './db.js';
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

const NOT_ENCRYPTED = 'The upload is not an encrypted file.';

/** Reads at most `max` bytes; null (and the stream cancelled) as soon as there are more. */
async function readCapped(
  stream: ReadableStream<Uint8Array> | null,
  max: number,
): Promise<Uint8Array | null> {
  if (!stream) return new Uint8Array(0);
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

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
  // The length is checked before anything is read, so an upload cannot fill the isolate's
  // memory; the stream is still counted in case the header lies.
  const lengthHeader = request.headers.get('Content-Length') ?? '';
  if (!/^\d{1,15}$/.test(lengthHeader)) return error('Content length required.', 411);
  const declared = Number(lengthHeader);
  if (declared > limits.maxCipherBytes) return error(tooLarge(limits), 413);
  if (declared <= CIPHER_OVERHEAD) return error(NOT_ENCRYPTED, 400);

  const now = deps.now();
  const since = new Date(now - RATE_WINDOW_MS).toISOString();
  if (!withinRate(await uploadsSince(env.DB, userId, since), limits)) {
    return error(TOO_MANY_UPLOADS, 429);
  }
  // Two parallel uploads can both pass this check; the overshoot is at most one file.
  if (!fitsQuota(await usedBytes(env.DB, userId), declared, limits)) {
    return error(quotaReached(limits), 413);
  }

  const body = await readCapped(request.body, limits.maxCipherBytes);
  if (body === null) return error(tooLarge(limits), 413);
  if (body.byteLength !== declared) {
    return error('The upload does not match its Content-Length.', 400);
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
      business: row.business,
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
  if (!revoked) {
    // The token is public to anyone holding the link, so saying it exists leaks nothing; a 404
    // here would make the console record a revoke while the file stays live (S11).
    const other = await findFile(env.DB, token);
    return other ? error('This link belongs to another GitHub account.', 403) : notFound();
  }
  await env.FILES.delete(objectKey(userId, token));
  return empty(204);
}
