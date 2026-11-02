import type { ComponentChildren } from 'preact';

export const INPUT =
  'w-full bg-transparent border border-[var(--los-border)] rounded px-2 py-1.5 text-sm text-[var(--los-fg)] placeholder:text-[var(--los-fg-dim)] focus:outline-none focus:border-[var(--los-accent)] disabled:opacity-50';

/** A labelled input slot. The input gets the same `id` and, when invalid, `aria-describedby={id}-error`. */
export function Field(props: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  /** Announce the error when it appears (for errors that follow a user action, not typing). */
  alert?: boolean;
  children: ComponentChildren;
}) {
  return (
    <div>
      <label for={props.id} class="block text-xs text-[var(--los-fg-dim)] mb-1">
        {props.label}
      </label>
      {props.children}
      {props.hint && !props.error && (
        <p class="text-[10px] text-[var(--los-fg-dim)] mt-1">{props.hint}</p>
      )}
      {props.error && (
        <p
          id={`${props.id}-error`}
          role={props.alert ? 'alert' : undefined}
          class="text-xs text-[var(--los-warning)] mt-1"
        >
          {props.error}
        </p>
      )}
    </div>
  );
}

export const a11y = (id: string, error: string | undefined) => ({
  'aria-invalid': error ? (true as const) : undefined,
  'aria-describedby': error ? `${id}-error` : undefined,
});

/** Optional fields, still labelled; open by default when one of them has an error. */
export function More(props: { open?: boolean; children: ComponentChildren }) {
  return (
    <details open={props.open} class="border border-[var(--los-border)] rounded p-3">
      <summary class="cursor-pointer text-xs font-bold text-[var(--los-fg)]">More</summary>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">{props.children}</div>
    </details>
  );
}
