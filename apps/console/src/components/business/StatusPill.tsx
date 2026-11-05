const tone = (state: string): string =>
  state === 'overdue'
    ? 'text-[var(--los-warning)]'
    : state === 'paid' || state === 'accepted'
      ? 'text-[var(--los-success)]'
      : 'text-[var(--los-muted)]';

/** State of an invoice or offer. */
export function StatusPill({ state }: { state: string }) {
  return (
    <span
      class={`px-1.5 py-0.5 border border-current text-[10px] uppercase tracking-widest font-bold whitespace-nowrap ${tone(state)}`}
    >
      {state}
    </span>
  );
}
