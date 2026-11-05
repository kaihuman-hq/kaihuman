import { addClientLog, addClientTodo, clientDir, type Slug } from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { useBusinessRepo } from '../../lib/business/use-business-repo';
import { writeBusiness, writeErrorMessage } from '../../lib/business/write';
import { SECONDARY_MD } from './buttons';
import { INPUT } from './FormField';

const KINDS = {
  todo: { file: 'todos.todos.md', label: 'New todo', button: 'Add todo', add: addClientTodo },
  log: { file: 'log.actionlog.md', label: 'New log line', button: 'Add line', add: addClientLog },
} as const;

/** One line into a client's todo list or action log. Stays in place; the list above updates after the commit. */
export function QuickAdd({ client, kind }: { client: Slug; kind: keyof typeof KINDS }) {
  const state = useBusinessRepo();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitting = useRef(false);
  if (state.status !== 'ready') return null;
  const { repo } = state;
  const { file, label, button, add } = KINDS[kind];
  const id = `quick-${kind}-${client}`;

  async function handleSubmit(e: Event) {
    e.preventDefault();
    if (submitting.current) return;
    if (!text.trim()) {
      setError('Enter some text.');
      return;
    }
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      const path = `${clientDir(client)}/${file}`;
      const result = await writeBusiness(repo, async (fresh) =>
        add(fresh.repo, await fresh.read(path), client, text, new Date()),
      );
      if (!result.ok) {
        setError(result.issues[0]?.message ?? 'Nothing was saved.');
        return;
      }
      setText('');
    } catch (err) {
      setError(writeErrorMessage(err));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate class="mt-3 flex flex-wrap gap-2 items-start">
      <label for={id} class="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        class={`${INPUT} flex-1 min-w-[12rem]`}
        placeholder={label}
        value={text}
        disabled={busy}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        onInput={(e) => setText((e.target as HTMLInputElement).value)}
      />
      <button type="submit" disabled={busy} class={SECONDARY_MD}>
        {busy ? 'Saving...' : button}
      </button>
      {error && (
        <p id={`${id}-error`} role="alert" class="w-full text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}
    </form>
  );
}
