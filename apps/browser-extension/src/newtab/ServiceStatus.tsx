import type { ServiceStatus, StatusLevel } from '../background/service-status';

const LIGHT: Record<StatusLevel, string> = {
  operational: 'bg-nt-done ring-nt-done/30',
  degraded: 'bg-nt-int ring-nt-int/30',
  outage: 'bg-nt-prod ring-nt-prod/30',
  maintenance: 'bg-nt-dev ring-nt-dev/30',
  unknown: 'bg-nt-icon ring-nt-icon/30',
};

/** One light per watched service; each opens that service's status page. */
export function ServiceStatusStrip(props: {
  statuses: ServiceStatus[];
  error: string | null;
  onOpen: (url: string) => void;
}) {
  const { statuses, error, onOpen } = props;
  if (error) {
    return (
      <p class="text-[12px] text-nt-prod break-words" title={error}>
        Service status: {error}
      </p>
    );
  }
  if (statuses.length === 0) return null;
  return (
    <ul aria-label="Service status" class="flex flex-wrap items-center gap-x-5 gap-y-2 pl-[3px]">
      {statuses.map((status) => (
        <li key={status.name}>
          <button
            type="button"
            onClick={() => onOpen(status.link)}
            title={`${status.description}${status.stale ? ' (last known — the latest check failed)' : ''}`}
            class="flex items-center gap-3 text-[12px] text-nt-muted hover:text-nt-fg"
          >
            <span
              aria-hidden="true"
              class={`inline-block w-3 h-3 rounded-full ring-[3px] ${LIGHT[status.level]} ${
                status.stale ? 'opacity-50' : ''
              }`}
            />
            {status.name}
            <span class="sr-only">: {status.level}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
