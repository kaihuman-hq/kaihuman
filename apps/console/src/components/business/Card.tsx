import type { ComponentChildren } from 'preact';

/** A titled section; `empty` renders the one-line muted note instead of the children. */
export function Card(props: { title: string; empty?: string; children?: ComponentChildren }) {
  return (
    <section class="border border-[var(--los-border)] p-3 min-w-0">
      <h2 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)] mb-2">
        {props.title}
      </h2>
      {props.empty !== undefined ? (
        <p class="text-xs italic text-[var(--los-muted)]">{props.empty}</p>
      ) : (
        props.children
      )}
    </section>
  );
}
