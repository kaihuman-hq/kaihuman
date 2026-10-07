import type { ServiceStatus, StatusLevel } from '../background/service-status';

const LIGHT: Record<StatusLevel, string> = {
  operational: 'bg-nt-done',
  degraded: 'bg-nt-int',
  outage: 'bg-nt-prod',
  maintenance: 'bg-nt-dev',
  unknown: 'bg-nt-icon',
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
    <ul aria-label="Service status" class="flex flex-wrap items-center gap-x-5 gap-y-2">
      {statuses.map((status) => (
        <li key={status.name}>
          <button
            type="button"
            onClick={() => onOpen(status.link)}
            title={`${status.description}${status.stale ? ' (last known — the latest check failed)' : ''}`}
            class="flex items-center gap-2 text-[12px] text-nt-muted hover:text-nt-fg"
          >
            <span
              aria-hidden="true"
              class={`inline-block w-[9px] h-[9px] rounded-full ${LIGHT[status.level]} ${
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
