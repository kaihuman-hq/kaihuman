import type { StreamOp } from '@kaihuman/formats';
import type { ComponentChildren } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { send } from '../palette/port.js';

/** Edits go through the worker, which queues and retries them; a failure surfaces as its banner. */
export const sendOps = (ops: StreamOp[]) => {
  void send({ type: 'WORK_OPS', ops }).catch(() => {});
};

export const errorText = (failure: unknown) =>
  failure instanceof Error ? failure.message : String(failure);

export const splitLabels = (text: string) =>
  text
    .split(',')
    .map((label) => label.trim())
    .filter((label) => label !== '');

export const primary =
  'shrink-0 bg-nt-primary px-3 py-1 text-[12px] font-bold text-black hover:bg-nt-accent disabled:opacity-40 disabled:hover:bg-nt-primary';
export const quiet =
  'shrink-0 border border-nt-control px-2 py-0.5 text-[12px] text-nt-fg hover:border-nt-muted disabled:opacity-40';
export const field =
  'min-w-0 border border-nt-control bg-nt-bg px-2 py-1 text-[12px] text-nt-fg placeholder:text-nt-faint focus:border-nt-pin';
export const iconButton =
  'flex h-6 w-6 shrink-0 items-center justify-center text-[13px] text-nt-faint hover:text-nt-fg disabled:opacity-30 disabled:hover:text-nt-faint';

/** A stream picked from a row of choices; long names are cut and shown whole on hover. */
export function Choice({
  selected,
  onClick,
  disabled,
  children,
  title,
}: {
  selected?: boolean;
  onClick: () => void;
  disabled?: boolean;
  children: ComponentChildren;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={selected}
      disabled={disabled}
      onClick={onClick}
      class={`max-w-[11rem] truncate border px-2 py-0.5 text-[12px] disabled:opacity-40 ${
        selected
          ? 'border-nt-accent text-nt-accent'
          : 'border-nt-control text-nt-muted hover:border-nt-muted hover:text-nt-fg'
      }`}
    >
      {children}
    </button>
  );
}

/** One line of text asked for in place, where a dialog would otherwise open: side panels block
 * `window.prompt`, which only dims the panel and returns nothing. */
export function InlineInput({
  label,
  placeholder,
  submit,
  initial = '',
  onSubmit,
  onCancel,
}: {
  label: string;
  placeholder?: string;
  submit: string;
  initial?: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  return (
    <form
      class="flex items-center gap-1.5"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(value);
      }}
    >
      <input
        ref={input}
        aria-label={label}
        placeholder={placeholder}
        class={`${field} flex-1`}
        value={value}
        onInput={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
        }}
      />
      <button type="submit" class={primary}>
        {submit}
      </button>
      <button type="button" class={iconButton} aria-label="Cancel" onClick={onCancel}>
        ✕
      </button>
    </form>
  );
}

/** Asks for a stream name in place; a blank name keeps the input open rather than adding nothing. */
export function NewStreamInput({
  onCreate,
  onCancel,
  submit = 'Add',
}: {
  onCreate: (name: string) => void;
  onCancel: () => void;
  submit?: string;
}) {
  return (
    <InlineInput
      label="New stream name"
      placeholder="Name the stream"
      submit={submit}
      onSubmit={(value) => {
        const name = value.trim();
        if (name) onCreate(name);
      }}
      onCancel={onCancel}
    />
  );
}

/** A section heading with its count kept apart from the title, so long titles never hide it. */
export function Heading({
  title,
  count,
  children,
}: {
  title: string;
  count?: number;
  children?: ComponentChildren;
}) {
  return (
    <div class="flex items-center gap-2 pb-1">
      <h2 class="flex min-w-0 flex-1 items-baseline gap-2 text-[12px] font-bold text-nt-fg">
        <span class="truncate">{title}</span>
        {count !== undefined && (
          <span
            data-count
            class={`tabular-nums font-normal ${count > 0 ? 'text-nt-accent' : 'text-nt-faint'}`}
          >
            {count}
          </span>
        )}
      </h2>
      {children}
    </div>
  );
}
