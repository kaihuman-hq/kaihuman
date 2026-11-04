import { addTrip, parseTravel, serializeTravel } from '@kaihuman/formats';
import { useState } from 'preact/hooks';
import { MonoHeader } from '../../Atoms/Typography';

interface TravelAddFormProps {
  content: string;
  onChange: (newContent: string) => void;
  onDone?: () => void;
}

const inputClass =
  'bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors';
const labelClass = 'text-[10px] text-[var(--los-muted)] uppercase';

export const TravelAddForm = ({ content, onChange, onDone }: TravelAddFormProps) => {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [destination, setDestination] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!title.trim()) return;
    onChange(
      serializeTravel(
        addTrip(parseTravel(content), {
          title: title.trim(),
          ...(start && { start }),
          ...(end && { end }),
          ...(destination.trim() && { destination: destination.trim() }),
        }),
      ),
    );
    onDone?.();
  };

  return (
    <div className="w-full text-[var(--los-fg)] p-4">
      <MonoHeader className="text-xl mb-6 text-[var(--los-accent)]">ADD TRIP</MonoHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        <div className="flex flex-col gap-1">
          <label for="travel-title" className={labelClass}>
            Title
          </label>
          <input
            id="travel-title"
            type="text"
            value={title}
            onInput={(e) => setTitle(e.currentTarget.value)}
            className={inputClass}
            placeholder="Summer in Rome"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label for="travel-start" className={labelClass}>
              Start
            </label>
            <input
              id="travel-start"
              type="date"
              value={start}
              onInput={(e) => setStart(e.currentTarget.value)}
              className={inputClass}
            />
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label for="travel-end" className={labelClass}>
              End
            </label>
            <input
              id="travel-end"
              type="date"
              value={end}
              onInput={(e) => setEnd(e.currentTarget.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label for="travel-destination" className={labelClass}>
            Destination
          </label>
          <input
            id="travel-destination"
            type="text"
            value={destination}
            onInput={(e) => setDestination(e.currentTarget.value)}
            className={inputClass}
            placeholder="Rome, Italy"
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!title.trim()}
            className="bg-[var(--los-accent)] text-black font-bold px-4 py-2 text-xs font-mono hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            ADD TRIP
          </button>
          {onDone && (
            <button
              type="button"
              onClick={onDone}
              className="px-4 py-2 text-xs font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
            >
              CANCEL
            </button>
          )}
        </div>
      </form>
    </div>
  );
};
