# @kaihuman/share-worker

A Cloudflare Worker that stores encrypted business documents for share links. The console
encrypts an invoice or offer in the browser (AES-GCM 256, a new key per document), uploads only
the ciphertext, and builds a link `https://docs.kaihuman.com/d/<token>#<key>`. The key is in the
fragment: browsers never send it, the console never sends it to the worker, and the landing page
script passes it only to the decrypt function. The worker can store and serve files but never
read them.

Storage: D1 (`files`, `events`; schema in [`migrations/`](migrations/))
and an R2 bucket in the EU jurisdiction, one object per file under `<github user id>/<token>`.
Download events keep the time, the token and a coarse client class (`browser`, `bot`, `other`).
The worker stores no IP address, no full User-Agent and no GitHub token.

## Endpoints

| Path | Who | Result |
| --- | --- | --- |
| `GET`, `HEAD /d/:token` | anyone | Landing page with a Download button. Counts nothing and changes nothing, because email scanners open links first. 404 `This link does not exist.`, 410 `This link is no longer available.` for revoked or expired links |
| `GET /d/:token/blob` | anyone | The ciphertext, and one download event. 404/410 as above, with nothing recorded |
| `POST /api/files` | console | Upload ciphertext (`X-KH-Kind`, `X-KH-Label`, `X-KH-Business` percent-encoded, optional `X-KH-Expires`) |
| `GET /api/files` | console | Own files (label, business, kind, size, dates, download count), used bytes and quota |
| `DELETE /api/files/:token` | console | Revoke: deletes the R2 object and marks the file revoked; 403 for another user's token, 404 for an unknown one |
| `GET /api/events?since=<ISO>` | console | Own download events after `since`, oldest first, at most 500 |
| `DELETE /api/account` | console | Deletes all the caller's R2 objects, files and events |

`/api/*` needs `Authorization: Bearer <GitHub token>`. The worker asks `api.github.com/user` for
the numeric user id and keys everything by it. Only origins in `CONSOLE_ORIGINS` get CORS
headers. Every response sends `Cache-Control: no-store` and `Referrer-Policy: no-referrer`;
landing pages also send `X-Robots-Tag: noindex` and a CSP that allows only their one inline
script (by nonce) and same-origin fetches.

A link expires after the end of its `expires_at` day (UTC).

## Configuration

All values are vars in [`wrangler.jsonc`](wrangler.jsonc). The worker has no secrets.

| Name | Production value |
| --- | --- |
| `CONSOLE_ORIGINS` | `https://app.kaihuman.com` (comma-separated list) |
| `QUOTA_BYTES` | `524288000` (500 MB per GitHub user, revoked files excluded) |
| `MAX_BYTES` | `10485760` (10 MB plaintext; the ciphertext may be 28 bytes larger) |
| `UPLOADS_PER_HOUR` | `30` (per user, rolling hour) |
| `ABUSE_EMAIL` | `abuse@kaihuman.com` (the "Report abuse" link on every landing page) |

## Set up production

Prerequisites: a Cloudflare account with the `kaihuman.com` zone, `pnpm install` done at the repo
root. Run the commands in `apps/share-worker`.

1. **Log in to Cloudflare:**

   ```sh
   cd apps/share-worker
   pnpm exec wrangler login
   ```

2. **Create the D1 database:**

   ```sh
   pnpm exec wrangler d1 create kaihuman-share
   ```

3. **Put the database id in `wrangler.jsonc`:** replace `<set after wrangler d1 create>` in
   `d1_databases[0].database_id` with the `database_id` from the output, and commit it.
4. **Create the tables:**

   ```sh
   pnpm exec wrangler d1 migrations apply kaihuman-share --remote
   ```

5. **Create the R2 bucket in the EU jurisdiction:**

   ```sh
   pnpm exec wrangler r2 bucket create kaihuman-share --jurisdiction eu
   ```

6. **Set the vars:** check the values in `wrangler.jsonc` (table above). Change
   `CONSOLE_ORIGINS` if the console runs elsewhere and `ABUSE_EMAIL` to a monitored mailbox.
7. **Deploy:**

   ```sh
   pnpm --filter @kaihuman/share-worker run deploy
   ```

8. **Add the custom domain:** the `routes` entry (`docs.kaihuman.com`, `custom_domain: true`)
   makes Cloudflare create the DNS record and certificate on deploy. If it does not, add it in the
   dashboard: Workers & Pages → `kaihuman-share` → Settings → Domains & Routes → Add → Custom
   domain → `docs.kaihuman.com`.
9. **Check it:** `https://docs.kaihuman.com/d/AAAAAAAAAAAAAAAAAAAAAA` shows
   `This link does not exist.` The console uses `VITE_SHARE_URL=https://docs.kaihuman.com` by
   default.

## Local development

```sh
cd apps/share-worker
cp .dev.vars.example .dev.vars          # allows the console dev server as an origin
pnpm exec wrangler d1 migrations apply kaihuman-share --local
pnpm dev                                # wrangler dev on http://localhost:8788
```

`wrangler dev` uses local D1 and R2 storage. To point a console at it, start or build the console
with `VITE_SHARE_URL=http://localhost:8788`. The per-device `lifeos_share_url` override accepts
only `https://` URLs, so it cannot point at `http://localhost`.

Tests run against in-memory D1 and R2 fakes: `pnpm --filter @kaihuman/share-worker test`.

## Operator tasks

### Disable a link (abuse report)

Reports arrive at `ABUSE_EMAIL` with the token in the subject. The server cannot read the file,
so act on the report itself. Look up the owner, mark the file revoked, then delete the object:

```sh
pnpm exec wrangler d1 execute kaihuman-share --remote \
  --command "SELECT user_id, label, business, created_at, revoked_at FROM files WHERE token = '<token>'"

pnpm exec wrangler d1 execute kaihuman-share --remote \
  --command "UPDATE files SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE token = '<token>' AND revoked_at IS NULL"

pnpm exec wrangler r2 object delete 'kaihuman-share/<user_id>/<token>' --jurisdiction eu --remote
```

The link then answers 410 `This link is no longer available.`, and the owner's console shows it
as revoked. The file stays in the owner's list and quota no longer counts it.

### Delete a user's data

`DELETE /api/account`, called with the user's GitHub token, removes their R2 objects first, then
their events and files rows. A retry after a partial failure is safe.
