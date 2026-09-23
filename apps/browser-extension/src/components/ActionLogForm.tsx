import { useState } from 'preact/hooks';

interface ActionLogFormProps {
  onAdd: (description: string, tags: string[]) => void;
  status: 'idle' | 'saving' | 'success' | 'error';
  errorMessage: string | null;
}

export function ActionLogForm({ onAdd, status, errorMessage }: ActionLogFormProps) {
  const [description, setDescription] = useState('');
  const [tagsInput, setTagsInput] = useState('');

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!description.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter((t) => !!t);
    onAdd(description, tags);

    // Reset form on success will be handled by parent or here if we want immediate feedback
    // actually, better to let parent clear it or clear it here and let parent handle status
    if (status !== 'error') {
      setDescription('');
      setTagsInput('');
    }
  };

  return (
    <form onSubmit={handleSubmit} class="w-full flex pr-4 flex-col gap-3">
      <div>
        <label class="block text-[10px] text-[var(--los-fg-dim)] mb-1 uppercase tracking-wider font-bold">
          Description
        </label>
        <textarea
          value={description}
          onInput={(e) => setDescription((e.target as HTMLTextAreaElement).value)}
          class="w-full min-h-[80px] bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors resize-none"
          placeholder="What happened?"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e);
            }
          }}
          disabled={status === 'saving'}
        />
      </div>

      <div>
        <label class="block text-[10px] text-[var(--los-fg-dim)] mb-1 uppercase tracking-wider font-bold">
          Tags (comma separated)
        </label>
        <input
          type="text"
          value={tagsInput}
          onInput={(e) => setTagsInput((e.target as HTMLInputElement).value)}
          class="w-full bg-[var(--los-bg-hover)] border border-[var(--los-border)] rounded p-2 text-xs text-[var(--los-fg)] focus:border-[var(--los-accent)] focus:ring-1 focus:ring-[var(--los-accent)] focus:outline-none transition-colors"
          placeholder="e.g. work, urgent"
          disabled={status === 'saving'}
        />
      </div>

      {status === 'error' && errorMessage && (
        <div class="text-[10px] text-red-400 p-2 bg-red-950/30 rounded border border-red-900/50 break-words">
          {errorMessage}
        </div>
      )}

      <button
        type="submit"
        disabled={status === 'saving' || !description.trim()}
        class="w-full py-2 px-3 bg-[var(--los-accent)] text-black hover:opacity-90 font-bold text-xs rounded transition-opacity disabled:opacity-50 disabled:cursor-not-allowed mt-1"
      >
        {status === 'saving' ? 'Saving...' : status === 'success' ? 'Added!' : 'Add Entry'}
      </button>
    </form>
  );
}
