# Business, phase 4: share links — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clients can download offers and invoices at any time through links that are end-to-end encrypted and revocable. A new Cloudflare Worker (`apps/share-worker`, `docs.kaihuman.com`) stores only ciphertext. The console:

- encrypts a document's PDF in the browser
- uploads it after explicit consent
- records the link in the private repo
- shows link status and downloads
- can revoke links

A `/business/shared` page lists every upload. Download events flow back into `.kh/business/events.jsonl`.

**Architecture:**
- One dependency-free crypto module (`@kaihuman/formats/share`). The console and the Worker's landing page use the same `decryptShareBlob` function: the landing page inlines it with `Function.prototype.toString`, so the round-trip test exercises exactly the code that runs in the client's browser.
- The Worker is plain TypeScript with a `switch` router, like `apps/auth-worker`, plus D1 for records and R2 (EU) for ciphertext. Tests run in Vitest against hand-written in-memory D1/R2 fakes.
- Console writes go through the phase 3 `writeBusiness` layer.

**Tech Stack:** Cloudflare Workers (wrangler 4), D1, R2 (EU jurisdiction), WebCrypto AES-GCM, Preact console, Vitest. New root devDependency: `@cloudflare/workers-types` (types only).

**Spec:** `docs/superpowers/specs/2026-10-26-business-design.md` §7 "Share service", §10 phase 4, §11 tests. Phase 1–3 code: `packages/formats/src/business/*`, `apps/console/src/lib/business/*` (`write.ts`, `overview.ts`), `apps/auth-worker` (template).

## Global Constraints

- **Host and limits (user decisions 2026-11-02):**
  - Host: `docs.kaihuman.com`. The console default is `VITE_SHARE_URL=https://docs.kaihuman.com`, with a per-device override in localStorage `lifeos_share_url` for self-hosters.
  - Quota: 500 MB per GitHub user (`QUOTA_BYTES = 524288000`, a Worker var).
  - Upload rate limit: 30 uploads per user per rolling hour.
  - Max file size: 10 MB plaintext (`MAX_BYTES = 10485760`). The ciphertext may be up to 28 bytes larger: 12-byte IV + 16-byte tag.
  - Only `pdf` and `xml` kinds.
- **Crypto:**
  - AES-GCM 256 with a random key per document (`crypto.getRandomValues`, 32 bytes) and a random 12-byte IV per encryption.
  - Blob layout: `iv (12 bytes) || ciphertext+tag`.
  - Key and token travel as base64url without padding: key 32 bytes → 43 chars, token 16 bytes → 22 chars.
  - Link format: `https://<host>/d/<token>#<key>`.
  - The server never sees the key: it is in the fragment, and the console never sends it to the Worker.
- **Worker identity:**
  - Every `/api/*` call needs `Authorization: Bearer <GitHub token>`.
  - The Worker calls `GET https://api.github.com/user` (with a `User-Agent` header) and keys everything by the numeric GitHub user id.
  - It never logs or stores the token. An in-memory cache of `sha256(token) → id`, valid 5 minutes, is allowed.
- **Worker privacy:**
  - Download events store time, token and a coarse client class (`browser` / `bot` / `other` from the User-Agent). No IP, no full User-Agent.
  - Responses carry `Cache-Control: no-store` and `Referrer-Policy: no-referrer`. Landing pages also send `X-Robots-Tag: noindex` and a strict CSP (`default-src 'none'; script-src 'sha256-…' or 'self'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:`; the exact form is the implementer's choice, but no third-party origins).
- **State changes:**
  - `GET /d/<token>` (landing page) never changes state and never counts.
  - Only `GET /d/<token>/blob` records a download event.
  - Revoke deletes the R2 object and marks the record revoked.
  - Expired or revoked links return 410 with the page `This link is no longer available.`
- **CORS:** `/api/*` allows only origins listed in the `CONSOLE_ORIGINS` var (comma-separated; production `https://app.kaihuman.com`), methods `GET, POST, DELETE`, headers `Authorization, Content-Type, X-KH-Label, X-KH-Business, X-KH-Kind, X-KH-Expires`, and answers `OPTIONS` preflights.
- **Console consent:**
  - Sharing is off until the user accepts a one-time explanation, stored in localStorage `lifeos_share_consent_v1`. It explains what is uploaded, where (Cloudflare, EU), that the file is encrypted in the browser, who can open it, and how to revoke.
  - Every upload needs its own confirm: `Upload <number>.pdf (encrypted) to create a share link?`
  - Nothing ever uploads automatically. Sharing is disabled in demo mode.
- **Repo records:**
  - A link is appended to `.kh/business/links.jsonl` as a `LinkRecord` `{ id, doc, url, created, expires? }`. The url includes the key; the repo is private.
  - Revoke sets `revoked` on that line via `replaceJsonlLines` (one commit).
  - Download events become `DocEvent { type: 'downloaded' }` lines in `events.jsonl`, deduped by id. The Worker issues event ids as ULIDs.
  - All writes go through `writeBusiness`.
- **Never block the repo on the service:** if the Worker is down, the business pages still work. Sharing shows `The share service is not reachable.`
- **Generated files:** never commit `apps/console/src/version.ts` / `version.json` churn.
- **Done means:**
  - zero Biome warnings, zero type errors, all tests pass
  - turbo's root check fails in this sandbox, so run per package: `pnpm --filter <pkg> lint|check-types|test`, plus the formats and ui builds before console checks
  - one dated `doc/progress.md` entry `## 2026-11-02 — Business, phase 4: share links` (created in Task 1)
  - no deployment from this session: the README documents the operator steps

## Review Focus

1. **The key must never reach the server.** No request from the console or the landing page includes the fragment key (no logging, no query string, no Referer). Tests in Tasks 1, 3 and 5.
2. **Email scanners pre-opening links.** `GET /d/<token>` must not count or change anything, and HEAD requests are handled the same way. Test in Task 3.
3. **One user can never list, read, revoke or count against another user's files.** Tests in Task 2.
4. **The service is unreachable or returns errors.** The console shows a clear message, commits nothing, and leaves no half-recorded link: an upload that succeeded but whose repo commit failed is revoked again, best effort, and reported. Test in Task 5.
5. **Quota and rate limits at the boundary.** Exactly at 500 MB is allowed. One byte more is refused with 413 and `Storage limit reached (500 MB).` The 31st upload in an hour gets 429 `Too many uploads. Try again later.` Tests in Task 2.

---

### Task 1: Shared share crypto

**Files:**
- Create: `packages/formats/src/share/crypto.ts`, `packages/formats/src/share/index.ts`
- Modify: `packages/formats/package.json` (export `"./share": "./src/share/index.ts"`)
- Test: `packages/formats/src/share/crypto.test.ts`
- Modify: `doc/progress.md` (new entry)

**Interfaces:**
- Produces:
  - `b64urlEncode(bytes: Uint8Array): string` and `b64urlDecode(text: string): Uint8Array`. Decode throws on invalid characters.
  - `newShareKey(): string`: 32 random bytes, base64url (43 chars)
  - `newShareToken(): string`: 16 random bytes, base64url (22 chars)
  - `encryptShareBlob(plain: Uint8Array, key: string): Promise<Uint8Array>`
  - `decryptShareBlob(blob: Uint8Array, key: string): Promise<Uint8Array>`, which:
    - is **self-contained**: no imports or outer references, because the landing page inlines it with `.toString()`
    - implements its own base64url decode internally
    - throws `Error('Wrong key or damaged file')` on an authentication failure
  - `shareUrl(host: string, token: string, key: string): string` gives `${host}/d/${token}#${key}`, trimming a trailing `/` from the host
  - `parseShareUrl(url: string): { host: string; token: string; key: string } | null`

- [ ] **Step 1: Write failing tests**

```ts
const key = newShareKey(); expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
expect(newShareToken()).toMatch(/^[A-Za-z0-9_-]{22}$/);
const plain = new TextEncoder().encode('%PDF-1.7 hello');
const blob = await encryptShareBlob(plain, key);
expect(blob.length).toBe(plain.length + 28);
expect(await decryptShareBlob(blob, key)).toEqual(plain);
await expect(decryptShareBlob(blob, newShareKey())).rejects.toThrow('Wrong key or damaged file');
blob[20] ^= 1; await expect(decryptShareBlob(blob, key)).rejects.toThrow('Wrong key or damaged file');
// self-contained: new Function(`return (${decryptShareBlob.toString()})`)() decrypts a fresh blob
expect(shareUrl('https://docs.kaihuman.com/', 't'.repeat(22), key)).toBe(`https://docs.kaihuman.com/d/${'t'.repeat(22)}#${key}`);
expect(parseShareUrl(shareUrl('https://x.test', 'abc', key))).toEqual({ host: 'https://x.test', token: 'abc', key });
expect(b64urlDecode(b64urlEncode(new Uint8Array([0, 255, 62, 63])))).toEqual(new Uint8Array([0, 255, 62, 63]));
```

- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, using `globalThis.crypto`.
- [ ] **Step 4: Run** the formats tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(formats): end-to-end share crypto`

### Task 2: Share Worker — storage, auth and the files API

**Files:**
- Create: `apps/share-worker/{package.json,tsconfig.json,wrangler.jsonc,.gitignore,.dev.vars.example}`, `apps/share-worker/migrations/0001_init.sql`, `apps/share-worker/src/{index.ts,env.ts,auth.ts,cors.ts,files.ts,limits.ts,respond.ts}`
- Create (test support): `apps/share-worker/src/testing/fakes.ts` (in-memory `D1Database` subset and `R2Bucket` subset)
- Test: `apps/share-worker/src/files.test.ts`, `apps/share-worker/src/auth.test.ts`
- Modify: root `package.json` (devDependency `@cloudflare/workers-types`, exact current version), `pnpm-lock.yaml` (via `pnpm install`)

**Interfaces:**
- `package.json` scripts mirror `apps/auth-worker`: `dev`, `deploy`, `check-types`, `lint`, `format`, `fix`, `test`. Dependencies: `@kaihuman/formats: workspace:*`.
- `wrangler.jsonc`:
  - name `kaihuman-share`, `main` `src/index.ts`, `compatibility_date` `2026-10-01`
  - `routes: [{ pattern: "docs.kaihuman.com", custom_domain: true }]`
  - `d1_databases: [{ binding: "DB", database_name: "kaihuman-share", database_id: "<set after wrangler d1 create>", migrations_dir: "migrations" }]`
  - `r2_buckets: [{ binding: "FILES", bucket_name: "kaihuman-share", jurisdiction: "eu" }]`
  - `vars: { CONSOLE_ORIGINS: "https://app.kaihuman.com", QUOTA_BYTES: "524288000", MAX_BYTES: "10485760", UPLOADS_PER_HOUR: "30", ABUSE_EMAIL: "abuse@kaihuman.com" }`
  - `dev: { port: 8788 }`
- `migrations/0001_init.sql`:

```sql
CREATE TABLE files (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, label TEXT NOT NULL, business TEXT NOT NULL, kind TEXT NOT NULL CHECK (kind IN ('pdf','xml')), size INTEGER NOT NULL, created_at TEXT NOT NULL, expires_at TEXT, revoked_at TEXT);
CREATE INDEX files_user ON files(user_id, created_at);
CREATE TABLE events (id TEXT PRIMARY KEY, token TEXT NOT NULL, user_id INTEGER NOT NULL, at TEXT NOT NULL, client TEXT NOT NULL CHECK (client IN ('browser','bot','other')));
CREATE INDEX events_user ON events(user_id, at);
```

- `Env`: `{ DB: D1Database; FILES: R2Bucket; CONSOLE_ORIGINS: string; QUOTA_BYTES: string; MAX_BYTES: string; UPLOADS_PER_HOUR: string; ABUSE_EMAIL: string }`. The R2 object key is `${user_id}/${token}`.
- `authUser(request, env, fetchImpl = fetch): Promise<{ id: number } | Response>`:
  - a missing or invalid Bearer → 401 `Sign in to kaihuman again.`
  - GitHub 401 → 401
  - other GitHub errors → 502 `GitHub is not reachable.`
  - caches `sha256(token)` → id for 5 minutes in module memory
- Routes in this task:
  - **`POST /api/files`**:
    - The body is the ciphertext. Headers: `X-KH-Kind` (`pdf` | `xml`), `X-KH-Label` (1–80 chars, `[A-Za-z0-9_.-]`), `X-KH-Business` (1–120 chars), optional `X-KH-Expires` (ISO date).
    - Size above MAX_BYTES + 28 → 413 `File too large (max 10 MB).`
    - Quota: the sum of non-revoked sizes plus this one must stay ≤ QUOTA_BYTES, else 413 `Storage limit reached (500 MB).`
    - Rate: more than UPLOADS_PER_HOUR files created in the last hour → 429 `Too many uploads. Try again later.`
    - Success → 201 `{ token, size, created, expires }`.
  - **`GET /api/files`** → `{ files: [{ token, label, kind, size, created, expires, revoked, downloads }], used, quota }`, own files only, newest first
  - **`DELETE /api/files/:token`** → revokes your own file: sets `revoked_at`, deletes the R2 object, 204. Another user's token or an unknown one → 404.
  - CORS preflight and headers as per the global constraints.
  - Unknown path → 404 `Not found`.
- All JSON errors are `{ error: string }`. `respond.ts` holds helpers that add the no-store and no-referrer headers.

- [ ] **Step 1: Write failing tests.** Use the fakes plus a stubbed GitHub `fetch` that maps tokens to user ids. Cover:
  - upload, then list shows it with `downloads: 0`
  - user B can't list, revoke or see user A's file (Review Focus 3)
  - the size limit: exactly MAX_BYTES+28 is accepted, +29 is refused
  - the quota: exactly at QUOTA_BYTES is accepted, one byte more is refused (Review Focus 5)
  - the 31st upload within an hour → 429, and an upload 61 minutes later succeeds
  - bad kind, label or expires → 400 with a message
  - revoke deletes the R2 object and the list shows `revoked`
  - preflight from an allowed origin → 204 with headers, from another origin → no `Access-Control-Allow-Origin`
  - a missing token → 401
  - GitHub 500 → 502
  - the token is never present in any stored row
- [ ] **Step 2: Run** `pnpm install` and then `pnpm --filter @kaihuman/share-worker test`. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the share-worker tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(share-worker): storage, auth and files API`

### Task 3: Share Worker — landing page, download, events, account deletion

**Files:**
- Create: `apps/share-worker/src/{landing.ts,download.ts,events.ts,account.ts,client-class.ts}`
- Modify: `apps/share-worker/src/index.ts`
- Test: `apps/share-worker/src/landing.test.ts`, `download.test.ts`, `events.test.ts`, `account.test.ts`, plus a round-trip test `apps/share-worker/src/roundtrip.test.ts`
- Create: `apps/share-worker/README.md` (what it is; production setup: `wrangler d1 create kaihuman-share`, put the id in wrangler.jsonc, `wrangler d1 migrations apply kaihuman-share --remote`, `wrangler r2 bucket create kaihuman-share --jurisdiction eu`, set vars, `pnpm --filter @kaihuman/share-worker deploy`, add the custom domain; local dev with `wrangler dev`; operator SQL to disable a token: `UPDATE files SET revoked_at=… WHERE token=…` plus deleting the R2 object)

**Interfaces:**
- **`GET /d/:token` and `HEAD`** → HTML page:
  - title `<label> — shared via kaihuman`
  - text `<business> shared <label> with you.`
  - a Download button and a "Report abuse" `mailto:${ABUSE_EMAIL}?subject=Abuse%20report%20<token>` link
  - no counting, no state change
  - unknown token → 404 page `This link does not exist.`
  - revoked or expired (`expires_at < today` UTC) → 410 page `This link is no longer available.`
  - The page script reads the key from `location.hash`. On click it fetches `/d/<token>/blob`, decrypts with the inlined `decryptShareBlob` (`${decryptShareBlob.toString()}` from `@kaihuman/formats/share`), and saves `<label>.<kind>` with a Blob URL.
  - Script errors show `This link is incomplete or the file is damaged.`
  - The key is never sent anywhere: no fetch with the hash, `Referrer-Policy: no-referrer`.
  - Headers: CSP per the global constraints, `X-Robots-Tag: noindex`, no-store. HTML-escape label and business.
- **`GET /d/:token/blob`** → the ciphertext (`application/octet-stream`, no-store). It records an event: id = a ULID (`ulid()` from `@kaihuman/formats/business`), client = `clientClass(userAgent)`, and the file's `user_id`. Revoked, expired or unknown → 410/404 with nothing recorded.
- **`clientClass(ua: string | null): 'browser' | 'bot' | 'other'`**: `bot` when the UA matches common scanner/bot markers (`bot|crawler|spider|preview|scanner|curl|wget|python|headless`), `browser` when it matches `Mozilla/`, else `other`.
- **`GET /api/events?since=<ISO>`** (auth) → `{ events: [{ id, token, label, at, client }] }`, own files only, `at > since`, oldest first, at most 500.
- **`DELETE /api/account`** (auth) → deletes all the user's R2 objects, files and events rows, 204.
- **Round-trip test:** encrypt with `encryptShareBlob` in Node, upload through `POST /api/files`, fetch `/d/<token>/blob`, then decrypt with the function **extracted from the landing page HTML**: find the inlined function source in the response text and evaluate it. The result equals the plaintext.

- [ ] **Step 1: Write failing tests.** Cover:
  - the landing page shows the escaped label and business, contains the inlined decrypt function, sets CSP, noindex and no-referrer, and its GET and HEAD record nothing (Review Focus 2)
  - revoked or expired → 410 with that text
  - blob fetch records exactly one event with a ULID id and client `bot` for a curl UA
  - blob of a revoked file → 410 and no event
  - events API scoped per user and filtered by `since`
  - account deletion removes R2 objects and rows, and other users stay untouched
  - the page source never puts `location.hash` into a fetch URL (assert the inline script only fetches `/d/<token>/blob`) (Review Focus 1)
  - the round trip
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement**, and write the README.
- [ ] **Step 4: Run** the share-worker tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(share-worker): landing page, downloads, events, account deletion`

### Task 4: Core — read a binary file at a commit

**Files:**
- Modify: `packages/core/src/services/github.service.ts`, `packages/core/src/services/github.service.memory.ts`
- Test: `packages/core/src/services/file-bytes.test.ts`

**Interfaces:**
- Produces: `getFileBytes(owner, repo, path, opts?: { ref?: string }): Promise<Uint8Array>` on both services.
  - **Real service:** resolve the blob sha via `repos.getContent` metadata (or the tree at `ref`), then `git.getBlob` and decode base64 to bytes. Never via `TextDecoder`. Works up to 100 MB (the blob API limit).
  - **Memory service:** returns the stored bytes. The demo stores text, so return `TextEncoder` bytes of the content.
  - A missing path → `Error('Not found: <path>')`.

- [ ] **Step 1: Write failing tests.** With a mocked Octokit:
  - bytes `[0x25, 0x50, 0x44, 0x46, 0xff, 0x00]` round-trip exactly, including invalid UTF-8
  - the `ref` is passed through
  - a missing path → the error
  - the memory service returns stored bytes
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the core tests, lint and check-types, then the console check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): read binary files at a commit`

### Task 5: Console share client and the "Share" flow

**Files:**
- Create: `apps/console/src/lib/business/share.ts` (+ test), `apps/console/src/components/business/ShareConsent.tsx`, `apps/console/src/components/business/ShareActions.tsx` (+ test)
- Modify: `apps/console/src/pages/ClientPage.tsx` (Share / Copy link / Revoke per issued invoice and offer that has a PDF; "Online · link active" badge), `apps/console/.env.prod` (`VITE_SHARE_URL=https://docs.kaihuman.com`), `packages/formats/src/business/paths.ts` (`LINKS_PATH`)

**Interfaces:**
- Consumes: `encryptShareBlob`, `newShareKey`, `shareUrl`, `parseShareUrl` (Task 1); `getFileBytes` (Task 4); `writeBusiness`, `writeErrorMessage`; `authStore.token`; `demoMode`; `appendJsonl`, `replaceJsonlLines`, `KEY_ORDER.link`, `ulid`
- Produces (`share.ts`):
  - `shareServiceUrl(): string`: localStorage `lifeos_share_url` (when a valid `https://` URL), else `import.meta.env.VITE_SHARE_URL`, else `https://docs.kaihuman.com`. Every localStorage access is wrapped in try/catch.
  - `hasShareConsent(): boolean` and `acceptShareConsent(): void` (key `lifeos_share_consent_v1`)
  - `type ShareApi = { upload(blob: Uint8Array, meta: { kind: 'pdf'; label: string; business: string; expires?: string }): Promise<{ token: string; created: string; expires?: string }>; list(): Promise<{ files: SharedFile[]; used: number; quota: number }>; revoke(token: string): Promise<void>; events(since?: string): Promise<SharedEvent[]>; deleteAccount(): Promise<void> }`
  - `shareApi(baseUrl: string, token: string, fetchImpl = fetch): ShareApi`
    - error mapping: network failure → `ShareUnavailableError` with message `The share service is not reachable.`; a non-2xx JSON `{error}` → `ShareError(message)`
    - the GitHub token is sent only in the `Authorization` header; the key is never sent
  - `createShareLink(target: KBRepo, doc: { number: string; path: string /* issued yaml */; expires?: string }, deps): Promise<{ url: string }>`, which:
    1. reads the PDF bytes at the head (`getFileBytes(..., { ref: headSha })` for `path.replace(/\.ya?ml$/, '.pdf')`)
    2. generates a key and encrypts
    3. uploads with label = the number and business = the profile name
    4. runs `writeBusiness` to append a `LinkRecord { id: ulid(), doc, url: shareUrl(base, token, key), created: now ISO, expires? }` to `LINKS_PATH`, with message `business: share link for <number>`
    5. if the commit fails, calls `revoke(token)` (best effort) and rethrows a `ShareError` with message `The link could not be saved in the repository and was removed again.` (Review Focus 4)
  - `revokeShareLink(target, link: LinkRecord, deps)`:
    - calls `api.revoke(parseShareUrl(link.url).token)` (a 404 counts as already revoked)
    - then `writeBusiness` sets `revoked: now ISO` on that line (by `id`) via `replaceJsonlLines`, with message `business: revoke share link for <doc>`
  - Offers default `expires` to the offer's `valid_until`. Invoices have none.
- UI:
  - **`ShareConsent`:** a dialog with the explanation (what, where, encrypted, who can open, how to revoke) and the buttons "I understand, enable sharing" and "Cancel".
  - **`ShareActions({ doc, link })`:**
    - no PDF → nothing
    - no active link → "Share…", which:
      1. shows the consent dialog first if not given yet
      2. then shows the inline confirm `Upload <number>.pdf (encrypted) to create a share link?`
      3. after upload, shows the link with a "Copy link" button (`navigator.clipboard.writeText`, with a fallback text field)
    - active link → the badge `Online · link active`, "Copy link" and "Revoke…" (with an inline confirm)
    - demo mode → disabled, with the note `Sharing is not available in demo mode.`
    - errors → `role="alert"`
    - double-submit guard

- [ ] **Step 1: Write failing tests.** Cover:
  - `shareApi` sends Bearer only, never the key (assert that request URLs and bodies don't contain the key) (Review Focus 1)
  - error mapping
  - `createShareLink` commits a link line whose url parses back to the token and key
  - a commit failure → revoke called + message (Review Focus 4)
  - upload failure → nothing committed
  - `revokeShareLink` treats 404 as revoked and sets `revoked` on the right line
  - `shareServiceUrl` override and fallback
  - `ShareActions`: consent shown first, confirm text, demo disabled, copy works, revoke confirm
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types, plus the formats tests. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): encrypted share links for offers and invoices`

### Task 6: `/business/shared`, download sync, credit-note revoke offer

**Files:**
- Create: `apps/console/src/pages/SharedPage.tsx` (+ test), `apps/console/src/lib/business/share-sync.ts` (+ test)
- Modify: `apps/console/src/App.tsx` (route `/business/shared`), `apps/console/src/pages/BusinessPage.tsx` (link "Shared files"), `apps/console/src/pages/IssuePage.tsx` (credit note: checkbox `Also revoke the share link of <invoice>` when that invoice has an active link, checked by default; revoke after a successful issue)

**Interfaces:**
- Produces:
  - `downloadEvents(existingEventsText: string | null, serverEvents: SharedEvent[], links: LinkRecord[]): DocEvent[]`. It returns new `DocEvent { id, at, doc, type: 'downloaded', note: client }` for server events whose id is not already in the events file. `doc` maps through the link with a matching token, and events for unknown tokens are skipped.
  - `syncDownloads(target, api): Promise<{ added: number }>`:
    - `since` = the latest `downloaded` event `at` in the repo, or none
    - fetches `api.events(since)`
    - if there are new ones, `writeBusiness` appends them to `EVENTS_PATH` in one commit, with message `business: <n> downloads`
    - nothing new → no commit
- **SharedPage:**
  - On load (ready, consent given, not demo), lists `api.list()`: label, kind, size (KB/MB), created, expires, downloads, status (Active / Revoked / Expired), and a Revoke button for active entries.
  - Storage used: `12.3 MB of 500 MB`.
  - "Sync downloads" button, which also runs automatically once on open.
  - Share service URL field, saved to `lifeos_share_url`. A "Reset" button clears it.
  - "Delete all my shared files": an inline confirm, then `api.deleteAccount()`, then every active link record in the repo gets `revoked` in one commit.
  - Unreachable service → `The share service is not reachable.`, and the rest of the page (URL setting) still works.
- **IssuePage credit note:** after a successful issue with the checkbox checked, call `revokeShareLink` for the corrected invoice's active link. A failure there shows a notice but doesn't undo the issue.

- [ ] **Step 1: Write failing tests.** Cover:
  - `downloadEvents` dedupe and mapping, skipping unknown tokens
  - `syncDownloads` with no new events makes no commit, and with new events makes one commit
  - SharedPage renders the list and the quota text, revoke works, the delete-all confirm flow revokes repo links, and the unreachable message keeps the URL field
  - IssuePage credit-note checkbox revokes after issuing
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** the console tests, lint and check-types. Expected: PASS.
- [ ] **Step 5: Commit:** `feat(console): shared files page, download sync, credit-note revoke`

### Task 7: Docs and privacy policy

**Files:**
- Modify:
  - `doc/business.md` (a share links section: how it works, encryption, consent, limits, revoke, downloads, self-hosting via `lifeos_share_url`)
  - `apps/landing-page-nextgen/src/pages/privacy.astro` (a share-service section: what is stored (ciphertext, label, business name, size, dates, download time and client class), where (Cloudflare R2 EU, D1), retention (until revoked or the account is deleted), that the operator can't read files, the abuse contact; amend the "no server stores your content" bullets accordingly; bump `EFFECTIVE`)
  - `doc/features.md`
  - `doc/roadmap.md` (tick phase 4)
  - `doc/progress.md`
  - `README.md` (one line listing the share worker, if apps are listed)
  - `CLAUDE.md` "Repository" bullet: add `share-worker` (Cloudflare Worker, encrypted share links) to the other apps list
  - `packages/formats/skills/kh-business/SKILL.md` (agents never create share links; `links.jsonl` is written by the console)
  - `apps/console/src/lib/business-setup.ts` (`BUSINESS_TOOLS_VERSION` → `1.2.0`; update its test)

- [ ] **Step 1: Write the docs.** Every claim must match the code from Tasks 1–6 (paths, limits, messages).
- [ ] **Step 2: Run** the landing page build (`pnpm --filter <landing-page-nextgen package name> build`) to check that the Astro page compiles.
- [ ] **Step 3: Full verification:** `pnpm install --frozen-lockfile`, the formats and ui builds, then `pnpm -r --no-bail lint`, `check-types` and `test`. All must exit 0. The 8 clippy warnings in `apps/cli` are pre-existing.
- [ ] **Step 4: Commit:** `docs(business): share links, privacy policy, worker setup`
