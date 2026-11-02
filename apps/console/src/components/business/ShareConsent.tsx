import { useEffect, useRef } from 'preact/hooks';
import { customShareHost } from '../../lib/business/share';

const BUTTON =
  'px-3 py-1 text-xs rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90';

/**
 * The one-time explanation before sharing is enabled. A modal dialog: focus moves in, Tab stays
 * inside, Escape cancels, and focus returns to where it was when the dialog closes. Keys are
 * handled on the document so a click that moved focus away cannot break Escape or the trap.
 */
export function ShareConsent({
  onAccept,
  onCancel,
}: {
  onAccept: () => void;
  onCancel: () => void;
}) {
  const dialog = useRef<HTMLDivElement>(null);
  const first = useRef<HTMLButtonElement>(null);
  const host = customShareHost();

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    first.current?.focus();
    return () => opener?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
        return;
      }
      if (e.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll('button') ?? [])];
      const start = buttons[0];
      const end = buttons[buttons.length - 1];
      const inside = dialog.current?.contains(document.activeElement) ?? false;
      if (!inside || (e.shiftKey && document.activeElement === start)) {
        e.preventDefault();
        (e.shiftKey ? end : start)?.focus();
      } else if (!e.shiftKey && document.activeElement === end) {
        e.preventDefault();
        start?.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onCancel]);

  return (
    // A click on the backdrop keeps focus in the dialog instead of dropping it on the body.
    // biome-ignore lint/a11y/noStaticElementInteractions: the backdrop only prevents focus loss
    <div
      class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) e.preventDefault();
      }}
    >
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="share-consent-title"
        aria-describedby="share-consent-body"
        class="max-w-md w-full rounded border border-[var(--los-border)] bg-[var(--los-bg)] p-4 space-y-3 text-xs text-[var(--los-fg)]"
      >
        <h2 id="share-consent-title" class="text-sm font-bold">
          Share documents by link
        </h2>
        <div id="share-consent-body" class="space-y-2">
          {host ? (
            <p>
              Sharing uploads the PDF of a document you choose to <strong>{host}</strong>, the share
              service set on this device instead of kaihuman's. Your GitHub sign-in is sent to{' '}
              {host} with every request so it can tell your files apart.
            </p>
          ) : (
            <p>
              Sharing uploads the PDF of a document you choose to the kaihuman share service, which
              runs on Cloudflare and stores files in the EU.
            </p>
          )}
          <p>
            The file is encrypted in your browser before it is uploaded. The key is only in the
            link, so the service cannot read the file.
          </p>
          <p>
            Anyone who has the link can open the document until the link expires or you revoke it.
          </p>
          <p>
            You can revoke a link at any time with "Revoke…" next to the document. The file is then
            deleted from the service.
          </p>
          <p>Nothing is uploaded until you confirm each document.</p>
        </div>
        <div class="flex flex-wrap justify-end gap-2">
          <button ref={first} type="button" class={BUTTON} onClick={onAccept}>
            I understand, enable sharing
          </button>
          <button type="button" class={BUTTON} onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
