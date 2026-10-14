/** A GitHub call that failed; `retryAt` (epoch ms) is set when GitHub said when to come back. */
export class GithubHttpError extends Error {
  status: number;
  retryAt?: number;

  constructor(message: string, status: number, retryAt?: number) {
    super(message);
    this.name = 'GithubHttpError';
    this.status = status;
    this.retryAt = retryAt;
  }
}

/** The file changed since it was read (`409`), or the sha no longer matches (`422`). */
export class WriteConflict extends Error {
  constructor(message = 'The file changed while saving') {
    super(message);
    this.name = 'WriteConflict';
  }
}

function retryAtOf(res: Response, now = Date.now()): number | undefined {
  const retryAfter = Number(res.headers?.get('retry-after'));
  if (res.headers?.get('retry-after') && Number.isFinite(retryAfter)) {
    return now + retryAfter * 1000;
  }
  const reset = Number(res.headers?.get('x-ratelimit-reset'));
  if (res.headers?.get('x-ratelimit-remaining') === '0' && Number.isFinite(reset) && reset > 0) {
    return reset * 1000;
  }
  return undefined;
}

/** GitHub answers over HTTP/2, which has no status text, so the reason comes from the body. */
export async function githubHttpError(res: Response, action: string): Promise<GithubHttpError> {
  const body = await Promise.resolve()
    .then(() => res.json())
    .catch(() => null);
  const reason = (body as { message?: string } | null)?.message || res.statusText;
  return new GithubHttpError(
    `${action}: ${res.status}${reason ? ` ${reason}` : ''}`,
    res.status,
    retryAtOf(res),
  );
}

// GitHub stores file content as base64; `atob`/`btoa` only speak latin-1, so round-trip
// through UTF-8 bytes to keep non-ASCII text intact.
function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

const contentsUrl = (repo: string, path: string) =>
  `https://api.github.com/repos/${repo}/contents/${path}`;

export type RepoFileRead =
  | { status: 'unchanged' }
  | { status: 'missing' }
  | { status: 'ok'; content: string; sha: string; etag: string | null };

export async function readRepoFile(
  token: string,
  repo: string,
  path: string,
  etag?: string | null,
): Promise<RepoFileRead> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
  // A conditional request is answered from GitHub's validators; without one, a read that feeds a
  // write must not see a copy GitHub marked cacheable for a minute.
  if (etag) headers['If-None-Match'] = etag;
  const res = await fetch(
    contentsUrl(repo, path),
    etag ? { headers } : { headers, cache: 'no-store' },
  );
  if (res.status === 304) return { status: 'unchanged' };
  if (res.status === 404) return { status: 'missing' };
  if (!res.ok) throw await githubHttpError(res, `Failed to read ${path}`);
  const data = await res.json();
  return {
    status: 'ok',
    content: decodeBase64(data.content || ''),
    sha: data.sha,
    etag: res.headers?.get('etag') ?? null,
  };
}

/** Returns the new blob sha. */
export async function writeRepoFile(
  token: string,
  repo: string,
  path: string,
  content: string,
  sha: string | null,
  message: string,
): Promise<string> {
  const res = await fetch(contentsUrl(repo, path), {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({ message, content: encodeBase64(content), ...(sha ? { sha } : {}) }),
  });
  if (res.status === 409 || res.status === 422) throw new WriteConflict();
  if (!res.ok) throw await githubHttpError(res, `Failed to write ${path}`);
  const data = await res.json();
  return data?.content?.sha ?? sha ?? '';
}
