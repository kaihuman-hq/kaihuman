import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../../Atoms/Typography';
import type { Milestone } from './TodoLogic';

interface TodoAddFormProps {
  existingTags: string[];
  milestones: Milestone[];
  onAdd: (text: string, tags: string[], milestoneId?: string) => void;
  onCancel: () => void;
}

export const TodoAddForm = ({ existingTags, milestones, onAdd, onCancel }: TodoAddFormProps) => {
  const [text, setText] = useState('');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [selectedMilestone, setSelectedMilestone] = useState('');

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

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim(), selectedTags, selectedMilestone || undefined);
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
