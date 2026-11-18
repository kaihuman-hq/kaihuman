import {
  DESTINATION_STATUSES,
  type Destination,
  type DestinationStatus,
  deleteDestination,
  isUnreadableVacation,
  moveDestination,
  parseVacation,
  serializeVacation,
  toAmount,
  type VacationDoc,
} from '@kaihuman/formats';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CustomFieldsEditor, LabeledInput } from './TravelEditForm';

interface VacationEditFormProps {
  content: string;
  /** Edits this destination; without it the file-level details are edited. */
  destinationId?: string;
  onChange: (newContent: string) => void;
  onDone: () => void;
}

const smallButtonClass =
  'self-start text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]';
const iconButtonClass =
  'p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors disabled:opacity-30';
const selectClass =
  'w-full bg-[var(--los-bg)] border border-[var(--los-border)] px-2 py-1 text-xs font-mono text-[var(--los-fg)]';

const toTravelers = (v: string): number | undefined => {
  const n = Number(v);
  return v !== '' && Number.isInteger(n) && n >= 1 ? n : undefined;
};
const toRating = (v: string): number | undefined => {
  const n = Number(v);
  return v !== '' && Number.isInteger(n) && n >= 1 && n <= 5 ? n : undefined;
};

/** Edits on a local draft; nothing reaches the file until SAVE. */
export const VacationEditForm = ({
  content,
  destinationId,
  onChange,
  onDone,
}: VacationEditFormProps) =>
  destinationId === undefined ? (
    <MetaForm content={content} onChange={onChange} onDone={onDone} />
  ) : (
    <DestinationForm
      content={content}
      destinationId={destinationId}
      onChange={onChange}
      onDone={onDone}
    />
  );

const Actions = ({
  onSave,
  onCancel,
  canSave = true,
  children,
}: {
  canSave?: boolean;
  onSave: () => void;
  onCancel: () => void;
  children?: preact.ComponentChildren;
}) => (
  <div className="flex gap-2 items-center border-t border-[var(--los-border)] pt-4">
    <button
      type="button"
      onClick={onSave}
      disabled={!canSave}
      className="bg-[var(--los-accent)] text-black font-bold px-4 py-2 text-xs font-mono hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      SAVE
    </button>
    <button
      type="button"
      onClick={onCancel}
      className="px-4 py-2 text-xs font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)]"
    >
      CANCEL
    </button>
    {children}
  </div>
);

type Meta = Omit<VacationDoc, 'destinations'>;

const MetaForm = ({
  content,
  onChange,
  onDone,
}: Pick<VacationEditFormProps, 'content' | 'onChange' | 'onDone'>) => {
  const [draft, setDraft] = useState<Meta>(() => {
    const { destinations: _, ...meta } = parseVacation(content);
    return meta;
  });
  const patch = (p: Partial<Meta>) => setDraft({ ...draft, ...p });

  // Re-read content so destination edits made elsewhere survive the save.
  const save = () => {
    onChange(
      serializeVacation({
        ...draft,
        currency: draft.currency || 'EUR',
        destinations: parseVacation(content).destinations,
      }),
    );
    onDone();
  };

  return (
    <div className="w-full max-w-2xl text-[var(--los-fg)] p-4 flex flex-col gap-4">
      <MonoHeader className="text-xl text-[var(--los-accent)]">EDIT DETAILS</MonoHeader>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="Title"
          ariaLabel="Vacation title"
          value={draft.title}
          onValue={(title) => patch({ title })}
        />
        <LabeledInput
          label="Currency"
          ariaLabel="Vacation currency"
          value={draft.currency}
          onValue={(currency) => patch({ currency })}
        />
        <LabeledInput
          label="From"
          ariaLabel="Vacation from"
          type="date"
          value={draft.from ?? ''}
          onValue={(from) => patch({ from: from || undefined })}
        />
        <LabeledInput
          label="To"
          ariaLabel="Vacation to"
          type="date"
          value={draft.to ?? ''}
          onValue={(to) => patch({ to: to || undefined })}
        />
        <LabeledInput
          label="Budget"
          ariaLabel="Vacation budget"
          type="number"
          value={String(draft.budget ?? '')}
          onValue={(v) => patch({ budget: toAmount(v) })}
        />
        <LabeledInput
          label="Travelers"
          ariaLabel="Vacation travelers"
          type="number"
          value={String(draft.travelers ?? '')}
          onValue={(v) => patch({ travelers: toTravelers(v) })}
        />
      </div>
      <LabeledInput
        label="Notes"
        ariaLabel="Vacation notes"
        value={draft.notes ?? ''}
        onValue={(notes) => patch({ notes: notes || undefined })}
      />
      <CustomFieldsEditor
        prefix="Custom field"
        fields={draft.custom}
        onFields={(custom) => patch({ custom })}
      />
      <Actions onSave={save} onCancel={onDone} canSave={!isUnreadableVacation(content)} />
    </div>
  );
};

const DestinationForm = ({
  content,
  destinationId,
  onChange,
  onDone,
}: Required<Pick<VacationEditFormProps, 'destinationId'>> &
  Pick<VacationEditFormProps, 'content' | 'onChange' | 'onDone'>) => {
  const [draft, setDraft] = useState<Destination | undefined>(() =>
    parseVacation(content).destinations.find((d) => d.id === destinationId),
  );

  if (!draft) {
    return (
      <div className="w-full text-[var(--los-fg)] p-4 flex flex-col gap-4">
        <MonoText className="text-[var(--los-muted)]">Destination not found.</MonoText>
        <button type="button" onClick={onDone} className={smallButtonClass}>
          BACK
        </button>
      </div>
    );
  }

  const patch = (p: Partial<Destination>) => setDraft({ ...draft, ...p });
  const save = () => {
    const doc = parseVacation(content);
    onChange(
      serializeVacation({
        ...doc,
        destinations: doc.destinations.map((d) => (d.id === destinationId ? draft : d)),
      }),
    );
    onDone();
  };
  const remove = () => {
    onChange(serializeVacation(deleteDestination(parseVacation(content), destinationId)));
    onDone();
  };
  const move = (delta: number) => {
    onChange(serializeVacation(moveDestination(parseVacation(content), destinationId, delta)));
  };

  return (
    <div className="w-full max-w-2xl text-[var(--los-fg)] p-4 flex flex-col gap-4">
      <MonoHeader className="text-xl text-[var(--los-accent)]">EDIT DESTINATION</MonoHeader>
      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="Name"
          ariaLabel="Destination name"
          value={draft.name}
          onValue={(name) => patch({ name })}
        />
        <label className="flex flex-col gap-0.5 min-w-0">
          <span className="text-[10px] text-[var(--los-muted)] uppercase">Status</span>
          <select
            aria-label="Destination status"
            value={draft.status}
            onChange={(e) => patch({ status: e.currentTarget.value as DestinationStatus })}
            className={selectClass}
          >
            {DESTINATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <LabeledInput
          label="Rating (1-5)"
          ariaLabel="Destination rating"
          type="number"
          value={String(draft.rating ?? '')}
          onValue={(v) => patch({ rating: toRating(v) })}
        />
        <LabeledInput
          label="Price"
          ariaLabel="Destination price"
          type="number"
          value={String(draft.price ?? '')}
          onValue={(v) => patch({ price: toAmount(v) })}
        />
        <LabeledInput
          label="Duration"
          ariaLabel="Destination duration"
          value={draft.duration ?? ''}
          onValue={(v) => patch({ duration: v || undefined })}
        />
        <LabeledInput
          label="Website"
          ariaLabel="Destination website"
          value={draft.website ?? ''}
          onValue={(v) => patch({ website: v || undefined })}
        />
        <LabeledInput
          label="Address"
          ariaLabel="Destination address"
          value={draft.address ?? ''}
          onValue={(v) => patch({ address: v || undefined })}
        />
        <LabeledInput
          label="Maps URL"
          ariaLabel="Destination maps URL"
          value={draft.mapsUrl ?? ''}
          onValue={(v) => patch({ mapsUrl: v || undefined })}
        />
      </div>
      <LabeledInput
        label="Notes"
        ariaLabel="Destination notes"
        value={draft.notes ?? ''}
        onValue={(v) => patch({ notes: v || undefined })}
      />
      <CustomFieldsEditor
        prefix="Custom field"
        fields={draft.custom}
        onFields={(custom) => patch({ custom })}
      />
      <Actions
        onSave={save}
        onCancel={onDone}
        canSave={!!draft.name.trim() && !isUnreadableVacation(content)}
      >
        <button
          type="button"
          aria-label="Move destination up"
          onClick={() => move(-1)}
          className={iconButtonClass}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Move destination down"
          onClick={() => move(1)}
          className={iconButtonClass}
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Delete destination"
          onClick={remove}
          className={cn(
            'ml-auto px-4 py-2 text-xs font-mono text-red-500 hover:opacity-80 inline-flex items-center gap-1',
          )}
        >
          <Trash2 className="w-3 h-3" /> DELETE DESTINATION
        </button>
      </Actions>
    </div>
  );
};
