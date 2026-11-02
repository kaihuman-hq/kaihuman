import { githubService } from '@kaihuman/core';
import {
  appendJsonl,
  KEY_ORDER,
  LINKS_PATH,
  type LinkRecord,
  type Result,
  replaceJsonlLines,
  ulid,
} from '@kaihuman/formats/business';
import { encryptShareBlob, newShareKey, parseShareUrl, shareUrl } from '@kaihuman/formats/share';
import type { KBRepo } from '../github-kb';
import { writeBusiness } from './write';

export const SHARE_URL_KEY = 'lifeos_share_url';
export const SHARE_CONSENT_KEY = 'lifeos_share_consent_v1';
export const DEFAULT_SHARE_URL = 'https://docs.kaihuman.com';
export const UNREACHABLE_MESSAGE = 'The share service is not reachable.';
export const INVALID_ANSWER_MESSAGE =
  'The share service sent an answer that could not be used. Nothing was saved.';
export const LINK_GONE_MESSAGE = 'This link is no longer in the repository.';
export const NOT_SAVED_MESSAGE =
  'The link could not be saved in the repository and was removed again.';

export class ShareError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'ShareError';
  }
}

export class ShareUnavailableError extends ShareError {
  constructor() {
    super(UNREACHABLE_MESSAGE);
    this.name = 'ShareUnavailableError';
  }
}

export type SharedFile = {
  token: string;
  label: string;
  kind: 'pdf' | 'xml';
  size: number;
  created: string;
  expires: string | null;
  revoked: string | null;
  downloads: number;
};

export type SharedEvent = {
  id: string;
  token: string;
  label: string;
  at: string;
  client: 'browser' | 'bot' | 'other';
};

export type ShareApi = {
  upload(
    blob: Uint8Array,
    meta: { kind: 'pdf'; label: string; business: string; expires?: string },
  ): Promise<{ token: string; created: string; expires?: string }>;
  list(): Promise<{ files: SharedFile[]; used: number; quota: number }>;
  revoke(token: string): Promise<void>;
  events(since?: string): Promise<SharedEvent[]>;
  deleteAccount(): Promise<void>;
};

// Private mode or blocked storage throws on access; sharing then behaves as on a fresh device.
const readStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** The origin of an `https:` URL, else null. */
const httpsOrigin = (value: string): string | null => {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
};

/**
 * The per-device override (for self-hosters) wins over the build's default. Only its origin counts,
 * so API calls and links are always `<origin>/api/…` and `<origin>/d/<token>`.
 */
export function shareServiceUrl(): string {
  const override = readStorage(SHARE_URL_KEY);
  const origin = override ? httpsOrigin(override) : null;
  if (origin) return origin;
  return import.meta.env.VITE_SHARE_URL || DEFAULT_SHARE_URL;
}

/** The host of a configured service other than kaihuman's own, else null; the consent names it. */
export function customShareHost(): string | null {
  const current = new URL(shareServiceUrl());
  const own = [DEFAULT_SHARE_URL, import.meta.env.VITE_SHARE_URL || DEFAULT_SHARE_URL].map(
    (u: string) => httpsOrigin(u) ?? u,
  );
  return own.includes(current.origin) ? null : current.host;
}

const TOKEN = /^[A-Za-z0-9_-]{22}$/;

export const hasShareConsent = (): boolean => readStorage(SHARE_CONSENT_KEY) !== null;

export function acceptShareConsent(): void {
  try {
    localStorage.setItem(SHARE_CONSENT_KEY, new Date().toISOString());
  } catch {
    // Not remembered: the explanation is shown again next time, which is the safe side.
  }
}

/**
 * The Worker client. Only the GitHub token travels, in `Authorization`; callers pass ciphertext and
 * metadata, never the share key.
 */
export function shareApi(
  baseUrl: string,
  token: string,
  fetchImpl: typeof fetch = (...args) => fetch(...args),
): ShareApi {
  const base = baseUrl.replace(/\/+$/, '');

  async function call(
    path: string,
    init: { method?: string; headers?: Record<string, string>; body?: Uint8Array } = {},
  ): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, {
        method: init.method ?? 'GET',
        headers: { Authorization: `Bearer ${token}`, ...init.headers },
        ...(init.body ? { body: init.body as Uint8Array<ArrayBuffer> } : {}),
      });
    } catch {
      throw new ShareUnavailableError();
    }
    if (res.ok) return res;
    let message: string | null = null;
    try {
      const body: unknown = await res.json();
      if (typeof body === 'object' && body !== null && 'error' in body) {
        message = typeof body.error === 'string' ? body.error : null;
      }
    } catch {
      // Not JSON (a proxy page, say): the status is all there is.
    }
    throw new ShareError(message ?? `The share service answered ${res.status}.`, res.status);
  }

  async function json<T>(res: Response): Promise<T> {
    try {
      return (await res.json()) as T;
    } catch {
      throw new ShareError('The share service sent an answer that could not be read.');
    }
  }

  return {
    async upload(blob, meta) {
      const res = await call('/api/files', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          'X-KH-Kind': meta.kind,
          'X-KH-Label': meta.label,
          // Headers are byte strings; the Worker decodes this to carry any Unicode name.
          'X-KH-Business': encodeURIComponent(meta.business),
          ...(meta.expires ? { 'X-KH-Expires': meta.expires } : {}),
        },
        body: blob,
      });
      const r = await json<{ token: string; created: string; expires: string | null }>(res);
      return { token: r.token, created: r.created, ...(r.expires ? { expires: r.expires } : {}) };
    },
    async list() {
      return json(await call('/api/files'));
    },
    async revoke(fileToken) {
      await call(`/api/files/${encodeURIComponent(fileToken)}`, { method: 'DELETE' });
    },
    async events(since) {
      const query = since ? `?since=${encodeURIComponent(since)}` : '';
      return (await json<{ events: SharedEvent[] }>(await call(`/api/events${query}`))).events;
    },
    async deleteAccount() {
      await call('/api/account', { method: 'DELETE' });
    },
  };
}

export type ShareDeps = {
  api: ShareApi;
  baseUrl: string;
  /** The profile name, shown on the landing page. */
  business: string;
  now?: () => Date;
};

const repoParts = (target: KBRepo): [string, string] => {
  const [owner = '', name = ''] = target.full_name.split('/');
  return [owner, name];
};

/**
 * Uploads the document's PDF encrypted and records the link in the repository. The key exists only
 * in the returned URL and the repo's (private) links file. Order matters for Review Focus 4: an
 * upload failure commits nothing, and an upload whose commit fails is revoked again.
 */
export async function createShareLink(
  target: KBRepo,
  doc: { number: string; path: string; expires?: string },
  deps: ShareDeps,
): Promise<{ url: string; link: LinkRecord }> {
  const [owner, name] = repoParts(target);
  const headSha = await githubService.getHeadSha(owner, name, target.default_branch);
  const pdf = await githubService.getFileBytes(owner, name, doc.path.replace(/\.ya?ml$/, '.pdf'), {
    ref: headSha,
  });
  const key = newShareKey();
  const blob = await encryptShareBlob(pdf, key);
  const uploaded = await deps.api.upload(blob, {
    kind: 'pdf',
    label: doc.number,
    business: deps.business,
    ...(doc.expires ? { expires: doc.expires } : {}),
  });

  // A token outside the format would put whatever the service said into the link and the repo.
  if (!TOKEN.test(uploaded.token)) {
    await revokeQuietly(deps.api, uploaded.token);
    throw new ShareError(INVALID_ANSWER_MESSAGE);
  }

  const url = shareUrl(deps.baseUrl, uploaded.token, key);
  const record: LinkRecord = {
    id: ulid(),
    doc: doc.number,
    url,
    created: (deps.now?.() ?? new Date()).toISOString(),
    ...(doc.expires ? { expires: doc.expires } : {}),
  };
  let saved = false;
  try {
    const result = await writeBusiness(target, async (fresh) => ({
      ok: true,
      value: {
        changes: {
          [LINKS_PATH]: appendJsonl((await fresh.read(LINKS_PATH)) ?? '', record, KEY_ORDER.link),
        },
        message: `business: share link for ${doc.number}`,
      },
    }));
    saved = result.ok;
  } catch {
    saved = false;
  }
  if (!saved) {
    await revokeQuietly(deps.api, uploaded.token);
    throw new ShareError(NOT_SAVED_MESSAGE);
  }
  return { url, link: record };
}

async function revokeQuietly(api: ShareApi, token: string): Promise<void> {
  try {
    await api.revoke(token);
  } catch {
    // Best effort: the file stays unreachable without the key, which nobody has.
  }
}

/** Revokes on the service first (404 = already gone), then marks that line `revoked` in one commit. */
export async function revokeShareLink(
  target: KBRepo,
  link: LinkRecord,
  deps: { api: ShareApi; now?: () => Date },
): Promise<Result<{ commitSha: string }>> {
  const parsed = parseShareUrl(link.url);
  if (!parsed) throw new ShareError('This link in the repository is not a share link.');
  // A 404 from another service would read as "already revoked" while the link stays live, and a
  // host read from the repository is never called.
  const service = new URL(shareServiceUrl()).origin;
  if (parsed.host !== service) {
    const host = new URL(parsed.host).host;
    throw new ShareError(
      `This link was created on ${host}. Switch the share service to ${host} to revoke it.`,
    );
  }
  try {
    await deps.api.revoke(parsed.token);
  } catch (e) {
    if (!(e instanceof ShareError && e.status === 404)) throw e;
  }
  const revoked = (deps.now?.() ?? new Date()).toISOString();
  return writeBusiness(target, async (fresh) => {
    const text = (await fresh.read(LINKS_PATH)) ?? '';
    let found = false;
    const next = replaceJsonlLines(
      text,
      (raw) => {
        if (raw.id !== link.id) return null;
        found = true;
        return { ...raw, revoked };
      },
      KEY_ORDER.link,
    );
    if (!found) {
      return {
        ok: false,
        issues: [{ path: LINKS_PATH, message: LINK_GONE_MESSAGE }],
      };
    }
    return {
      ok: true,
      value: {
        changes: { [LINKS_PATH]: next },
        message: `business: revoke share link for ${link.doc}`,
      },
    };
  });
}
