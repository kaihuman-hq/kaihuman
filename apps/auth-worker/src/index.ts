/**
 * GitHub OAuth sign-in for the kaihuman console.
 *
 * `/login` sends the browser to GitHub. `/callback` exchanges GitHub's one-time code for an
 * access token and redirects to the console with the token in the URL. The worker has no
 * storage bindings and never logs the token, so the token exists only in this request.
 *
 * GitHub App user tokens expire after 8 hours. GitHub then also returns a refresh token, which is
 * passed on with the access token; `POST /refresh` trades it for a new pair, because that exchange
 * needs the client secret too.
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Where the console runs, e.g. `https://app.kaihuman.com`. */
  APP_URL: string;
}

const STATE_COOKIE = 'kh_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;
// Where the native app receives the token. Marked in the state so it is covered by the same
// strict state/cookie equality check as the rest of the state.
const MOBILE_REDIRECT = 'kaihuman://auth/callback';
const MOBILE_STATE_SUFFIX = ':mobile';

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/refresh') {
      return request.method === 'POST' ? refresh(request, env) : text('Method not allowed', 405);
    }
    if (request.method !== 'GET') {
      return text('Method not allowed', 405);
    }
    switch (url.pathname) {
      case '/login':
        return login(url, env);
      case '/callback':
        return callback(request, url, env);
      default:
        return text('Not found', 404);
    }
  },
};

function login(url: URL, env: Env): Response {
  // The state ties the callback to a login this browser started, so another site cannot
  // log the user into an account of its choosing.
  const mobile = url.searchParams.get('client') === 'mobile';
  const state = crypto.randomUUID() + (mobile ? MOBILE_STATE_SUFFIX : '');
  const authorize = new URL('https://github.com/login/oauth/authorize');
  authorize.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
  authorize.searchParams.set('redirect_uri', callbackUrl(url));
  authorize.searchParams.set('scope', 'repo');
  authorize.searchParams.set('state', state);

  return redirect(authorize.toString(), stateCookie(state, STATE_MAX_AGE_SECONDS));
}

async function callback(request: Request, url: URL, env: Env): Promise<Response> {
  const gitHubError = url.searchParams.get('error');
  if (gitHubError) {
    return text(`GitHub sign-in failed: ${gitHubError}`, 400);
  }

  const code = url.searchParams.get('code');
  if (!code) {
    return text('Missing code', 400);
  }

  const state = url.searchParams.get('state');
  if (!state || state !== readCookie(request, STATE_COOKIE)) {
    return text('Sign-in expired or was not started here. Please sign in again.', 400);
  }

  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: callbackUrl(url),
    }),
  });
  if (!response.ok) {
    return text(`GitHub token exchange failed with status ${response.status}`, 502);
  }

  // GitHub answers 200 with `error` for a bad or reused code.
  const body = (await response.json()) as TokenResponse;
  if (!body.access_token) {
    return text(`GitHub token exchange failed: ${body.error ?? 'no access token'}`, 502);
  }

  const target = new URL(state.endsWith(MOBILE_STATE_SUFFIX) ? MOBILE_REDIRECT : env.APP_URL);
  for (const [key, value] of Object.entries(tokenFields(body))) {
    target.searchParams.set(key, String(value));
  }
  return redirect(target.toString(), stateCookie('', 0));
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
}

/** The fields a client keeps; the expiry ones only exist for expiring (GitHub App) tokens. */
function tokenFields(body: TokenResponse): Record<string, string | number> {
  const fields: Record<string, string | number> = {};
  for (const key of [
    'access_token',
    'refresh_token',
    'expires_in',
    'refresh_token_expires_in',
  ] as const) {
    const value = body[key];
    if (value !== undefined && value !== null && value !== '') fields[key] = value;
  }
  return fields;
}

/** `POST /refresh {"refresh_token": "..."}` → the new token pair. GitHub rotates the refresh token. */
async function refresh(request: Request, env: Env): Promise<Response> {
  const input = (await request.json().catch(() => null)) as { refresh_token?: unknown } | null;
  const refreshToken = input?.refresh_token;
  if (typeof refreshToken !== 'string' || !refreshToken) {
    return json({ error: 'missing_refresh_token' }, 400);
  }
  const response = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  }).catch(() => null);
  if (!response?.ok) return json({ error: 'github_unavailable' }, 502);
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!body.access_token) {
    // Only a rejected refresh token means signing in again; a misconfigured worker must not.
    const status = body.error === 'bad_refresh_token' ? 401 : 502;
    return json({ error: body.error ?? 'no_access_token' }, status);
  }
  return json(tokenFields(body), 200);
}

function json(body: unknown, status: number): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function callbackUrl(url: URL): string {
  return `${url.origin}/callback`;
}

function stateCookie(value: string, maxAge: number): string {
  return `${STATE_COOKIE}=${value}; Max-Age=${maxAge}; Path=/callback; HttpOnly; Secure; SameSite=Lax`;
}

function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get('Cookie') ?? '';
  for (const part of header.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) return value.join('=');
  }
  return undefined;
}

function redirect(location: string, cookie: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      'Set-Cookie': cookie,
      // The callback redirect carries the token: keep it out of caches and Referer headers.
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}

function text(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' },
  });
}
