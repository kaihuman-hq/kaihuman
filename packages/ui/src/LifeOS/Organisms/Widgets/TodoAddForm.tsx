import type { Milestone, TodoDue, TodoPrompt, TodoRepeat } from '@kaihuman/formats';
import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../../Atoms/Typography';
import { buildRepeat, NO_REPEAT, type RepeatState } from '../../Templates/repeatView';
import { RepeatFields } from './RepeatFields';

export interface PromptRef {
  prompt: TodoPrompt;
  openAfter: boolean;
}

interface TodoAddFormProps {
  existingTags: string[];
  milestones: Milestone[];
  /** Path of the .todos.md file — used to compute the prompt file directory */
  todosFilePath?: string;
  onAdd: (
    text: string,
    tags: string[],
    milestoneId?: string,
    promptRef?: PromptRef,
    due?: TodoDue,
    repeat?: TodoRepeat,
  ) => void;
  onCancel: () => void;
}

function dirOf(filePath: string): string {
  const idx = filePath.lastIndexOf('/');
  return idx >= 0 ? filePath.slice(0, idx + 1) : '';
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function toFileName(name: string): string {
  const trimmed = name.trim();
  return trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`;
}

export const TodoAddForm = ({
  existingTags,
  milestones,
  todosFilePath,
  onAdd,
  onCancel,
}: TodoAddFormProps) => {
  const [text, setText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState('');
  const [createPromptFile, setCreatePromptFile] = useState(false);
  const [promptFileName, setPromptFileName] = useState('');
  const [openAfter, setOpenAfter] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [repeat, setRepeat] = useState<RepeatState>(NO_REPEAT);

  const basePath = todosFilePath ? dirOf(todosFilePath) : '';

  const toggleTag = (tag: string) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag],
    );
  };

  const addNewTag = () => {
    const t = newTag.trim().toLowerCase().replace(/\s+/g, '-');
    if (!t || selectedTags.includes(t)) return;
    setSelectedTags((prev) => [...prev, t]);
    setNewTag('');
  };

  const handleTogglePromptFile = (checked: boolean) => {
    if (checked && !promptFileName) {
      setPromptFileName(slugify(text) || 'prompt');
    }
    setCreatePromptFile(checked);
  };

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!text.trim()) return;

    let promptRef: PromptRef | undefined;
    if (createPromptFile && promptFileName.trim()) {
      const fileName = toFileName(promptFileName);
      const filePath = `${basePath}${fileName}`;
      promptRef = { prompt: { lines: [], refFile: filePath }, openAfter };
    }

    const due = dueDate ? { date: dueDate, time: dueTime || undefined } : undefined;
    onAdd(
      text.trim(),
      selectedTags,
      selectedMilestone || undefined,
      promptRef,
      due,
      buildRepeat(repeat, dueDate || undefined),
    );
  };

  return (
    <div className="w-full text-[var(--los-fg)] p-4">
      <MonoHeader className="text-xl mb-6 text-[var(--los-accent)]">ADD TASK</MonoHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-5 max-w-md">
        {/* Task text */}
        <div className="flex flex-col gap-1">
          <MonoLabel>TASK</MonoLabel>
          <input
            type="text"
            // biome-ignore lint/a11y/noAutofocus: intentional form focus
            autoFocus
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            placeholder="What needs to be done?"
          />
        </div>

        {/* Tags */}
        <div className="flex flex-col gap-2">
          <MonoLabel>TAGS (optional)</MonoLabel>

          {existingTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {existingTags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  className={cn(
                    'text-[10px] font-mono px-2 py-0.5 border transition-colors',
                    selectedTags.includes(tag)
                      ? 'border-[var(--los-accent)] text-[var(--los-accent)] bg-[var(--los-accent)]/5'
                      : 'border-[var(--los-border)] text-[var(--los-muted)] hover:border-[var(--los-fg)] hover:text-[var(--los-fg)]',
                  )}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onInput={(e) => setNewTag(e.currentTarget.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addNewTag();
                }
              }}
              className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-1.5 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
              placeholder="new-tag"
            />
            <button
              type="button"
              onClick={addNewTag}
              disabled={!newTag.trim()}
              className="px-3 border border-[var(--los-border)] text-xs font-mono hover:bg-white/5 disabled:opacity-40 transition-colors"
            >
              ADD
            </button>
          </div>

          {selectedTags.length > 0 && (
            <MonoText className="text-[10px] text-[var(--los-muted)]">
              Selected: {selectedTags.map((t) => `#${t}`).join(' ')}
            </MonoText>
          )}
        </div>

        {/* Due date + recurrence */}
        <div className="flex flex-col gap-1">
          <MonoLabel>DUE (optional)</MonoLabel>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="date"
              aria-label="Due date"
              value={dueDate}
              onInput={(e) => {
                const value = e.currentTarget.value;
                setDueDate(value);
                // No due date, no time and no recurrence.
                if (!value) {
                  setDueTime('');
                  setRepeat(NO_REPEAT);
                }
              }}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            />
            <input
              type="time"
              aria-label="Due time"
              value={dueTime}
              disabled={!dueDate}
              onInput={(e) => setDueTime(e.currentTarget.value)}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono focus:border-[var(--los-accent)] outline-none transition-colors disabled:opacity-40"
            />
          </div>
          <RepeatFields dueDate={dueDate} value={repeat} onChange={setRepeat} />
        </div>

        {/* Milestone */}
        {milestones.length > 0 && (
          <div className="flex flex-col gap-1">
            <MonoLabel>MILESTONE (optional)</MonoLabel>
            <select
              value={selectedMilestone}
              onChange={(e) => setSelectedMilestone(e.currentTarget.value)}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            >
              <option value="">— none —</option>
              {milestones.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.dueDate ? ` (${m.dueDate})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Prompt file */}
        <div className="flex flex-col gap-3 border-t border-[var(--los-border)] pt-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={createPromptFile}
              onChange={(e) => handleTogglePromptFile(e.currentTarget.checked)}
              className="accent-[var(--los-accent)]"
            />
            <MonoLabel className="cursor-pointer">CREATE PROMPT FILE</MonoLabel>
          </label>

          {createPromptFile && (
            <div className="flex flex-col gap-3 pl-4 border-l-2 border-[var(--los-accent)]/30">
              <div className="flex flex-col gap-1">
                <MonoLabel>FILENAME</MonoLabel>
                <div className="flex items-center gap-2">
                  {basePath && (
                    <MonoText className="text-[10px] text-[var(--los-muted)] shrink-0">
                      {basePath}
                    </MonoText>
                  )}
                  <input
                    type="text"
                    value={promptFileName}
                    onInput={(e) => setPromptFileName(e.currentTarget.value)}
                    placeholder="prompt.md"
                    className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
                  />
                </div>
                <MonoText className="text-[9px] text-[var(--los-muted)]">
                  Full path: {basePath}
                  {toFileName(promptFileName || 'prompt')}
                </MonoText>
              </div>

              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={openAfter}
                  onChange={(e) => setOpenAfter(e.currentTarget.checked)}
                  className="accent-[var(--los-accent)]"
                />
                <MonoLabel className="cursor-pointer">OPEN IN FOCUS MODE AFTERWARDS</MonoLabel>
              </label>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 border border-[var(--los-border)] text-xs font-mono text-[var(--los-muted)] hover:bg-white/5 transition-colors"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!text.trim()}
            className="flex-1 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ADD TASK
          </button>
        </div>
      </form>
    </div>
  );
};
