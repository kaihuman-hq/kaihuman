import {
  convertOffer,
  decideOffer,
  EVENTS_PATH,
  type Ulid,
  ulid,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { route } from 'preact-router';
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

/** Accepted, Declined and Convert to invoice for one issued offer. */
/** `decided`: the offer was accepted, so only the conversion is left. */
export function OfferActions({ offer, decided = false }: { offer: string; decided?: boolean }) {
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
      <button
        type="button"
        class={BUTTON}
        disabled={busy}
        aria-label={`Convert ${offer} to invoice`}
        onClick={convert}
      >
        Convert to invoice
      </button>
      {error && (
        <p role="alert" class="w-full text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </div>
  );
}
