import {
  convertOffer,
  creditInvoice,
  decideOffer,
  EVENTS_PATH,
  type Ulid,
  ulid,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
import { todayLocal } from '../../lib/business/dates';
import { useBusinessRepo } from '../../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../../lib/business/write';

const BUTTON =
  'px-2 py-1 text-xs rounded border border-[var(--los-border)] text-[var(--los-fg)] hover:opacity-90 disabled:opacity-50';

export function RecordPaymentLink({ invoice }: { invoice: string }) {
  return (
    <a
      href={`/business/payments/new?invoice=${encodeURIComponent(invoice)}`}
      class="text-xs text-[var(--los-accent)] hover:underline whitespace-nowrap"
      aria-label={`Record payment for ${invoice}`}
    >
      Record payment
    </a>
  );
}

/**
 * Accepted, Declined and Convert to invoice for one issued offer. `decided`: the offer was
 * accepted, so only the conversion is left. `canConvert`: false once an invoice was issued for it.
 */
export function OfferActions({
  offer,
  decided = false,
  canConvert = true,
}: {
  offer: string;
  decided?: boolean;
  canConvert?: boolean;
}) {
  const state = useBusinessRepo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  if (state.status !== 'ready') return null;
  const { repo } = state;

  async function run(
    build: Parameters<typeof writeBusiness>[1],
    after?: () => void,
  ): Promise<void> {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await writeBusiness(repo, build);
      if (!result.ok) setError(result.issues[0]?.message ?? 'Nothing was saved.');
      else after?.();
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  const decide = (decision: 'accepted' | 'declined') => {
    const id = ulid();
    return run(async (fresh) =>
      decideOffer(fresh.repo, await fresh.read(EVENTS_PATH), offer, decision, new Date(), id),
    );
  };
  const convert = () => {
    const id: Ulid = ulid();
    return run(
      async (fresh) => convertOffer(fresh.repo, offer, id),
      () => route(`/business/drafts/${id}`),
    );
  };

  return (
    <div class="flex flex-wrap gap-1">
      {!decided && (
        <>
          <button
            type="button"
            class={BUTTON}
            disabled={busy}
            aria-label={`Mark ${offer} accepted`}
            onClick={() => decide('accepted')}
          >
            Accepted
          </button>
          <button
            type="button"
            class={BUTTON}
            disabled={busy}
            aria-label={`Mark ${offer} declined`}
            onClick={() => decide('declined')}
          >
            Declined
          </button>
        </>
      )}
      {canConvert && (
        <button
          type="button"
          class={BUTTON}
          disabled={busy}
          aria-label={`Convert ${offer} to invoice`}
          onClick={convert}
        >
          Convert to invoice
        </button>
      )}
      {error && (
        <p role="alert" class="w-full text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * "Credit note…": saves a credit note draft with the invoice's lines and opens it in the editor; when
 * one already exists, it links to that draft instead.
 */
export function CreditNoteAction({ invoice }: { invoice: string }) {
  const state = useBusinessRepo();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  if (state.status !== 'ready') return null;
  const { repo, data } = state;
  const existing = data.drafts.find((d) => d.kind === 'credit-note' && d.corrects === invoice);
  if (existing) {
    return (
      <a
        href={`/business/drafts/${existing.id}`}
        class="text-xs text-[var(--los-accent)] hover:underline whitespace-nowrap"
        aria-label={`Open the credit note draft for ${invoice}`}
      >
        Credit note…
      </a>
    );
  }

  async function credit() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    const id: Ulid = ulid();
    try {
      const result = await writeBusiness(repo, async (fresh) =>
        creditInvoice(fresh.repo, invoice, id, todayLocal()),
      );
      if (!result.ok) setError(result.issues[0]?.message ?? 'Nothing was saved.');
      else route(`/business/drafts/${id}`);
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <div class="flex flex-wrap gap-1">
      <button
        type="button"
        class={BUTTON}
        disabled={busy}
        aria-label={`Credit note for ${invoice}`}
        onClick={credit}
      >
        Credit note…
      </button>
      {error && (
        <p role="alert" class="w-full text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </div>
  );
}
