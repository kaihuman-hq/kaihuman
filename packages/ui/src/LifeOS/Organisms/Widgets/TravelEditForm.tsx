import {
  type CustomField,
  deleteTrip,
  emptyStep,
  parseTravel,
  type StepType,
  serializeTravel,
  type TravelStep,
  type Trip,
} from '@kaihuman/formats';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-preact';
import { useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { STEP_FIELDS, STEP_ICON, STEP_LABEL, STEP_TYPES } from './TravelMeta';

interface TravelEditFormProps {
  content: string;
  tripId: string;
  onChange: (newContent: string) => void;
  onDone: () => void;
}

const inputClass =
  'w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50';
const fieldLabelClass = 'text-[10px] text-[var(--los-muted)] uppercase';
const iconButtonClass =
  'p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors disabled:opacity-30';
const smallButtonClass =
  'self-start text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]';

// Empty or non-numeric text must not become NaN, which JSON stores as null.
const toCost = (v: string): number => (v !== '' && Number.isFinite(Number(v)) ? Number(v) : 0);

/** Edits one trip on a local draft; nothing reaches the file until SAVE. */
export const TravelEditForm = ({ content, tripId, onChange, onDone }: TravelEditFormProps) => {
  const [draft, setDraft] = useState<Trip | undefined>(() =>
    parseTravel(content).trips.find((t) => t.id === tripId),
  );
  const [newType, setNewType] = useState<StepType>('flight');

  if (!draft) {
    return (
      <div className="w-full text-[var(--los-fg)] p-4 flex flex-col gap-4">
        <MonoText className="text-[var(--los-muted)]">Trip not found.</MonoText>
        <button type="button" onClick={onDone} className={smallButtonClass}>
          BACK
        </button>
      </div>
    );
  }

  const patch = (p: Partial<Trip>) => setDraft({ ...draft, ...p });
  const patchStep = (stepId: string, p: Partial<TravelStep>) =>
    patch({
      steps: draft.steps.map((s) => (s.id === stepId ? ({ ...s, ...p } as TravelStep) : s)),
    });
  const moveStep = (index: number, dir: -1 | 1) => {
    const steps = [...draft.steps];
    const j = index + dir;
    [steps[index], steps[j]] = [steps[j] as TravelStep, steps[index] as TravelStep];
    patch({ steps });
  };

  // Re-read content so edits made elsewhere to other trips survive the save.
  const save = () => {
    const doc = parseTravel(content);
    onChange(
      serializeTravel({ ...doc, trips: doc.trips.map((t) => (t.id === tripId ? draft : t)) }),
    );
    onDone();
  };
  const remove = () => {
    onChange(serializeTravel(deleteTrip(parseTravel(content), tripId)));
    onDone();
  };

  return (
    <div className="w-full max-w-2xl text-[var(--los-fg)] p-4 flex flex-col gap-4">
      <MonoHeader className="text-xl text-[var(--los-accent)]">EDIT TRIP</MonoHeader>

      <div className="grid grid-cols-2 gap-2">
        <LabeledInput
          label="Title"
          ariaLabel="Trip title"
          value={draft.title}
          onValue={(title) => patch({ title })}
        />
        <LabeledInput
          label="Destination"
          ariaLabel="Trip destination"
          value={draft.destination ?? ''}
          onValue={(destination) => patch({ destination: destination || undefined })}
        />
        <LabeledInput
          label="Start"
          ariaLabel="Trip start"
          type="date"
          value={draft.start ?? ''}
          onValue={(start) => patch({ start: start || undefined })}
        />
        <LabeledInput
          label="End"
          ariaLabel="Trip end"
          type="date"
          value={draft.end ?? ''}
          onValue={(end) => patch({ end: end || undefined })}
        />
      </div>
      <LabeledInput
        label="Notes"
        ariaLabel="Trip notes"
        value={draft.notes ?? ''}
        onValue={(notes) => patch({ notes: notes || undefined })}
      />
      <CustomFieldsEditor
        prefix="Custom field"
        fields={draft.custom}
        onFields={(custom) => patch({ custom })}
      />

      <div className="flex flex-col gap-2">
        <span className={fieldLabelClass}>Steps</span>
        {draft.steps.map((step, i) => (
          <StepEditor
            key={step.id}
            step={step}
            first={i === 0}
            last={i === draft.steps.length - 1}
            onPatch={(p) => patchStep(step.id, p)}
            onMove={(dir) => moveStep(i, dir)}
            onDelete={() => patch({ steps: draft.steps.filter((s) => s.id !== step.id) })}
          />
        ))}
        <div className="flex gap-2 items-center">
          <select
            aria-label="Step type"
            value={newType}
            onChange={(e) => setNewType(e.currentTarget.value as StepType)}
            className={cn(inputClass, 'w-auto bg-[var(--los-bg)]')}
          >
            {STEP_TYPES.map((t) => (
              <option key={t} value={t}>
                {STEP_LABEL[t]}
              </option>
            ))}
          </select>
          <button
            type="button"
            aria-label="Add step"
            onClick={() => patch({ steps: [...draft.steps, emptyStep(newType)] })}
            className="text-[10px] font-mono px-2 py-1 bg-[var(--los-accent)] text-black hover:opacity-90"
          >
            ADD STEP
          </button>
        </div>
      </div>

      <div className="flex gap-2 items-center border-t border-[var(--los-border)] pt-4">
        <button
          type="button"
          onClick={save}
          className="bg-[var(--los-accent)] text-black font-bold px-4 py-2 text-xs font-mono hover:opacity-90"
        >
          SAVE
        </button>
        <button
          type="button"
          onClick={onDone}
          className="px-4 py-2 text-xs font-mono text-[var(--los-muted)] hover:text-[var(--los-fg)]"
        >
          CANCEL
        </button>
        <button
          type="button"
          aria-label="Delete trip"
          onClick={remove}
          className="ml-auto px-4 py-2 text-xs font-mono text-red-500 hover:opacity-80 inline-flex items-center gap-1"
        >
          <Trash2 className="w-3 h-3" /> DELETE TRIP
        </button>
      </div>
    </div>
  );
};

const LabeledInput = ({
  label,
  ariaLabel,
  value,
  type = 'text',
  onValue,
}: {
  label: string;
  ariaLabel: string;
  value: string;
  type?: string;
  onValue: (v: string) => void;
}) => (
  <label className="flex flex-col gap-0.5 min-w-0">
    <span className={fieldLabelClass}>{label}</span>
    <input
      type={type}
      aria-label={ariaLabel}
      // Number inputs stay uncontrolled: re-rendering "0" over a cleared field or
      // a half-typed "12." makes decimals impossible to enter.
      {...(type === 'number' ? { defaultValue: value } : { value })}
      onInput={(e) => onValue(e.currentTarget.value)}
      className={inputClass}
    />
  </label>
);

const CustomFieldsEditor = ({
  prefix,
  fields,
  onFields,
}: {
  prefix: string;
  fields: CustomField[];
  onFields: (fields: CustomField[]) => void;
}) => (
  <div className="flex flex-col gap-1.5">
    <span className={fieldLabelClass}>Custom fields</span>
    {fields.map((c, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: custom fields have no id, order is the identity
      <div key={i} className="flex gap-1.5 items-center">
        <input
          type="text"
          aria-label={`${prefix} key`}
          value={c.key}
          placeholder="Key"
          onInput={(e) => {
            const key = e.currentTarget.value;
            onFields(fields.map((f, j) => (j === i ? { ...f, key } : f)));
          }}
          className={inputClass}
        />
        <input
          type="text"
          aria-label={`${prefix} value`}
          value={c.value}
          placeholder="Value"
          onInput={(e) => {
            const value = e.currentTarget.value;
            onFields(fields.map((f, j) => (j === i ? { ...f, value } : f)));
          }}
          className={inputClass}
        />
        <button
          type="button"
          aria-label={`Remove ${prefix.toLowerCase()}`}
          onClick={() => onFields(fields.filter((_, j) => j !== i))}
          className={cn(iconButtonClass, 'hover:text-red-500')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    ))}
    <button
      type="button"
      aria-label={`Add ${prefix.toLowerCase()}`}
      onClick={() => onFields([...fields, { key: '', value: '' }])}
      className={smallButtonClass}
    >
      <Plus className="w-3 h-3 inline" /> FIELD
    </button>
  </div>
);

const StepEditor = ({
  step,
  first,
  last,
  onPatch,
  onMove,
  onDelete,
}: {
  step: TravelStep;
  first: boolean;
  last: boolean;
  onPatch: (patch: Partial<TravelStep>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}) => {
  const Icon = STEP_ICON[step.type];
  const values = step as unknown as Record<string, string | number | undefined>;
  const set = (key: string, value: string | number | CustomField[] | undefined) =>
    onPatch({ [key]: value } as Partial<TravelStep>);

  return (
    <div className="border border-[var(--los-border)] p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--los-accent)]" />
        <MonoText className="text-xs font-bold flex-1">{STEP_LABEL[step.type]}</MonoText>
        <button
          type="button"
          aria-label="Move step up"
          disabled={first}
          onClick={() => onMove(-1)}
          className={iconButtonClass}
        >
          <ArrowUp className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Move step down"
          disabled={last}
          onClick={() => onMove(1)}
          className={iconButtonClass}
        >
          <ArrowDown className="w-4 h-4" />
        </button>
        <button
          type="button"
          aria-label="Delete step"
          onClick={onDelete}
          className={cn(iconButtonClass, 'hover:text-red-500')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STEP_FIELDS[step.type].map((f) => (
          <LabeledInput
            key={f.key}
            label={f.label}
            ariaLabel={`Step ${f.label}`}
            type={f.type}
            value={String(values[f.key] ?? '')}
            onValue={(v) => set(f.key, v)}
          />
        ))}
        <LabeledInput
          label="Address"
          ariaLabel="Step address"
          value={step.address ?? ''}
          onValue={(v) => set('address', v || undefined)}
        />
        <LabeledInput
          label="Maps URL"
          ariaLabel="Step maps URL"
          value={step.mapsUrl ?? ''}
          onValue={(v) => set('mapsUrl', v || undefined)}
        />
        <LabeledInput
          label="Website"
          ariaLabel="Step website"
          value={step.website ?? ''}
          onValue={(v) => set('website', v || undefined)}
        />
        {'cost' in step && (
          <LabeledInput
            label="Cost"
            ariaLabel="Step cost"
            type="number"
            value={String(step.cost)}
            onValue={(v) => set('cost', toCost(v))}
          />
        )}
      </div>
      <CustomFieldsEditor
        prefix="Step custom field"
        fields={step.custom}
        onFields={(custom) => set('custom', custom)}
      />
    </div>
  );
};
