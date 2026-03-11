import { useState } from 'preact/hooks';
import { MonoHeader } from '../../Atoms/Typography';

interface ActionLogAddFormProps {
  onAdd: (description: string, tags: string[]) => void;
  onCancel?: () => void;
}

export const ActionLogAddForm = ({ onAdd, onCancel }: ActionLogAddFormProps) => {
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
    setDescription('');
    setTagsInput('');
  };

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <MonoHeader>ADD ACTION</MonoHeader>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            className="text-xs text-[var(--los-muted)] hover:text-[var(--los-fg)] px-2 py-1"
          >
            CANCEL
          </button>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div>
          <label
            for="action-log-description"
            className="block text-[10px] text-[var(--los-muted)] mb-1 uppercase tracking-wider"
          >
            Description
          </label>
          <textarea
            id="action-log-description"
            value={description}
            onInput={(e) => setDescription(e.currentTarget.value)}
            className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] outline-none focus:border-[var(--los-accent)] transition-colors min-h-[80px]"
            placeholder="What happened?"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
          />
        </div>

        <div>
          <label
            for="action-log-tags"
            className="block text-[10px] text-[var(--los-muted)] mb-1 uppercase tracking-wider"
          >
            Tags (comma separated)
          </label>
          <input
            id="action-log-tags"
            type="text"
            value={tagsInput}
            onInput={(e) => setTagsInput(e.currentTarget.value)}
            className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] outline-none focus:border-[var(--los-accent)] transition-colors"
            placeholder="e.g. work, urgent"
          />
        </div>

        <button
          type="submit"
          disabled={!description.trim()}
          className="mt-4 bg-[var(--los-fg)] text-[var(--los-bg)] py-2 text-xs font-mono uppercase hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Entry
        </button>
      </form>
    </div>
  );
};
