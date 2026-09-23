/**
 * The start page's view of the repo's own data — what is coming up, what is in progress, the
 * trackers, the read-later queue and the world clocks. Everything here is drawn from the summary
 * the worker builds out of its hourly cache, so a new tab costs no GitHub request.
 */
import type { TodaySummary } from '../background/today';

const sectionTitle = 'text-xs uppercase tracking-wider text-[var(--los-muted)]';
const card = 'rounded border border-[var(--los-border)]';
const linkButton = 'text-left hover:text-[var(--los-accent)] transition-colors truncate';

const minutesSince = (since: string, now: Date) => {
  const [h = 0, m = 0] = since.split(':').map(Number);
  return Math.max(0, now.getHours() * 60 + now.getMinutes() - (h * 60 + m));
};

const formatMinutes = (minutes: number) =>
  `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, '0')}m`;

const whenLabel = (daysUntil: number) =>
  daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

/** "just now", "12 min ago", "3 h ago" — how old the page's data is, at a glance. */
function syncedLabel(syncedAt: number | null, now: number): string {
  if (syncedAt === null) return 'not synced yet';
  const minutes = Math.floor((now - syncedAt) / 60_000);
  if (minutes < 1) return 'synced just now';
  if (minutes < 60) return `synced ${minutes} min ago`;
  return `synced ${Math.floor(minutes / 60)} h ago`;
}

const timeIn = (zone: string, now: Date) => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: zone,
    }).format(now);
  } catch {
    // A zone the browser does not know — typed by hand into the file.
    return '--:--';
  }
};

export function SyncStatus(props: {
  syncedAt: number | null;
  pendingOpens: number;
  syncing: boolean;
  error: string | null;
  now: Date;
  onSync: () => void;
}) {
  const { syncedAt, pendingOpens, syncing, error, now, onSync } = props;
  const pending =
    pendingOpens > 0 ? ` · ${pendingOpens} open${pendingOpens === 1 ? '' : 's'} to push` : '';
  return (
    <span class="flex items-baseline gap-2 text-[10px] text-[var(--los-muted)]">
      {error ? (
        <span class="text-red-400" title={error}>
          sync failed
        </span>
      ) : (
        <span title={syncedAt ? new Date(syncedAt).toLocaleString() : undefined}>
          {syncedLabel(syncedAt, now.getTime())}
          {pending}
        </span>
      )}
      <button
        type="button"
        onClick={onSync}
        disabled={syncing}
        class="underline hover:text-[var(--los-accent)] disabled:opacity-50"
        title="Fetch from GitHub and push counted opens now"
      >
        {syncing ? 'syncing…' : 'sync'}
      </button>
    </span>
  );
}

export function Clocks({ clocks, now }: { clocks: TodaySummary['clocks']; now: Date }) {
  if (clocks.length === 0) return null;
  return (
    <ul aria-label="World clocks" class="flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {clocks.map((clock) => (
        <li key={`${clock.zone}:${clock.label}`} title={clock.zone}>
          <span class="text-[var(--los-muted)]">{clock.label}</span>{' '}
          <span class="tabular-nums">{timeIn(clock.zone, now)}</span>
        </li>
      ))}
    </ul>
  );
}

export function TodaySection(props: {
  today: TodaySummary;
  now: Date;
  /** The path being committed, so its button waits; one write at a time keeps shas in order. */
  busyPath: string | null;
  onOpenFile: (path: string) => void;
  onOpenUrl: (url: string) => void;
  onCheckIn: (path: string) => void;
  onToggleTimer: (path: string) => void;
  onReadDone: (path: string, id: string) => void;
}) {
  const { today, now, busyPath, onOpenFile, onOpenUrl } = props;
  const { events, milestone, inProgress, overdue, inbox, habits, timers, readLater } = today;
  const comingUp = events.length > 0 || milestone;
  const doing = inProgress.length > 0 || overdue.length > 0 || inbox.count > 0;
  const trackers = habits.length > 0 || timers.length > 0;

  return (
    <>
      {(comingUp || doing) && (
        <section aria-label="Today" class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {comingUp && (
            <div class={`${card} p-3 flex flex-col gap-2`}>
              <h2 class={sectionTitle}>Coming up</h2>
              <ul class="flex flex-col gap-1 text-sm">
                {events.map((event) => (
                  <li key={`${event.path}:${event.name}:${event.date}`} class="flex gap-2">
                    <span class="shrink-0 w-20 text-xs text-[var(--los-muted)] pt-0.5">
                      {whenLabel(event.daysUntil)}
                    </span>
                    <button
                      type="button"
                      class={linkButton}
                      onClick={() => onOpenFile(event.path)}
                      title={`${event.name} — ${event.date}`}
                    >
                      {event.type === 'birthday' ? `${event.name}'s birthday` : event.name}
                    </button>
                  </li>
                ))}
                {milestone && (
                  <li class="flex gap-2">
                    <span class="shrink-0 w-20 text-xs text-[var(--los-muted)] pt-0.5">
                      {whenLabel(milestone.daysUntil)}
                    </span>
                    <button
                      type="button"
                      class={linkButton}
                      onClick={() => onOpenFile(milestone.path)}
                      title={`Milestone due ${milestone.dueDate}`}
                    >
                      ◆ {milestone.name}
                      <span class="text-xs text-[var(--los-muted)]"> · {milestone.open} open</span>
                    </button>
                  </li>
                )}
              </ul>
            </div>
          )}
          {doing && (
            <div class={`${card} p-3 flex flex-col gap-2`}>
              <div class="flex items-baseline justify-between gap-2">
                <h2 class={sectionTitle}>Doing</h2>
                {inbox.count > 0 && (
                  <button
                    type="button"
                    class="text-[10px] text-[var(--los-muted)] hover:text-[var(--los-accent)]"
                    onClick={() => onOpenFile(inbox.path)}
                    title={inbox.path}
                  >
                    {inbox.count} in the inbox
                  </button>
                )}
              </div>
              <ul class="flex flex-col gap-1 text-sm">
                {overdue.map((todo) => (
                  <li key={`overdue:${todo.path}:${todo.text}`}>
                    <button
                      type="button"
                      class={`${linkButton} w-full text-red-400`}
                      onClick={() => onOpenFile(todo.path)}
                      title={`${todo.milestone} is overdue — ${todo.path}`}
                    >
                      ! {todo.text}
                    </button>
                  </li>
                ))}
                {inProgress.map((todo) => (
                  <li key={`doing:${todo.path}:${todo.text}`}>
                    <button
                      type="button"
                      class={`${linkButton} w-full`}
                      onClick={() => onOpenFile(todo.path)}
                      title={todo.path}
                    >
                      &gt; {todo.text}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {trackers && (
        <section class="flex flex-col gap-3">
          <h2 class={sectionTitle}>Trackers</h2>
          <ul aria-label="Trackers" class="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {habits.map((habit) => (
              <li key={habit.path}>
                <button
                  type="button"
                  onClick={() => props.onCheckIn(habit.path)}
                  disabled={habit.checkedToday || busyPath !== null}
                  aria-pressed={habit.checkedToday}
                  title={habit.checkedToday ? 'Done for today' : `Check in ${habit.name} for today`}
                  class={`w-full flex items-baseline justify-between gap-2 rounded border px-3 py-1.5 text-left hover:border-[var(--los-accent)] transition-colors disabled:cursor-default ${
                    habit.checkedToday ? 'border-[var(--los-accent)]' : 'border-[var(--los-border)]'
                  }`}
                >
                  <span class="text-sm truncate">
                    {habit.checkedToday ? '✓' : '○'} {habit.name}
                  </span>
                  <span class="shrink-0 text-[10px] text-[var(--los-muted)]">
                    {busyPath === habit.path ? 'Saving…' : `${habit.streak}d streak`}
                  </span>
                </button>
              </li>
            ))}
            {timers.map((timer) => {
              const minutes =
                timer.closedMinutes +
                (timer.running && timer.runningSince ? minutesSince(timer.runningSince, now) : 0);
              return (
                <li key={timer.path}>
                  <button
                    type="button"
                    onClick={() => props.onToggleTimer(timer.path)}
                    disabled={busyPath !== null}
                    aria-pressed={timer.running}
                    title={
                      timer.running ? `Clock out of ${timer.name}` : `Clock in to ${timer.name}`
                    }
                    class={`w-full flex items-baseline justify-between gap-2 rounded border px-3 py-1.5 text-left hover:border-[var(--los-accent)] transition-colors disabled:opacity-50 ${
                      timer.running ? 'border-[var(--los-accent)]' : 'border-[var(--los-border)]'
                    }`}
                  >
                    <span class="text-sm truncate">
                      {timer.running ? '■' : '▶'} {timer.name}
                    </span>
                    <span class="shrink-0 text-[10px] text-[var(--los-muted)] tabular-nums">
                      {busyPath === timer.path ? 'Saving…' : formatMinutes(minutes)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {readLater.length > 0 && (
        <section class="flex flex-col gap-3">
          <h2 class={sectionTitle}>Read later</h2>
          <ul aria-label="Read later" class="flex flex-col gap-2">
            {readLater.map((item) => (
              <li key={item.id} class={`${card} flex items-center gap-2 px-3 py-2`}>
                <button
                  type="button"
                  class="flex-1 min-w-0 flex flex-col text-left hover:text-[var(--los-accent)] transition-colors"
                  onClick={() => onOpenUrl(item.url)}
                  title={item.url}
                >
                  <span class="text-sm truncate">{item.name}</span>
                  <span class="text-[10px] text-[var(--los-muted)] truncate">
                    {item.createdAt ? `saved ${new Date(item.createdAt).toLocaleDateString()}` : ''}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => props.onReadDone(item.path, item.id)}
                  disabled={busyPath !== null}
                  aria-label={`Mark ${item.name} as read`}
                  title="Mark as read"
                  class="shrink-0 text-xs text-[var(--los-muted)] hover:text-[var(--los-accent)] disabled:opacity-50"
                >
                  {busyPath === `${item.path}#${item.id}` ? '…' : '✓ read'}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
