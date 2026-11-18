import {
  DESTINATION_STATUSES,
  type Destination,
  type DestinationStatus,
  destinationMapsLink,
  filterDestinations,
  parseVacation,
  sortDestinations,
  type VacationDoc,
} from '@kaihuman/formats';
import { ExternalLink, MapPin, Pencil, Umbrella } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoText } from '../../Atoms/Typography';
import { CompactList, CompactWidgetLayout } from './CompactWidgetLayout';
import { money } from './TravelMeta';
import { CustomList, Detail, linkClass, safeHref } from './TravelWidget';

export interface VacationWidgetProps {
  content: string;
  mode?: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  /** Opens the destination editor; editing never happens in the widget itself. */
  onEditDestination?: (destinationId: string) => void;
  /** Opens the editor for the file-level details (title, window, budget...). */
  onEditMeta?: () => void;
}

type SortBy = 'manual' | 'price' | 'rating' | 'name';

const selectClass =
  'bg-[var(--los-bg)] border border-[var(--los-border)] text-[10px] font-mono px-1 py-0.5 text-[var(--los-fg)]';

const windowText = (doc: VacationDoc): string =>
  [doc.from, doc.to].filter(Boolean).join(' → ') || 'any time';

const metaText = (doc: VacationDoc): string =>
  [
    windowText(doc),
    doc.budget !== undefined ? `budget ${money(doc.budget, doc.currency)}` : '',
    doc.travelers !== undefined ? `${doc.travelers} traveler${doc.travelers === 1 ? '' : 's'}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

const count = (n: number): string => `${n} ${n === 1 ? 'destination' : 'destinations'}`;

export const VacationWidget = ({
  content,
  mode = 'SMALL',
  className,
  onEditDestination,
  onEditMeta,
}: VacationWidgetProps) => {
  const doc = useMemo(() => parseVacation(content), [content]);
  const [status, setStatus] = useState<DestinationStatus | ''>('');
  const [sortBy, setSortBy] = useState<SortBy>('manual');

  if (mode === 'SMALL' || mode === 'MOBILE_COLLAPSED') {
    return <Overview doc={doc} className={className} />;
  }

  const filtered = filterDestinations(doc.destinations, status || undefined);
  const shown = sortBy === 'manual' ? filtered : sortDestinations(filtered, sortBy);

  const body =
    doc.destinations.length === 0 ? (
      <MonoText className="text-[var(--los-muted)] p-2">
        No Destinations Yet. Use ADD DESTINATION to create one.
      </MonoText>
    ) : shown.length === 0 ? (
      <MonoText className="text-[var(--los-muted)] p-2">
        No destinations match this filter.
      </MonoText>
    ) : (
      <div className="divide-y divide-[var(--los-border)]">
        {shown.map((d) => (
          <DestinationView key={d.id} dest={d} currency={doc.currency} onEdit={onEditDestination} />
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
      <div className="border-b border-[var(--los-border)] p-2 flex flex-col gap-1 bg-[var(--los-bg)]">
        <div className="flex justify-between items-center gap-2">
          <MonoHeader className="text-xs text-[var(--los-muted)] truncate">
            {(doc.title || 'VACATION').toUpperCase()}
          </MonoHeader>
          <div className="flex items-center gap-2">
            <MonoText className="text-[10px] text-[var(--los-accent)]">
              {count(doc.destinations.length)}
            </MonoText>
            {onEditMeta && (
              <button
                type="button"
                aria-label="Edit details"
                onClick={onEditMeta}
                className="text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)] inline-flex items-center gap-1"
              >
                <Pencil className="w-3 h-3" /> DETAILS
              </button>
            )}
          </div>
        </div>
        <MonoText className="text-[10px] text-[var(--los-muted)]">{metaText(doc)}</MonoText>
        {doc.notes && <MonoText className="text-xs text-[var(--los-fg)]">{doc.notes}</MonoText>}
        <div className="grid grid-cols-2 gap-2">
          <CustomList fields={doc.custom} />
        </div>
        <div className="flex gap-2">
          <select
            aria-label="Filter by status"
            value={status}
            onChange={(e) => setStatus(e.currentTarget.value as DestinationStatus | '')}
            className={selectClass}
          >
            <option value="">all statuses</option>
            {DESTINATION_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <select
            aria-label="Sort by"
            value={sortBy}
            onChange={(e) => setSortBy(e.currentTarget.value as SortBy)}
            className={selectClass}
          >
            <option value="manual">manual order</option>
            <option value="price">price (low first)</option>
            <option value="rating">rating (high first)</option>
            <option value="name">name</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">{body}</div>
    </div>
  );
};

const Overview = ({ doc, className }: { doc: VacationDoc; className?: string }) => {
  if (doc.destinations.length === 0) {
    return (
      <div
        className={cn(
          'flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]',
          className,
        )}
      >
        <Umbrella size={24} className="mb-2 opacity-50" />
        <MonoText>No Destinations Yet</MonoText>
      </div>
    );
  }
  const shortlist = doc.destinations.filter((d) => d.status === 'shortlist').length;
  return (
    <div className={cn('flex flex-col h-full w-full justify-between p-3', className)}>
      <div className="min-w-0">
        <MonoHeader className="text-lg font-bold text-[var(--los-fg)] truncate">
          {doc.title || 'Vacation'}
        </MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)] block">{windowText(doc)}</MonoText>
        <MonoText className="text-sm text-[var(--los-accent)] block mt-1">
          {shortlist} shortlisted
        </MonoText>
      </div>
      <MonoText className="text-[10px] text-[var(--los-muted)] uppercase tracking-widest">
        {count(doc.destinations.length)}
      </MonoText>
    </div>
  );
};

const DestinationView = ({
  dest,
  currency,
  onEdit,
}: {
  dest: Destination;
  currency: string;
  onEdit?: (id: string) => void;
}) => {
  const maps = safeHref(destinationMapsLink(dest));
  const website = safeHref(dest.website);
  return (
    <div className={cn('py-2 px-2 flex flex-col gap-2', dest.status === 'dropped' && 'opacity-60')}>
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <MonoText className="font-bold text-[var(--los-fg)] block truncate">{dest.name}</MonoText>
          <MonoText className="text-[10px] text-[var(--los-muted)] block">
            {dest.status}
            {dest.rating !== undefined && ` · ${'★'.repeat(dest.rating)}`}
            {dest.price !== undefined && ` · ${money(dest.price, currency)}`}
            {dest.duration && ` · ${dest.duration}`}
          </MonoText>
        </div>
        {onEdit && (
          <button
            type="button"
            aria-label="Edit destination"
            onClick={() => onEdit(dest.id)}
            className="text-[10px] font-mono px-2 py-0.5 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)] inline-flex items-center gap-1"
          >
            <Pencil className="w-3 h-3" /> EDIT
          </button>
        )}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Detail label="Address" value={dest.address} />
        <Detail label="Notes" value={dest.notes} />
        <CustomList fields={dest.custom} />
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
