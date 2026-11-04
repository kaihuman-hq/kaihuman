import {
  type CustomField,
  mapsLink,
  nextTrip,
  parseTravel,
  sortTrips,
  type TravelDoc,
  type TravelStep,
  type Trip,
  totalCost,
  tripCost,
} from '@kaihuman/formats';
import { ExternalLink, MapPin, Pencil, Plane } from 'lucide-preact';
import { useMemo } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';
import { money, STEP_FIELDS, STEP_ICON, STEP_LABEL } from './TravelMeta';

export interface TravelWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  /** Opens the trip editor; editing never happens in the widget itself. */
  onEditTrip?: (tripId: string) => void;
}

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

export const TravelWidget = ({
  content,
  mode = 'SMALL',
  className,
  onEditTrip,
}: TravelWidgetProps) => {
  const doc = useMemo(() => parseTravel(content), [content]);

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
          <TripView key={trip.id} trip={trip} currency={doc.currency} onEdit={onEditTrip} />
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

const linkClass =
  'inline-flex items-center gap-1 text-[10px] font-mono text-[var(--los-accent)] hover:underline';
const fieldLabelClass = 'text-[10px] text-[var(--los-muted)] uppercase';

// User-typed URLs become links; anything but http(s) (e.g. javascript:) is not linked.
const safeHref = (url?: string): string | undefined =>
  url && /^https?:\/\//i.test(url.trim()) ? url.trim() : undefined;

const Detail = ({ label, value }: { label: string; value?: string }) =>
  value ? (
    <div className="min-w-0">
      <span className={fieldLabelClass}>{label}</span>
      <MonoText className="text-xs text-[var(--los-fg)] block break-words">{value}</MonoText>
    </div>
  ) : null;

const CustomList = ({ fields }: { fields: CustomField[] }) => (
  <>
    {fields.map((c, i) => (
      // biome-ignore lint/suspicious/noArrayIndexKey: custom fields have no id, order is the identity
      <Detail key={i} label={c.key || 'Field'} value={c.value} />
    ))}
  </>
);

const TripView = ({
  trip,
  currency,
  onEdit,
}: {
  trip: Trip;
  currency: string;
  onEdit?: (tripId: string) => void;
}) => (
  <div className="py-2 px-2 flex flex-col gap-2">
    <div className="flex items-center gap-2">
      <div className="min-w-0 flex-1">
        <MonoText className="font-bold text-[var(--los-fg)] block truncate">
          {trip.title || 'Untitled trip'}
        </MonoText>
        <MonoText className="text-[10px] text-[var(--los-muted)] block">
          {dateRange(trip)} · {money(tripCost(trip), currency)}
        </MonoText>
      </div>
      {onEdit && (
        <button
          type="button"
          aria-label="Edit trip"
          onClick={() => onEdit(trip.id)}
          className="text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)] inline-flex items-center gap-1"
        >
          <Pencil className="w-3 h-3" /> EDIT
        </button>
      )}
    </div>
    <div className="grid grid-cols-2 gap-2">
      <Detail label="Destination" value={trip.destination} />
      <Detail label="Notes" value={trip.notes} />
      <CustomList fields={trip.custom} />
    </div>
    {trip.steps.map((step) => (
      <StepView key={step.id} step={step} currency={currency} />
    ))}
  </div>
);

const StepView = ({ step, currency }: { step: TravelStep; currency: string }) => {
  const Icon = STEP_ICON[step.type];
  const values = step as unknown as Record<string, string | number | undefined>;
  const maps = safeHref(mapsLink(step));
  const website = safeHref(step.website);
  return (
    <div className="border border-[var(--los-border)] p-2 flex flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-[var(--los-accent)]" />
        <MonoText className="text-xs font-bold flex-1">{STEP_LABEL[step.type]}</MonoText>
        {'cost' in step && (
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {money(step.cost, currency)}
          </MonoText>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {STEP_FIELDS[step.type].map((f) => (
          <Detail key={f.key} label={f.label} value={String(values[f.key] ?? '')} />
        ))}
        <Detail label="Address" value={step.address} />
        <CustomList fields={step.custom} />
      </div>
      {(website || maps) && (
        <div className="flex gap-3">
          {website && (
            <a href={website} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <ExternalLink className="w-3 h-3" /> Website
            </a>
          )}
          {maps && (
            <a href={maps} target="_blank" rel="noopener noreferrer" className={linkClass}>
              <MapPin className="w-3 h-3" /> Open in Maps
            </a>
          )}
        </div>
      )}
    </div>
  );
};
