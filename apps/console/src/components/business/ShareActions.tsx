import { authStore, demoMode } from '@kaihuman/core';
import type { LinkRecord } from '@kaihuman/formats/business';
import { useEffect, useRef, useState } from 'preact/hooks';
import {
  acceptShareConsent,
  createShareLink,
  hasShareConsent,
  revokeShareLink,
  ShareError,
  shareApi,
  shareServiceUrl,
} from '../../lib/business/share';
import { useBusinessRepo } from '../../lib/business/use-business-repo';
import { writeErrorMessage } from '../../lib/business/write';
import { ShareConsent } from './ShareConsent';

const BUTTON =
  'px-2 py-1 text-xs rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90 disabled:opacity-50';

export type ShareDoc = {
  number: string;
  /** The issued yaml; the PDF sits next to it. */
  path: string;
  pdf: boolean;
  /** Offers: their `valid_until`. Invoices: none. */
  expires?: string;
};

type Phase = 'idle' | 'consent' | 'confirm' | 'confirm-revoke';
type CopyState = 'idle' | 'copied' | 'fallback';

const messageOf = (e: unknown, fallback: (e: unknown) => string): string =>
  e instanceof ShareError ? e.message : fallback(e);

function CopyLink({ url, number }: { url: string; number: string }) {
  const [state, setState] = useState<CopyState>('idle');
  const field = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== 'fallback') return;
    field.current?.focus();
    field.current?.select();
  }, [state]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setState('copied');
    } catch {
      // No clipboard API or no permission: let the user copy it by hand.
      setState('fallback');
    }
  }

  return (
    <>
      <button
        type="button"
        class={BUTTON}
        aria-label={`Copy the share link for ${number}`}
        onClick={copy}
      >
        Copy link
      </button>
      {state === 'copied' && <output class="text-xs text-[var(--los-muted)]">Copied.</output>}
      {state === 'fallback' && (
        <label class="w-full text-xs">
          <span class="block text-[var(--los-muted)]">Copy this link:</span>
          <input
            ref={field}
            type="text"
            readOnly
            value={url}
            class="w-full rounded border border-[var(--los-border)] bg-[var(--los-bg)] px-1 py-0.5 font-mono"
            onFocus={(e) => e.currentTarget.select()}
          />
        </label>
      )}
    </>
  );
}

/**
 * Share…, Copy link and Revoke… for one issued document with a PDF. Nothing uploads without the
 * one-time consent and a confirm per document. An expired link that was never revoked still holds
 * its file on the service, so it keeps a Revoke… next to Share….
 */
export function ShareActions({
  doc,
  link,
  expired = null,
}: {
  doc: ShareDoc;
  /** The document's active link. */
  link: LinkRecord | null;
  /** The document's latest link when it expired without being revoked. */
  expired?: LinkRecord | null;
}) {
  const state = useBusinessRepo();
  const [phase, setPhase] = useState<Phase>('idle');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The page's state catches up after a reload; until then these keep the row truthful.
  const [created, setCreated] = useState<LinkRecord | null>(null);
  const [revokedId, setRevokedId] = useState<string | null>(null);
  const submitting = useRef(false);
  // The confirm's own button takes focus whenever a confirm opens, also right after the consent.
  const confirmButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (phase === 'confirm' || phase === 'confirm-revoke') confirmButton.current?.focus();
  }, [phase]);

  if (!doc.pdf || state.status !== 'ready') return null;
  const { repo, data } = state;

  if (demoMode.value) {
    return (
      <div class="flex flex-wrap items-center gap-1">
        <button type="button" class={BUTTON} disabled aria-describedby={`share-demo-${doc.number}`}>
          Share…
        </button>
        <span id={`share-demo-${doc.number}`} class="text-xs text-[var(--los-muted)]">
          Sharing is not available in demo mode.
        </span>
      </div>
    );
  }

  const active = [link, created].find((l) => l && l.id !== revokedId) ?? null;
  const url = active?.url;
  const lapsed = !active && expired && expired.id !== revokedId ? expired : null;
  const revocable = active ?? lapsed;

  async function run(task: () => Promise<void>): Promise<void> {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      await task();
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const api = () => {
    const token = authStore.token.value;
    if (!token) throw new ShareError('Sign in with GitHub to share documents.');
    return shareApi(shareServiceUrl(), token);
  };

  const share = () =>
    run(async () => {
      try {
        const baseUrl = shareServiceUrl();
        const result = await createShareLink(
          repo,
          { number: doc.number, path: doc.path, ...(doc.expires ? { expires: doc.expires } : {}) },
          {
            api: api(),
            baseUrl,
            // An empty name would be refused by the service.
            business: data.profile?.name || repo.full_name.split('/')[0] || '',
          },
        );
        setCreated(result.link);
        setRevokedId(null);
        setPhase('idle');
      } catch (e) {
        setError(
          messageOf(
            e,
            (x) =>
              `Sharing failed, nothing was uploaded: ${x instanceof Error ? x.message : String(x)}`,
          ),
        );
      }
    });

  const revoke = () =>
    run(async () => {
      if (!revocable) return;
      try {
        const result = await revokeShareLink(repo, revocable, { api: api() });
        if (!result.ok) {
          setError(result.issues[0]?.message ?? 'Nothing was saved.');
          return;
        }
        setRevokedId(revocable.id);
        setCreated(null);
        setPhase('idle');
      } catch (e) {
        setError(
          messageOf(
            e,
            (x) =>
              `The link was revoked, but the repository was not updated. ${writeErrorMessage(x)}`,
          ),
        );
      }
    });

  const startShare = () => {
    setError(null);
    setPhase(hasShareConsent() ? 'confirm' : 'consent');
  };

  return (
    <div class="flex flex-wrap items-center gap-1">
      {url ? (
        <>
          <span class="text-xs text-[var(--los-success)]">Online · link active</span>
          <CopyLink url={url} number={doc.number} />
          {active && phase !== 'confirm-revoke' && (
            <button
              type="button"
              class={BUTTON}
              disabled={busy}
              aria-label={`Revoke the share link for ${doc.number}`}
              onClick={() => setPhase('confirm-revoke')}
            >
              Revoke…
            </button>
          )}
          {active === created && (
            <code class="w-full text-[10px] break-all text-[var(--los-muted)]">{url}</code>
          )}
        </>
      ) : (
        <>
          {lapsed && <span class="text-xs text-[var(--los-muted)]">Link expired</span>}
          {phase !== 'confirm' && (
            <button
              type="button"
              class={BUTTON}
              disabled={busy}
              aria-label={`Share ${doc.number}`}
              onClick={startShare}
            >
              Share…
            </button>
          )}
          {lapsed && phase !== 'confirm-revoke' && (
            <button
              type="button"
              class={BUTTON}
              disabled={busy}
              aria-label={`Revoke the expired share link for ${doc.number}`}
              onClick={() => setPhase('confirm-revoke')}
            >
              Revoke…
            </button>
          )}
        </>
      )}

      {phase === 'confirm' && !url && (
        <div class="w-full flex flex-wrap items-center gap-1 text-xs">
          <span>Upload {doc.number}.pdf (encrypted) to create a share link?</span>
          <button ref={confirmButton} type="button" class={BUTTON} disabled={busy} onClick={share}>
            {busy ? 'Uploading…' : 'Upload'}
          </button>
          <button type="button" class={BUTTON} disabled={busy} onClick={() => setPhase('idle')}>
            Cancel
          </button>
        </div>
      )}

      {phase === 'confirm-revoke' && revocable && (
        <div class="w-full flex flex-wrap items-center gap-1 text-xs">
          <span>Revoke the link for {doc.number}? It stops working for everyone who has it.</span>
          <button ref={confirmButton} type="button" class={BUTTON} disabled={busy} onClick={revoke}>
            {busy ? 'Revoking…' : 'Revoke'}
          </button>
          <button type="button" class={BUTTON} disabled={busy} onClick={() => setPhase('idle')}>
            Cancel
          </button>
        </div>
      )}

      {phase === 'consent' && (
        <ShareConsent
          onAccept={() => {
            acceptShareConsent();
            setPhase('confirm');
          }}
          onCancel={() => setPhase('idle')}
        />
      )}

      {error && (
        <p role="alert" class="w-full text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </div>
  );
}
