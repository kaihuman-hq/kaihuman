import { authStore, demoMode } from '@kaihuman/core';
import {
  KEY_ORDER,
  LINKS_PATH,
  type LinkRecord,
  replaceJsonlLines,
} from '@kaihuman/formats/business';
import { parseShareUrl } from '@kaihuman/formats/share';
import { useEffect, useRef, useState } from 'preact/hooks';
import { PageShell } from '../components/business/PageShell';
import { ShareConsent } from '../components/business/ShareConsent';
import {
  acceptShareConsent,
  DEFAULT_SHARE_URL,
  hasShareConsent,
  LINK_GONE_MESSAGE,
  revokeShareLink,
  SHARE_URL_KEY,
  type ShareApi,
  type SharedFile,
  ShareError,
  shareApi,
  shareServiceUrl,
} from '../lib/business/share';
import { syncDownloads } from '../lib/business/share-sync';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../lib/business/write';
import type { KBRepo } from '../lib/github-kb';

const BUTTON =
  'px-2 py-1 text-xs rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90 disabled:opacity-50';
const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';
const MB = 1048576;

const formatSize = (bytes: number): string =>
  bytes < MB
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${Number((bytes / MB).toFixed(1))} MB`;
const megabytes = (bytes: number): string => `${Number((bytes / MB).toFixed(1))} MB`;

const statusOf = (f: SharedFile): 'Active' | 'Revoked' | 'Expired' => {
  if (f.revoked) return 'Revoked';
  // The service keeps a link through the end of its `expires` day (UTC).
  if (f.expires && f.expires.slice(0, 10) < new Date().toISOString().slice(0, 10)) return 'Expired';
  return 'Active';
};

const messageOf = (e: unknown): string =>
  e instanceof ShareError ? e.message : e instanceof Error ? e.message : String(e);

const storedOverride = (): string => {
  try {
    return localStorage.getItem(SHARE_URL_KEY) ?? '';
  } catch {
    return '';
  }
};

/** Whether the record points at the configured service; a host read from the repo is never called. */
const onService = (link: { url: string }, service: string): boolean =>
  parseShareUrl(link.url)?.host === service;

function ServiceUrl({ onChange }: { onChange: () => void }) {
  const [value, setValue] = useState(storedOverride);
  const [error, setError] = useState<string | null>(null);

  function save() {
    let origin: string | null = null;
    try {
      const u = new URL(value.trim());
      origin = u.protocol === 'https:' ? u.origin : null;
    } catch {
      origin = null;
    }
    if (!origin) {
      setError('Enter the address of the share service, starting with https://.');
      return;
    }
    try {
      localStorage.setItem(SHARE_URL_KEY, origin);
    } catch {
      setError('This browser does not allow saving the setting.');
      return;
    }
    setValue(origin);
    setError(null);
    onChange();
  }

  function reset() {
    try {
      localStorage.removeItem(SHARE_URL_KEY);
    } catch {
      // Nothing was saved either.
    }
    setValue('');
    setError(null);
    onChange();
  }

  return (
    <section aria-label="Share service" class="space-y-1 text-xs">
      <label class="block">
        <span class="block text-[var(--los-muted)]">
          Share service URL (this device only; empty uses {DEFAULT_SHARE_URL})
        </span>
        <input
          type="url"
          value={value}
          placeholder={DEFAULT_SHARE_URL}
          class="w-full max-w-md rounded border border-[var(--los-border)] bg-[var(--los-bg)] px-1 py-0.5 font-mono"
          onInput={(e) => setValue((e.target as HTMLInputElement).value)}
        />
      </label>
      <div class="flex gap-1">
        <button type="button" class={BUTTON} onClick={save}>
          Save
        </button>
        <button type="button" class={BUTTON} onClick={reset}>
          Reset
        </button>
      </div>
      {error && (
        <p role="alert" class="text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </section>
  );
}

function Files({
  repo,
  links,
  consent,
  version,
  focusSync,
}: {
  repo: KBRepo;
  links: LinkRecord[];
  consent: boolean;
  version: number;
  /** Consent was just given: the button that opened it is gone, so focus lands here. */
  focusSync: boolean;
}) {
  const [list, setList] = useState<{ files: SharedFile[]; used: number; quota: number } | null>(
    null,
  );
  const [error, setErrorRaw] = useState<string | null>(null);
  const [info, setInfoRaw] = useState<string | null>(null);
  const [busy, setBusyRaw] = useState(false);
  const [confirm, setConfirmRaw] = useState<string | 'all' | null>(null);
  const [reload, setReloadRaw] = useState(0);
  const synced = useRef(false);
  const working = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );
  // A request can finish after the page was left; its result must not touch state then.
  const setError = (v: string | null) => alive.current && setErrorRaw(v);
  const setInfo = (v: string | null) => alive.current && setInfoRaw(v);
  const setBusy = (v: boolean) => alive.current && setBusyRaw(v);
  const setConfirm = (v: string | null) => alive.current && setConfirmRaw(v);
  const refresh = () => alive.current && setReloadRaw((n) => n + 1);

  // Keyboard focus follows an inline confirm: into it when it opens, back to its trigger when it closes.
  const confirmButton = useRef<HTMLButtonElement>(null);
  const lastTrigger = useRef<string | null>(null);
  useEffect(() => {
    if (confirm !== null) {
      lastTrigger.current = confirm;
      confirmButton.current?.focus();
    } else if (lastTrigger.current !== null) {
      document.querySelector<HTMLElement>(`[data-trigger="${lastTrigger.current}"]`)?.focus();
      lastTrigger.current = null;
    }
  }, [confirm]);
  const syncButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (consent && focusSync) syncButton.current?.focus();
  }, [consent, focusSync]);

  const api = (): ShareApi => {
    const token = authStore.token.value;
    if (!token) throw new ShareError('Sign in with GitHub to manage shared files.');
    return shareApi(shareServiceUrl(), token);
  };

  async function sync(auto = false): Promise<void> {
    try {
      const { added } = await syncDownloads(repo, api());
      // Opening the page says nothing when nothing changed.
      if (added > 0 || !auto) {
        setInfo(added === 1 ? '1 new download recorded.' : `${added} new downloads recorded.`);
      }
    } catch (e) {
      setError(messageOf(e));
    }
  }

  useEffect(() => {
    if (!consent) return;
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        const result = await api().list();
        if (cancelled) return;
        setList(result);
      } catch (e) {
        if (!cancelled) {
          setList(null);
          setError(messageOf(e));
        }
        return;
      }
      // Once per visit, through the same guard as the buttons so they never overlap.
      if (!synced.current) {
        synced.current = true;
        await run(() => sync(true));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [consent, version, reload]);

  async function run(task: () => Promise<void>): Promise<void> {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      await task();
    } finally {
      working.current = false;
      setBusy(false);
      setConfirm(null);
    }
  }

  const revoke = (file: SharedFile) =>
    run(async () => {
      try {
        // Matched by token alone: a record on another host is refused by revokeShareLink, not skipped.
        const link = links.find((l) => !l.revoked && parseShareUrl(l.url)?.token === file.token);
        if (link) {
          const result = await revokeShareLink(repo, link, { api: api() });
          if (!result.ok) {
            const message = result.issues[0]?.message ?? 'Nothing was saved.';
            if (message === LINK_GONE_MESSAGE) {
              // The file is revoked on the service; only the repo had no line left to mark.
              setInfo('The link was revoked. The repository had no record of it to update.');
              refresh();
            } else setError(message);
            return;
          }
        } else {
          await api().revoke(file.token);
        }
        refresh();
      } catch (e) {
        setError(
          e instanceof ShareError
            ? e.message
            : `The link was revoked, but the repository was not updated. ${writeErrorMessage(e)}`,
        );
      }
    });

  const deleteAll = () =>
    run(async () => {
      try {
        await api().deleteAccount();
      } catch (e) {
        setError(messageOf(e));
        return;
      }
      // The files are gone from here on; the repo's records follow, own service's links only.
      const service = new URL(shareServiceUrl()).origin;
      const revoked = new Date().toISOString();
      let marked = 0;
      let left = 0;
      try {
        await writeBusiness(repo, async (fresh) => {
          marked = 0;
          left = 0;
          const next = replaceJsonlLines(
            (await fresh.read(LINKS_PATH)) ?? '',
            (raw) => {
              if (raw.revoked !== undefined) return null;
              if (typeof raw.url === 'string' && onService({ url: raw.url }, service)) {
                marked++;
                return { ...raw, revoked };
              }
              left++;
              return null;
            },
            KEY_ORDER.link,
          );
          if (marked === 0) return { ok: false, issues: [] };
          return {
            ok: true,
            value: { changes: { [LINKS_PATH]: next }, message: 'business: revoke all share links' },
          };
        });
      } catch (e) {
        setError(
          `All shared files were deleted, but the repository was not updated. ${writeErrorMessage(e)}`,
        );
        refresh();
        return;
      }
      setInfo(
        `All shared files were deleted.${
          left > 0
            ? ` ${left} ${left === 1 ? 'link' : 'links'} on another share service ${left === 1 ? 'was' : 'were'} not changed.`
            : ''
        } Records in other repositories are not updated.`,
      );
      refresh();
    });

  if (!consent) return null;
  return (
    <div class="space-y-3">
      <div class="flex flex-wrap items-center gap-2 text-xs">
        {list && (
          <span>
            Storage used: {megabytes(list.used)} of {megabytes(list.quota)}
          </span>
        )}
        <button
          ref={syncButton}
          type="button"
          class={BUTTON}
          disabled={busy}
          onClick={() => run(() => sync())}
        >
          Sync downloads
        </button>
        <span class="text-[var(--los-muted)]">
          Download counts are approximate: link previews and scanners can add downloads, and late
          ones show up on the next sync.
        </span>
      </div>
      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
      {info && <output class="block text-xs">{info}</output>}
      {list && (
        <div class="overflow-x-auto">
          <table aria-label="Shared files" class="w-full text-xs">
            <thead>
              <tr>
                <th class={th}>Document</th>
                <th class={th}>Business</th>
                <th class={th}>Kind</th>
                <th class={th}>Size</th>
                <th class={th}>Created</th>
                <th class={th}>Expires</th>
                <th class={th}>Downloads (approx.)</th>
                <th class={th}>Status</th>
                <th class={th}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {list.files.map((f) => (
                <tr key={f.token}>
                  <td class={td}>{f.label}</td>
                  <td class={td}>{f.business}</td>
                  <td class={td}>{f.kind}</td>
                  <td class={td}>{formatSize(f.size)}</td>
                  <td class={td}>{f.created.slice(0, 10)}</td>
                  <td class={td}>{f.expires ? f.expires.slice(0, 10) : '-'}</td>
                  <td class={td}>{f.downloads}</td>
                  <td class={td}>{statusOf(f)}</td>
                  <td class={td}>
                    {/* An expired file still takes storage until it is revoked. */}
                    {statusOf(f) !== 'Revoked' &&
                      (confirm === f.token ? (
                        <span class="flex flex-wrap items-center gap-1">
                          <button
                            type="button"
                            class={BUTTON}
                            disabled={busy}
                            ref={confirmButton}
                            aria-label={`Revoke ${f.label}`}
                            onClick={() => revoke(f)}
                          >
                            Revoke
                          </button>
                          <button
                            type="button"
                            class={BUTTON}
                            aria-label={`Cancel revoking ${f.label}`}
                            onClick={() => setConfirm(null)}
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          class={BUTTON}
                          disabled={busy}
                          data-trigger={f.token}
                          aria-label={`Revoke the share link for ${f.label}`}
                          onClick={() => setConfirm(f.token)}
                        >
                          Revoke…
                        </button>
                      ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {list.files.length === 0 && (
            <p class="text-xs text-[var(--los-muted)]">No shared files.</p>
          )}
        </div>
      )}
      <section aria-label="Delete all" class="text-xs space-y-1">
        {confirm === 'all' ? (
          <div class="flex flex-wrap items-center gap-1">
            <span>Delete every file you shared and revoke all links? This cannot be undone.</span>
            <button
              ref={confirmButton}
              type="button"
              class={BUTTON}
              disabled={busy}
              onClick={deleteAll}
            >
              Yes, delete everything
            </button>
            <button
              type="button"
              class={BUTTON}
              aria-label="Cancel deleting all shared files"
              onClick={() => setConfirm(null)}
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            type="button"
            class={BUTTON}
            disabled={busy}
            data-trigger="all"
            onClick={() => setConfirm('all')}
          >
            Delete all my shared files…
          </button>
        )}
      </section>
    </div>
  );
}

export function SharedPage() {
  const state = useBusinessRepo();
  const [consent, setConsent] = useState(hasShareConsent);
  const [asking, setAsking] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [version, setVersion] = useState(0);
  return (
    <PageShell state={state} title="Shared files">
      {({ repo, data }) =>
        demoMode.value ? (
          <p class="text-xs text-[var(--los-muted)]">Sharing is not available in demo mode.</p>
        ) : (
          <>
            <p class="text-xs">
              <a href="/business" class="text-[var(--los-accent)] hover:underline">
                Back to business
              </a>
            </p>
            <ServiceUrl onChange={() => setVersion((n) => n + 1)} />
            {!consent && (
              <p class="text-xs space-y-1">
                <span class="block">Sharing is off until you read how it works.</span>
                <button type="button" class={BUTTON} onClick={() => setAsking(true)}>
                  Enable sharing…
                </button>
              </p>
            )}
            {asking && (
              <ShareConsent
                onAccept={() => {
                  acceptShareConsent();
                  setConsent(true);
                  setAccepted(true);
                  setAsking(false);
                }}
                onCancel={() => setAsking(false)}
              />
            )}
            <Files
              repo={repo}
              links={data.links}
              consent={consent}
              version={version}
              focusSync={accepted}
            />
          </>
        )
      }
    </PageShell>
  );
}
