import { PRIMARY } from './buttons';

const STEPS = [
  ['Add a client', 'Who you work for: name, address and hourly rate.'],
  ['Track time', 'Start the timer while you work, or log hours afterwards.'],
  ['Draft an invoice', 'Unbilled time becomes invoice lines you can still edit.'],
  ['Issue and get paid', 'Issue the invoice, send or share it, then record the payment.'],
] as const;

/** First run: no clients yet, so nothing else on the dashboard can do anything. */
export function GettingStarted() {
  return (
    <section
      aria-labelledby="getting-started"
      class="border border-[var(--los-accent)] p-4 sm:p-6 space-y-4"
    >
      <div class="space-y-1">
        <h2 id="getting-started" class="text-sm font-bold">
          Start by adding your first client
        </h2>
        <p class="text-xs text-[var(--los-fg-dim)] max-w-prose">
          Everything here hangs off a client: time, offers, invoices and contracts. Once a client
          exists, this page shows what needs your attention.
        </p>
      </div>
      <ol class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map(([title, text], i) => (
          <li key={title} class="flex gap-2 min-w-0">
            <span
              aria-hidden="true"
              class={`shrink-0 w-6 h-6 grid place-items-center border text-xs font-bold ${
                i === 0
                  ? 'border-[var(--los-accent)] text-[var(--los-accent)]'
                  : 'border-[var(--los-border)] text-[var(--los-muted)]'
              }`}
            >
              {i + 1}
            </span>
            <span class="min-w-0">
              <span class="block text-xs font-bold">{title}</span>
              <span class="block text-xs text-[var(--los-fg-dim)]">{text}</span>
            </span>
          </li>
        ))}
      </ol>
      <a href="/clients/new" class={PRIMARY}>
        Add your first client
      </a>
    </section>
  );
}
