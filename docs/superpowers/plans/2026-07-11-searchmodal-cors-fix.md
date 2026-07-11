# SearchModal CORS Fix Plan (follow-up to PRs #112 and #113)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the cmd+k search modal's recurring CORS / "Failed to fetch" errors against `api.github.com/search/code` by eliminating the request volume that trips GitHub's code-search rate limiter — not by retrying harder.

**Symptom (reported 2026-07-11, after #113 shipped):** per debounced keystroke the modal fires two parallel `/search/code` requests. The content-search request returns correct data; the filename-search request fails with:

```
Access to fetch at 'https://api.github.com/search/code?q=filename%3Arunbook%20repo%3Aurbanisierung%2Flife-os%20&per_page=10'
from origin 'https://app.kaihuman.com' has been blocked by CORS policy:
No 'Access-Control-Allow-Origin' header is present on the requested resource.
GET https://api.github.com/search/code?... net::ERR_FAILED 200 (OK)
[SearchModal] Search error TypeError: Failed to fetch
```

---

## Investigation Findings

### Why PR #113's fix could not work

#113 removed a trailing space from `` `Bearer ${githubToken} ` `` on the theory that the space made the credential invalid, forcing unauthenticated (10 req/min) quota. **That premise is wrong**: the Fetch spec normalizes header values by stripping leading/trailing HTTP whitespace before the request is sent. Verified in Node (undici, same spec Chrome implements):

```js
new Headers({ Authorization: 'Bearer abc ' }).get('Authorization')  // → 'Bearer abc'
```

The trailing space never reached the wire. Auth was working before #113 and after it — which is also proven by the symptom itself: `/search/code` **requires** authentication (unauthenticated calls get 401), and the content-search request returns correct data. Removing the space was harmless but changed nothing, which is why the bug persists.

### Why PR #112's fix was insufficient

#112 switched `Promise.all` → `Promise.allSettled` and added one retry with backoff. That correctly keeps one failing request from wiping out the other's results (the content results do survive today), but it doesn't reduce the number of requests — the retry actually *adds* one, and it lands 1–2 s later, well inside the same 60-second rate-limit window, so it fails the same way.

### Actual root cause

`packages/ui/src/LifeOS/Organisms/SearchModal.tsx` (lines ~239–264) fires **two concurrent `/search/code` requests per debounced keystroke** (500 ms debounce), with no in-flight aborting and no caching:

1. Content search: `q=<query> repo:<repo>`
2. Filename search: `q=filename:<query> repo:<repo>`

GitHub's code-search endpoint has its own rate limit of **10 requests/minute even when authenticated** (far below the general 30 req/min search limit), plus secondary/abuse limits that penalize concurrent search requests from one token. Typing a word with a few pauses (2 requests × each 500 ms pause, plus retries) exhausts that budget in seconds. When GitHub's limiter rejects a request, the rejection response arrives **without CORS headers**, so the browser reports an opaque CORS error / `TypeError: Failed to fetch` instead of a readable 403/429 — exactly the class of failure #112's own commit message documented. The second-fired (filename) request is the one that loses the race, matching the observed "one succeeds, one CORS-fails" pattern. (Chrome's `net::ERR_FAILED 200 (OK)` line means "a response arrived but JS access was blocked for missing `Access-Control-Allow-Origin`" — the fix below does not depend on the blocked response's exact status code.)

Conclusion: **no amount of retrying fixes this; the modal must send fewer search requests.**

### Key enabler for the fix

`githubFileStore.tree.value` (already imported by SearchModal for `handleOpenWiki`) holds the full git tree of the currently loaded repo — the same repo being searched (`currentRepository`) — loaded on repo open and cached in IndexedDB. Filename search therefore needs **zero API calls**: it can be a local filter over tree blobs. That is faster, works offline/while throttled, and halves the search API traffic in one move.

---

## File Map

### Created
| File | Responsibility |
|------|---------------|
| `packages/ui/src/LifeOS/Organisms/search-filename-matcher.ts` | Pure `matchFilenames(tree, query, limit)` function |
| `packages/ui/src/LifeOS/Organisms/search-filename-matcher.test.ts` | Unit tests for the matcher |

### Modified
| File | Change |
|------|--------|
| `packages/ui/src/LifeOS/Organisms/SearchModal.tsx` | Drop filename API request; local matching; abort in-flight search; simplify |
| `doc/progress.md` | New entry documenting real root cause and fix |

---

## Tasks

### Task 1 — Pure filename matcher

- [ ] Create `search-filename-matcher.ts` exporting `matchFilenames(tree: TreeItem[], query: string, limit = 10): SearchResult[]`:
  - Filter to `type === 'blob'` entries whose basename (`path.split('/').pop()`) contains the query case-insensitively.
  - Rank: basename `startsWith(query)` first, then basename `includes(query)`; stable within groups.
  - Map to `{ name: basename, path, type: 'FILE' }` — `MainApp.tsx`'s `onSelect` handler only consumes `item.path` / `item.name` for FILE results, so this shape is sufficient.
  - Cap at `limit`.
- [ ] Unit tests (Vitest): case-insensitivity, blob-only filtering, ranking (prefix beats substring), limit cap, empty query → empty result, empty tree → empty result.

### Task 2 — SearchModal rewiring

- [ ] Delete the `qFile` request; call `matchFilenames(githubFileStore.tree.value, query)` instead (synchronous — run it immediately, before the debounce, so filename hits render instantly).
- [ ] Keep a **single** `/search/code` content request per debounce. With only one request, replace `Promise.allSettled` with plain `try/catch` around the one fetch (keep `fetchGithubSearchWithRetry`, which honors `Retry-After` on 403).
- [ ] Add an `AbortController`: abort the in-flight content search when the query changes or the modal closes, and pass its signal through `fetchGithubSearchWithRetry` to `fetch`. This removes the remaining source of concurrent search requests (overlap across debounce windows). Treat `AbortError` as silent (not logged as a search error).
- [ ] Merge order unchanged: commands → local filename matches → content matches, deduplicated by `path`.
- [ ] Remove the trailing spaces inside the query template (`` `${query} repo:${currentRepository} ` ``) — they currently end up as a dangling `%20` in the URL.
- [ ] Update the stale comment block above `fetchGithubSearchWithRetry` to reflect the new single-request design.

### Task 3 — Docs

- [ ] `doc/progress.md`: add an entry stating (a) the real root cause (2 concurrent code-search requests/keystroke vs. the 10 req/min code-search limit; limiter responses lack CORS headers), (b) that #113's trailing-space theory was incorrect because Fetch strips header-value whitespace, and (c) the fix (local filename matching + single aborted-on-change content request). Do not rewrite the older entries.

### Task 4 — Verification

- [ ] `pnpm turbo build`, `pnpm turbo typecheck`, `pnpm biome check .`, `pnpm turbo test` — all green, zero warnings.
- [ ] Manual check in the console app: open cmd+k, type a filename (e.g. `runbook`) — filename hits appear instantly from the tree with **no** `filename:` request in the network tab; exactly one `/search/code` request per debounce; typing quickly aborts the previous request; results still render when the content search is throttled.

---

## Alternatives considered and rejected

- **Proxy search through a backend** — hides CORS and centralizes rate limiting, but adds infra and latency; unnecessary once request volume drops below the limit. Revisit only if throttling persists after this change.
- **Combine both searches into one query** — GitHub search syntax cannot OR a content match with a `filename:` match in a single query.
- **Serialize the two requests instead of removing one** — halves concurrency but still burns 2 req/keystroke against a 10 req/min budget; doesn't fix the underlying volume problem.
- **More retries / longer backoff** — already demonstrated (twice) to be symptom-chasing.
