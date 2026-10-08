import { AVAILABLE_TIMEZONES, type TimezoneEntry } from '@kaihuman/formats';
import { Plus, Search } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { MonoHeader, MonoText } from '../../Atoms/Typography';

export interface TimezoneAddFormProps {
  onAdd: (entry: TimezoneEntry) => void;
  onCancel: () => void;
  existingIds?: string[]; // To prevent duplicates based on logic ID or Name?
}

export const TimezoneAddForm = ({ onAdd, onCancel }: TimezoneAddFormProps) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return AVAILABLE_TIMEZONES;
    const lower = search.toLowerCase();
    return AVAILABLE_TIMEZONES.filter(
      (tz) =>
        tz.name.toLowerCase().includes(lower) ||
        tz.cities.some((c) => c.toLowerCase().includes(lower)),
    );
  }, [search]);

  return (
    <div className="flex flex-col h-full w-full max-w-md mx-auto">
      <MonoHeader className="mb-4 text-center">ADD TIMEZONE</MonoHeader>

      <div className="relative mb-4">
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--los-muted)]">
          <Search size={14} />
        </div>
        <input
          type="text"
          placeholder="Search City or Timezone..."
          className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 pl-9 text-xs font-mono focus:outline-none focus:border-[var(--los-accent)] transition-colors"
          value={search}
          onInput={(e) => setSearch(e.currentTarget.value)}
        />
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 border border-[var(--los-border)]">
        {filtered.length === 0 ? (
          <div className="p-4 text-center text-[var(--los-muted)]">
            <MonoText>No matches found.</MonoText>
          </div>
        ) : (
          filtered.map((tz) => (
            <button
              key={tz.name}
              type="button"
              onClick={() => {
                const newEntry: TimezoneEntry = {
                  id: crypto.randomUUID(),
                  name: tz.name,
                  offset: tz.offset,
                  cities: tz.cities,
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                };
                onAdd(newEntry);
              }}
              className="w-full text-left p-3 border-b border-[var(--los-border)] last:border-0 hover:bg-white/5 transition-colors flex justify-between items-center group"
            >
              <div>
                <MonoText className="text-xs">{tz.name}</MonoText>
                <MonoText className="text-[10px] text-[var(--los-muted)] truncate max-w-[200px]">
                  {tz.cities.join(', ')}
                </MonoText>
              </div>
              <div className="flex items-center gap-3">
                <MonoText className="text-[10px] text-[var(--los-muted)] group-hover:text-[var(--los-fg)]">
                  {tz.offset}
                </MonoText>
                <Plus
                  size={14}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[var(--los-accent)]"
                />
              </div>
            </button>
          ))
        )}
      </div>

      <div className="mt-4 flex justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 border border-[var(--los-border)] hover:bg-white/5 transition-colors text-xs font-mono"
        >
          CANCEL
        </button>
      </div>
    </div>
  );
};
