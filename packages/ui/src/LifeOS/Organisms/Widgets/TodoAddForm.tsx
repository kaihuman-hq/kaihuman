import { h } from 'preact';
import { useState } from 'preact/hooks';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { cn } from '../../../utils';

interface TodoAddFormProps {
  groups: string[]; // Existing groups to select from
  onAdd: (group: string, text: string) => void;
  onCancel: () => void;
}

export const TodoAddForm = ({ groups, onAdd, onCancel }: TodoAddFormProps) => {
  const [text, setText] = useState('');
  const [group, setGroup] = useState(groups[0] || 'Tasks');
  const [isNewGroup, setIsNewGroup] = useState(groups.length === 0);
  const [newGroupName, setNewGroupName] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    const finalGroup = isNewGroup ? newGroupName : group;
    if (!text || !finalGroup) return;

    onAdd(finalGroup, text);
  };

  return (
    <div className="w-full text-[var(--los-fg)] p-4">
      <MonoHeader className="text-xl mb-6 text-[var(--los-accent)]">ADD TODO</MonoHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">

        {/* Group Selection */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--los-muted)] uppercase">Group</label>

          {!isNewGroup && groups.length > 0 ? (
            <div className="flex gap-2">
              <select
                value={group}
                onChange={(e) => setGroup(e.currentTarget.value)}
                className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
              >
                {groups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
              <button
                type="button"
                onClick={() => { setIsNewGroup(true); setNewGroupName(''); }}
                className="px-3 border border-[var(--los-border)] text-xs font-mono hover:bg-white/5"
              >
                NEW GROUP
              </button>
            </div>
          ) : (
            <div className="flex gap-2">
              <input
                type="text"
                value={newGroupName}
                onInput={(e) => setNewGroupName(e.currentTarget.value)}
                className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
                placeholder="New Group Name"
                autoFocus
              />
              {groups.length > 0 && (
                <button
                  type="button"
                  onClick={() => setIsNewGroup(false)}
                  className="px-3 border border-[var(--los-border)] text-xs font-mono hover:bg-white/5"
                >
                  CANCEL
                </button>
              )}
            </div>
          )}
        </div>

        {/* Text Input */}
        <div className="flex flex-col gap-1">
          <label className="text-[10px] text-[var(--los-muted)] uppercase">Task</label>
          <input
            type="text"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            placeholder="What needs to be done?"
          />
        </div>

        {/* Actions */}
        <div className="flex gap-4 mt-4">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 py-2 border border-[var(--los-border)] text-xs font-mono text-[var(--los-muted)] hover:bg-white/5 transition-colors"
          >
            CANCEL
          </button>
          <button
            type="submit"
            disabled={!text || (isNewGroup && !newGroupName)}
            className="flex-1 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ADD TASK
          </button>
        </div>

      </form>
    </div>
  );
};
