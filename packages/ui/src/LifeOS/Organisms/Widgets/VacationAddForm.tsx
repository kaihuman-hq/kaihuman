import {
  addDestination,
  DESTINATION_STATUSES,
  type DestinationStatus,
  emptyDestination,
  parseVacation,
  serializeVacation,
} from '@kaihuman/formats';
import { useState } from 'preact/hooks';
import { MonoHeader } from '../../Atoms/Typography';

interface VacationAddFormProps {
  content: string;
  onChange: (newContent: string) => void;
  onDone?: () => void;
}

const inputClass =
  'bg-[var(--los-bg)] border border-[var(--los-border)] px-3 py-2 text-sm font-mono focus:border-[var(--los-accent)] outline-none transition-colors';
const labelClass = 'text-[10px] text-[var(--los-muted)] uppercase';

export const VacationAddForm = ({ content, onChange, onDone }: VacationAddFormProps) => {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<DestinationStatus>('idea');
  const [price, setPrice] = useState('');
  const [address, setAddress] = useState('');

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if (!name.trim()) return;
    const priceNum = price !== '' && Number.isFinite(Number(price)) ? Number(price) : undefined;
    onChange(
      serializeVacation(
        addDestination(parseVacation(content), {
          ...emptyDestination(),
          name: name.trim(),
          status,
          ...(priceNum !== undefined && priceNum >= 0 && { price: priceNum }),
          ...(address.trim() && { address: address.trim() }),
        }),
      ),
    );
    onDone?.();
  };

  return (
    <div className="w-full text-[var(--los-fg)] p-4">
      <MonoHeader className="text-xl mb-6 text-[var(--los-accent)]">ADD DESTINATION</MonoHeader>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4 max-w-md">
        <div className="flex flex-col gap-1">
          <label for="vacation-name" className={labelClass}>
            Name
          </label>
          <input
            id="vacation-name"
            type="text"
            value={name}
            onInput={(e) => setName(e.currentTarget.value)}
            className={inputClass}
            placeholder="Lisbon, Portugal"
          />
        </div>

        <div className="flex gap-2">
          <div className="flex flex-col gap-1 flex-1">
            <label for="vacation-status" className={labelClass}>
              Status
            </label>
            <select
              id="vacation-status"
              value={status}
              onChange={(e) => setStatus(e.currentTarget.value as DestinationStatus)}
              className={inputClass}
            >
              {DESTINATION_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 flex-1">
            <label for="vacation-price" className={labelClass}>
              Price
            </label>
            <input
              id="vacation-price"
              type="number"
              min="0"
              value={price}
              onInput={(e) => setPrice(e.currentTarget.value)}
              className={inputClass}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <label for="vacation-address" className={labelClass}>
            Address
          </label>
          <input
            id="vacation-address"
            type="text"
            value={address}
            onInput={(e) => setAddress(e.currentTarget.value)}
            className={inputClass}
          />
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={!name.trim()}
            className="bg-[var(--los-accent)] text-black font-bold px-4 py-2 text-xs font-mono hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
          >
            ADD DESTINATION
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
