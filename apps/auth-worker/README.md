# @kaihuman/auth-worker

A Cloudflare Worker that runs the GitHub sign-in for the kaihuman console. GitHub OAuth needs a
client secret to turn the one-time code into an access token, and the secret cannot live in the
browser. This worker holds the secret and does that one exchange.

The worker has no KV, D1, R2 or other storage binding, and it does not log the token. The token
exists only in the request that hands it to the browser. The whole worker is
[`src/index.ts`](src/index.ts).

## Flow

1. The console sends the browser to `GET /login` (`VITE_GH_LOGIN`).
2. The worker sets a short-lived state cookie and redirects to GitHub's authorize page with
   `scope=repo` and `redirect_uri=<worker origin>/callback`.
3. GitHub redirects back to `GET /callback?code=…&state=…`. The worker checks the state against
   the cookie, exchanges the code with GitHub, and redirects to `APP_URL/?access_token=…`.
4. The console reads `access_token` from the URL, stores it on the device and removes it from the
   address bar.

| Path | Result |
| --- | --- |
| `GET /login` | 302 to GitHub, sets the `kh_oauth_state` cookie (10 minutes) |
| `GET /callback` | 302 to `APP_URL/?access_token=…`; 400 for a missing code, a state mismatch or an error from GitHub; 502 if GitHub refuses the code |
| anything else | 404 (405 for methods other than `GET`) |

## Configuration

| Name | Kind | Value |
| --- | --- | --- |
| `GITHUB_CLIENT_ID` | secret | Client ID of the GitHub OAuth app |
| `GITHUB_CLIENT_SECRET` | secret | Client secret of the GitHub OAuth app |
| `APP_URL` | var in `wrangler.jsonc` | Where the console runs: `https://app.kaihuman.com` |

The worker is served at `auth.kaihuman.com` (`routes` in `wrangler.jsonc`). To use another
host, change the route there and the callback URL of the OAuth app.

## Set up production

Prerequisites: a Cloudflare account with the `kaihuman.com` zone, `pnpm install` done at the repo
root.

1. **Create a GitHub OAuth app.** GitHub → Settings → Developer settings → OAuth Apps → New
   OAuth App (for the organization: Organization settings → Developer settings → OAuth Apps).
   - Homepage URL: `https://kaihuman.com`
   - Authorization callback URL: `https://auth.kaihuman.com/callback`

   Generate a client secret and keep the page open.
2. **Log in to Cloudflare:**

   ```sh
   cd apps/auth-worker
   pnpm exec wrangler login
   ```

3. **Store the credentials as secrets** (paste each value when asked):

   ```sh
   pnpm exec wrangler secret put GITHUB_CLIENT_ID
   pnpm exec wrangler secret put GITHUB_CLIENT_SECRET
   ```

   If the worker does not exist yet, wrangler offers to create it.
4. **Deploy:** pushes to `main` that touch `apps/auth-worker/**` deploy automatically
   (`.github/workflows/deploy-auth-worker.yml`, needs the `CF_API_TOKEN` and `CF_ACCOUNT_ID`
   repository secrets; the token needs the *Workers Scripts: Edit* and *Workers Routes: Edit*
   permissions). Run it by hand from the Actions tab (*Run workflow*) for any branch. For a
   local deploy:

   ```sh
   pnpm run deploy
   ```

   Cloudflare creates the DNS record and certificate for `auth.kaihuman.com`.
5. **Check it:** open `https://auth.kaihuman.com/login`. GitHub must show the new OAuth app and
   ask for repository access.
6. **Point the console at it:** set `VITE_GH_LOGIN=https://auth.kaihuman.com/login` in
   `apps/console/.env.prod` and deploy the console.

Users who signed in through the old service keep their token. Tokens from the old OAuth app stay
valid until the user revokes them in GitHub (Settings → Applications), so you can retire the old
service once the console uses this worker.

## Local development

1. Create a second GitHub OAuth app for development with the callback URL
   `http://localhost:8787/callback`.
2. Copy `.dev.vars.example` to `.dev.vars` and fill in that app's client ID and secret.
   `.dev.vars` is git-ignored.
3. Start the worker and the console:

   ```sh
   pnpm --filter @kaihuman/auth-worker dev           # http://localhost:8787
   echo 'VITE_GH_LOGIN=http://localhost:8787/login' > apps/console/.env.local
   pnpm dev:console                                   # http://localhost:4300
   ```

## Checks

```sh
pnpm --filter @kaihuman/auth-worker test
pnpm --filter @kaihuman/auth-worker check-types
pnpm --filter @kaihuman/auth-worker lint
```
