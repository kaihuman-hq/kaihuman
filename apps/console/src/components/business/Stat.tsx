export function Stat(props: { label: string; value: string; tone?: 'warning'; hint?: string }) {
  return (
    <div class="border border-[var(--los-border)] p-3 min-w-0">
      <dt class="text-[10px] uppercase tracking-widest text-[var(--los-muted)]">{props.label}</dt>
      <dd
        class={`mt-1 text-sm font-bold break-words ${
          props.tone === 'warning' ? 'text-[var(--los-warning)]' : 'text-[var(--los-fg)]'
        }`}
      >
        {props.value}
      </dd>
      {props.hint && (
        <dd class="mt-1 text-[10px] text-[var(--los-fg-dim)] break-words">{props.hint}</dd>
      )}
    </div>
  );
}
