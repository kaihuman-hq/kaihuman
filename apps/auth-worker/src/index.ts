/**
 * GitHub OAuth sign-in for the kaihuman console.
 *
 * `/login` sends the browser to GitHub. `/callback` exchanges GitHub's one-time code for an
 * access token and redirects to the console with the token in the URL. The worker has no
 * storage bindings and never logs the token, so the token exists only in this request.
 */

export interface Env {
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  /** Where the console runs, e.g. `https://app.kaihuman.com`. */
  APP_URL: string;
}

const STATE_COOKIE = 'kh_oauth_state';
const STATE_MAX_AGE_SECONDS = 600;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'GET') {
      return text('Method not allowed', 405);
    }
    const url = new URL(request.url);
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
  const state = crypto.randomUUID();
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
  const body = (await response.json()) as { access_token?: string; error?: string };
  if (!body.access_token) {
    return text(`GitHub token exchange failed: ${body.error ?? 'no access token'}`, 502);
  }

  const target = new URL(env.APP_URL);
  target.searchParams.set('access_token', body.access_token);
  return redirect(target.toString(), stateCookie('', 0));
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
