import {
  addStep,
  deleteStep,
  deleteTrip,
  emptyStep,
  moveStep,
  nextTrip,
  parseTravel,
  type StepType,
  serializeTravel,
  sortTrips,
  type TravelDoc,
  type TravelStep,
  type Trip,
  totalCost,
  tripCost,
  updateStep,
  updateTrip,
} from '@kaihuman/formats';
import {
  ArrowDown,
  ArrowUp,
  BedDouble,
  Car,
  ChevronDown,
  ChevronRight,
  FileText,
  KeyRound,
  Plane,
  Plus,
  TrainFront,
  Trash2,
} from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';

export interface TravelWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  onChange?: (newContent: string) => void;
}

type Field = { key: string; label: string; type: 'date' | 'text' };

const STEP_LABEL: Record<StepType, string> = {
  general: 'General',
  car: 'Car',
  rental: 'Rental',
  flight: 'Flight',
  train: 'Train',
  hotel: 'Hotel',
};
const STEP_TYPES = Object.keys(STEP_LABEL) as StepType[];
const STEP_ICON = {
  general: FileText,
  car: Car,
  rental: KeyRound,
  flight: Plane,
  train: TrainFront,
  hotel: BedDouble,
} satisfies Record<StepType, unknown>;

const PLACES: Field[] = [
  { key: 'from', label: 'From', type: 'text' },
  { key: 'to', label: 'To', type: 'text' },
];
// start/end hold a date or a datetime; plain text keeps both forms editable.
const WHEN: Field[] = [
  { key: 'start', label: 'Start', type: 'text' },
  { key: 'end', label: 'End', type: 'text' },
];
const STEP_FIELDS: Record<StepType, Field[]> = {
  general: [
    { key: 'title', label: 'Title', type: 'text' },
    { key: 'description', label: 'Description', type: 'text' },
  ],
  car: [
    { key: 'tollStart', label: 'Toll from', type: 'date' },
    { key: 'tollEnd', label: 'Toll until', type: 'date' },
    { key: 'tollRef', label: 'Toll ref', type: 'text' },
  ],
  rental: [...PLACES, ...WHEN, { key: 'ref', label: 'Ref', type: 'text' }],
  flight: [...PLACES, ...WHEN, { key: 'ref', label: 'Ref', type: 'text' }],
  train: [...PLACES, ...WHEN, { key: 'ref', label: 'Ref', type: 'text' }],
  hotel: [
    { key: 'from', label: 'Check-in', type: 'date' },
    { key: 'to', label: 'Check-out', type: 'date' },
    { key: 'ref', label: 'Ref', type: 'text' },
  ],
};

const localIsoDate = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const dayNumber = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y as number, (m as number) - 1, d as number) / 86_400_000;
};

const countdown = (trip: Trip, today: string): string => {
  if (!trip.start) return '';
  if (trip.start <= today) return 'now';
  const days = dayNumber(trip.start) - dayNumber(today);
  return days === 1 ? 'in 1 day' : `in ${days} days`;
};

const dateRange = (trip: Trip): string =>
  [trip.start, trip.end].filter(Boolean).join(' → ') || 'undated';

const money = (amount: number, currency: string): string => `${amount.toFixed(2)} ${currency}`;

const inputClass =
  'w-full bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-xs font-mono text-[var(--los-fg)] focus:outline-none placeholder:text-[var(--los-muted)]/50';
const fieldLabelClass = 'text-[10px] text-[var(--los-muted)] uppercase';
const iconButtonClass =
  'p-1 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors disabled:opacity-30';

export const TravelWidget = ({
  content,
  mode = 'SMALL',
  className,
  onChange,
}: TravelWidgetProps) => {
  const doc = useMemo(() => parseTravel(content), [content]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [newType, setNewType] = useState<StepType>('flight');

  const commit = (next: TravelDoc) => onChange?.(serializeTravel(next));

  if (mode === 'SMALL' || mode === 'MOBILE_COLLAPSED') {
    return <Overview doc={doc} className={className} />;
  }

  const trips = sortTrips(doc.trips);

  const body =
    trips.length === 0 ? (
      <MonoText className="text-[var(--los-muted)] p-2">
        No Trips Yet. Use ADD TRIP to create one.
      </MonoText>
    ) : (
      <div className="divide-y divide-[var(--los-border)]">
        {trips.map((trip) => (
          <TripRow
            key={trip.id}
            doc={doc}
            trip={trip}
            open={openId === trip.id}
            newType={newType}
            onNewType={setNewType}
            onToggle={() => setOpenId(openId === trip.id ? null : trip.id)}
            onCommit={commit}
          />
        ))}
      </div>
    );

  if (mode === 'MOBILE_EXPANDED') {
    return (
      <CompactWidgetLayout className={className}>
        <CompactList>{body}</CompactList>
      </CompactWidgetLayout>
    );
  }

  return (
    <div className={cn('flex flex-col h-full w-full', className)}>
      <div className="border-b border-[var(--los-border)] p-2 flex justify-between items-center bg-[var(--los-bg)]">
        <MonoHeader className="text-xs text-[var(--los-muted)]">TRAVEL</MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-accent)]">
          {doc.trips.length} {doc.trips.length === 1 ? 'trip' : 'trips'} ·{' '}
          {money(totalCost(doc), doc.currency)}
        </MonoText>
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </div>
  );
};

const Overview = ({ doc, className }: { doc: TravelDoc; className?: string }) => {
  if (doc.trips.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]',
          className,
        )}
      >
        <Plane size={24} className="mb-2 opacity-50" />
        <MonoText>No Trips Yet</MonoText>
      </div>
    );
  }

  const today = localIsoDate(new Date());
  const next = nextTrip(doc, today);
  const stepTypes = next ? [...new Set(next.steps.map((s) => s.type))] : [];

  return (
    <div className={cn('flex flex-col h-full w-full justify-between p-3', className)}>
      {next ? (
        <div className="min-w-0">
          <MonoHeader className="text-lg font-bold text-[var(--los-fg)] truncate">
            {next.title}
          </MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)] block">
            {dateRange(next)}
          </MonoText>
          <MonoText className="text-sm text-[var(--los-accent)] block mt-1">
            {countdown(next, today)}
          </MonoText>
          <div className="flex gap-1.5 mt-2 text-[var(--los-muted)]">
            {stepTypes.map((type) => {
              const Icon = STEP_ICON[type];
              return <Icon key={type} className="w-4 h-4" aria-label={STEP_LABEL[type]} />;
            })}
          </div>
        </div>
      ) : (
        <MonoText className="text-[var(--los-muted)]">No upcoming trips</MonoText>
      )}
      <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
        {doc.trips.length} {doc.trips.length === 1 ? 'trip' : 'trips'} ·{' '}
        {money(totalCost(doc), doc.currency)}
      </MonoText>
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
      value={value}
      onInput={(e) => onValue(e.currentTarget.value)}
      className={inputClass}
    />
  </label>
);

const TripRow = ({
  doc,
  trip,
  open,
  newType,
  onNewType,
  onToggle,
  onCommit,
}: {
  doc: TravelDoc;
  trip: Trip;
  open: boolean;
  newType: StepType;
  onNewType: (t: StepType) => void;
  onToggle: () => void;
  onCommit: (next: TravelDoc) => void;
}) => {
  const patchTrip = (patch: Parameters<typeof updateTrip>[2]) =>
    onCommit(updateTrip(doc, trip.id, patch));
  const setCustom = (index: number, patch: Partial<{ key: string; value: string }>) =>
    patchTrip({ custom: trip.custom.map((c, i) => (i === index ? { ...c, ...patch } : c)) });

  return (
    <div className="py-2 px-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label="Toggle trip"
          aria-expanded={open}
          onClick={onToggle}
          className={iconButtonClass}
        >
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <MonoText className="font-bold text-[var(--los-fg)] block truncate">
            {trip.title || 'Untitled trip'}
          </MonoText>
          <MonoText className="text-[10px] text-[var(--los-muted)] block">
            {dateRange(trip)} · {money(tripCost(trip), doc.currency)}
          </MonoText>
        </div>
        <button
          type="button"
          aria-label="Delete trip"
          title="Delete trip"
          onClick={() => onCommit(deleteTrip(doc, trip.id))}
          className={cn(iconButtonClass, 'hover:text-red-500')}
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      {open && (
        <div className="mt-2 ml-6 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-2">
            <LabeledInput
              label="Title"
              ariaLabel="Trip title"
              value={trip.title}
              onValue={(title) => patchTrip({ title })}
            />
            <LabeledInput
              label="Destination"
              ariaLabel="Trip destination"
              value={trip.destination ?? ''}
              onValue={(destination) => patchTrip({ destination })}
            />
            <LabeledInput
              label="Start"
              ariaLabel="Trip start"
              type="date"
              value={trip.start ?? ''}
              onValue={(start) => patchTrip({ start: start || undefined })}
            />
            <LabeledInput
              label="End"
              ariaLabel="Trip end"
              type="date"
              value={trip.end ?? ''}
              onValue={(end) => patchTrip({ end: end || undefined })}
            />
          </div>
          <LabeledInput
            label="Notes"
            ariaLabel="Trip notes"
            value={trip.notes ?? ''}
            onValue={(notes) => patchTrip({ notes })}
          />

          <div className="flex flex-col gap-1.5">
            <span className={fieldLabelClass}>Custom fields</span>
            {trip.custom.map((c, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: custom fields have no id, order is the identity
              <div key={i} className="flex gap-1.5 items-center">
                <input
                  type="text"
                  aria-label="Custom field key"
                  value={c.key}
                  placeholder="Key"
                  onInput={(e) => setCustom(i, { key: e.currentTarget.value })}
                  className={inputClass}
                />
                <input
                  type="text"
                  aria-label="Custom field value"
                  value={c.value}
                  placeholder="Value"
                  onInput={(e) => setCustom(i, { value: e.currentTarget.value })}
                  className={inputClass}
                />
                <button
                  type="button"
                  aria-label="Remove custom field"
                  onClick={() => patchTrip({ custom: trip.custom.filter((_, j) => j !== i) })}
                  className={cn(iconButtonClass, 'hover:text-red-500')}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button
              type="button"
              aria-label="Add custom field"
              onClick={() => patchTrip({ custom: [...trip.custom, { key: '', value: '' }] })}
              className="self-start text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              <Plus className="w-3 h-3 inline" /> FIELD
            </button>
          </div>

          <div className="flex flex-col gap-2">
            <span className={fieldLabelClass}>Steps</span>
            {trip.steps.map((step, i) => (
              <StepEditor
                key={step.id}
                step={step}
                first={i === 0}
                last={i === trip.steps.length - 1}
                onPatch={(patch) => onCommit(updateStep(doc, trip.id, step.id, patch))}
                onMove={(dir) => onCommit(moveStep(doc, trip.id, step.id, dir))}
                onDelete={() => onCommit(deleteStep(doc, trip.id, step.id))}
              />
            ))}
            <div className="flex gap-2 items-center">
              <select
                aria-label="Step type"
                value={newType}
                onChange={(e) => onNewType(e.currentTarget.value as StepType)}
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
                onClick={() => onCommit(addStep(doc, trip.id, emptyStep(newType)))}
                className="text-[10px] font-mono px-2 py-1 bg-[var(--los-accent)] text-black hover:opacity-90"
              >
                ADD STEP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

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
  const set = (key: string, value: string | number) =>
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
          label="Website"
          ariaLabel="Step website"
          value={step.website ?? ''}
          onValue={(v) => set('website', v)}
        />
        {'cost' in step && (
          <LabeledInput
            label="Cost"
            ariaLabel="Step cost"
            type="number"
            value={String(step.cost)}
            // Empty or non-numeric text must not become NaN, which JSON stores as null.
            onValue={(v) => set('cost', Number.isFinite(Number(v)) && v !== '' ? Number(v) : 0)}
          />
        )}
      </div>
    </div>
  );
};
