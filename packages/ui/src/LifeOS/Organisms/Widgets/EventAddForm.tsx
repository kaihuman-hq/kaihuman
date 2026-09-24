import type { EventEntry } from '@lifosy/formats';
import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader } from '../../Atoms/Typography';

interface EventAddFormProps {
  onAdd: (entry: EventEntry) => void;
  onCancel: () => void;
}

export const EventAddForm = ({ onAdd, onCancel }: EventAddFormProps) => {
  const [name, setName] = useState('');
  const [type, setType] = useState('general');
  const [startDate, setStartDate] = useState(new Date().toISOString().split('T')[0] || '');
  const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0] || '');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!name || !startDate) return;

    onAdd({
      name,
      type,
      startDate,
      endDate: type === 'birthday' ? startDate : endDate, // Birthdays usually single day
    });
  };

  return (
    <div className="w-full text-[var(--los-fg)] p-4">
      <MonoHeader className="text-xl mb-6 text-[var(--los-accent)]">ADD EVENT</MonoHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        {/* Type Selection */}
        <div className="flex flex-col gap-1">
          <label for="event-type" className="text-[10px] text-[var(--los-muted)] uppercase">
            Type
          </label>
          <div className="flex bg-[var(--los-border)] rounded-sm p-0.5 w-fit">
            <button
              type="button"
              onClick={() => setType('general')}
              className={cn(
                'px-3 py-1 text-xs font-mono transition-colors rounded-sm',
                type === 'general'
                  ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                  : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              GENERAL
            </button>
            <button
              type="button"
              onClick={() => setType('birthday')}
              className={cn(
                'px-3 py-1 text-xs font-mono transition-colors rounded-sm',
                type === 'birthday'
                  ? 'bg-[var(--los-bg)] text-[var(--los-fg)]'
                  : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              BIRTHDAY
            </button>
          </div>
        </div>

        {/* Name Input */}
        <div className="flex flex-col gap-1">
          <label for="event-name" className="text-[10px] text-[var(--los-muted)] uppercase">
            Event Name
          </label>
          <input
            id="event-name"
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors"
            placeholder="e.g. Kickoff 2026"
          />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <label for="event-start-date" className="text-[10px] text-[var(--los-muted)] uppercase">
              Start Date
            </label>
            <input
              id="event-start-date"
              type="date"
              value={startDate}
              onInput={(e) => setStartDate(e.currentTarget.value)}
              className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors block w-full"
            />
          </div>

          {type !== 'birthday' && (
            <div className="flex flex-col gap-1">
              <label for="event-end-date" className="text-[10px] text-[var(--los-muted)] uppercase">
                End Date
              </label>
              <input
                id="event-end-date"
                type="date"
                value={endDate}
                onInput={(e) => setEndDate(e.currentTarget.value)}
                className="bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors block w-full"
              />
            </div>
          )}
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
            disabled={!name}
            className="flex-1 py-2 bg-[var(--los-accent)] text-black text-xs font-mono font-bold hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            SAVE EVENT
          </button>
        </div>
      </form>
    </div>
  );
};
