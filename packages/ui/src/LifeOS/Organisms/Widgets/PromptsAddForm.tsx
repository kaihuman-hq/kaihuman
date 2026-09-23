import { useState } from 'preact/hooks';
import { MonoHeader } from '../../Atoms/Typography';

interface PromptsAddFormProps {
  onAdd: (title: string, tags: string[], body: string) => void;
  onCancel?: () => void;
  /** The same form adds commands to a `.commands.md`, where the body is the command. */
  noun?: 'prompt' | 'command';
}

export const PromptsAddForm = ({ onAdd, onCancel, noun = 'prompt' }: PromptsAddFormProps) => {
  const isCommand = noun === 'command';
  const [title, setTitle] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [body, setBody] = useState('');

  const handleSubmit = (e: any) => {
    e.preventDefault();
    if (!title.trim() || !body.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim().replace(/^#/, ''))
      .filter((t) => !!t);
    onAdd(title, tags, body);
    setTitle('');
    setTagsInput('');
    setBody('');
  };

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto">
      <div className="flex justify-between items-center mb-6">
        <MonoHeader>{isCommand ? 'ADD COMMAND' : 'ADD PROMPT'}</MonoHeader>
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
            for="prompts-title"
            className="block text-[10px] text-[var(--los-muted)] mb-1 uppercase tracking-wider"
          >
            Title
          </label>
          <input
            id="prompts-title"
            type="text"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
            className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] outline-none focus:border-[var(--los-accent)] transition-colors"
            placeholder={isCommand ? 'e.g. List a folder' : 'e.g. Refactor to hooks'}
          />
        </div>

        <div>
          <label
            for="prompts-tags"
            className="block text-[10px] text-[var(--los-muted)] mb-1 uppercase tracking-wider"
          >
            Tags (comma separated)
          </label>
          <input
            id="prompts-tags"
            type="text"
            value={tagsInput}
            onInput={(e) => setTagsInput(e.currentTarget.value)}
            className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] outline-none focus:border-[var(--los-accent)] transition-colors"
            placeholder={isCommand ? 'e.g. files, shell' : 'e.g. react, refactor'}
          />
        </div>

        <div>
          <label
            for="prompts-body"
            className="block text-[10px] text-[var(--los-muted)] mb-1 uppercase tracking-wider"
          >
            {isCommand ? 'Command — $1, $2… are asked for; \\$1 stays literal' : 'Prompt'}
          </label>
          <textarea
            id="prompts-body"
            value={body}
            onInput={(e) => setBody(e.currentTarget.value)}
            className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] outline-none focus:border-[var(--los-accent)] transition-colors min-h-[160px] font-mono"
            placeholder={isCommand ? 'ls -la $1' : 'The prompt text...'}
          />
        </div>

        <button
          type="submit"
          disabled={!title.trim() || !body.trim()}
          className="mt-4 bg-[var(--los-fg)] text-[var(--los-bg)] py-2 text-xs font-mono uppercase hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCommand ? 'Add Command' : 'Add Prompt'}
        </button>
      </form>
    </div>
  );
};
