/**
 * The start page's view of the repo's own data — what is coming up, what is in progress, the
 * trackers, the read-later queue and the world clocks. Everything here is drawn from the summary
 * the worker builds out of its hourly cache, so a new tab costs no GitHub request.
 */
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { EVENTS_HORIZON_DAYS, HABIT_WEEK_DAYS, type TodaySummary } from '../background/today';

const linkButton = 'text-left hover:text-nt-accent truncate';

/** The heading every section shares, with an optional note on the right. */
export function SectionHead(props: { title: string; meta?: ComponentChildren }) {
  return (
    <div class="flex items-baseline justify-between gap-4">
      <h2 class="text-[12px] tracking-[1.5px] uppercase text-nt-muted">{props.title}</h2>
      {props.meta && <span class="text-[11px] text-nt-faint">{props.meta}</span>}
    </div>
  );
}

const pad = (value: number) => String(value).padStart(2, '0');

const secondsSince = (since: string, now: Date) => {
  const [h = 0, m = 0] = since.split(':').map(Number);
  const nowSeconds = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  return Math.max(0, nowSeconds - (h * 3600 + m * 60));
};

/** `2h 05m`, with the seconds while the timer runs so it is seen to tick. */
const formatWorked = (seconds: number, running: boolean) =>
  `${Math.floor(seconds / 3600)}h ${pad(Math.floor((seconds % 3600) / 60))}m${
    running ? ` ${pad(seconds % 60)}s` : ''
  }`;

const whenLabel = (daysUntil: number) =>
  daysUntil === 0 ? 'today' : daysUntil === 1 ? 'tomorrow' : `in ${daysUntil} days`;

/** The ISO 8601 week: weeks start on Monday, and week 1 holds the year's first Thursday. */
export function isoWeek(date: Date): number {
  const day = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // The Thursday of the same week decides which year the week belongs to.
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const yearStart = Date.UTC(day.getUTCFullYear(), 0, 1);
  return Math.ceil(((day.getTime() - yearStart) / 86_400_000 + 1) / 7);
}

/** `Wed 30 Sept · W40` — assembled from parts, since browsers disagree on a comma after the day. */
export const dateLine = (now: Date) => {
  const part = (options: Intl.DateTimeFormatOptions) => now.toLocaleDateString('en-GB', options);
  return `${part({ weekday: 'short' })} ${part({ day: 'numeric' })} ${part({ month: 'short' })} · W${isoWeek(now)}`;
};

/** "just now", "12m ago", "3h ago" — how old the page's data is, at a glance. */
function syncedLabel(syncedAt: number | null, now: number): string {
  if (syncedAt === null) return 'not synced yet';
  const minutes = Math.floor((now - syncedAt) / 60_000);
  if (minutes < 1) return 'synced just now';
  if (minutes < 60) return `synced ${minutes}m ago`;
  return `synced ${Math.floor(minutes / 60)}h ago`;
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
    <span class="flex items-baseline gap-1.5 text-[11px] text-nt-faint">
      {error ? (
        <span class="text-nt-prod" title={error}>
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
        class="underline text-nt-muted hover:text-nt-accent disabled:opacity-50"
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
    <ul aria-label="World clocks" class="flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
      {clocks.map((clock) => (
        <li key={`${clock.zone}:${clock.label}`} title={clock.zone} class="flex gap-2">
          <span class="text-nt-muted">{clock.label}</span>{' '}
          <span class="tabular-nums">{timeIn(clock.zone, now)}</span>
        </li>
      ))}
    </ul>
  );
}

/** What is in progress, what is overdue, and today's working time. */
export function Doing(props: {
  today: TodaySummary;
  now: Date;
  /** The path being committed, so its button waits; one write at a time keeps shas in order. */
  busyPath: string | null;
  onOpenFile: (path: string) => void;
  onToggleTimer: (path: string) => void;
}) {
  const { today, now, busyPath, onOpenFile } = props;
  const { inProgress, overdue, inbox, timers } = today;
  const tasks = overdue.length > 0 || inProgress.length > 0;
  if (!tasks && timers.length === 0 && inbox.count === 0) return null;

  return (
    <section class="border border-nt-control p-4 flex flex-col gap-[14px]">
      <SectionHead
        title="Doing"
        meta={
          inbox.count > 0 && (
            <button
              type="button"
              class="hover:text-nt-accent"
              onClick={() => onOpenFile(inbox.path)}
              title={inbox.path}
            >
              {inbox.count} in the inbox
            </button>
          )
        }
      />
      {tasks && (
        <ul class="flex flex-col gap-2 text-[16px]">
          {overdue.map((todo) => (
            <li key={`overdue:${todo.path}:${todo.text}`} class="flex min-w-0">
              <button
                type="button"
                class={linkButton}
                onClick={() => onOpenFile(todo.path)}
                title={`${todo.milestone} is overdue — ${todo.path}`}
              >
                <span class="text-nt-prod">!</span> {todo.text}
              </button>
            </li>
          ))}
          {inProgress.map((todo) => (
            <li key={`doing:${todo.path}:${todo.text}`} class="flex min-w-0">
              <button
                type="button"
                class={linkButton}
                onClick={() => onOpenFile(todo.path)}
                title={todo.path}
              >
                <span class="text-nt-accent">&gt;</span> {todo.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {timers.map((timer) => {
        const seconds =
          timer.closedMinutes * 60 +
          (timer.running && timer.runningSince ? secondsSince(timer.runningSince, now) : 0);
        return (
          <div
            key={timer.path}
            class="flex items-center justify-between gap-3 border-t border-nt-divider pt-3"
          >
            <div class="flex flex-col gap-0.5 min-w-0">
              <span class="text-[11px] text-nt-muted truncate">{timer.name} today</span>
              <span class={`text-[20px] tabular-nums ${timer.running ? 'text-nt-accent' : ''}`}>
                {busyPath === timer.path ? 'Saving…' : formatWorked(seconds, timer.running)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => props.onToggleTimer(timer.path)}
              disabled={busyPath !== null}
              aria-pressed={timer.running}
              title={timer.running ? `Clock out of ${timer.name}` : `Clock in to ${timer.name}`}
              class="shrink-0 border border-nt-control px-3 py-1.5 text-[12px] hover:border-nt-accent hover:text-nt-accent disabled:opacity-50"
            >
              {timer.running ? '■ stop' : '▶ start'}
            </button>
          </div>
        );
      })}
    </section>
  );
}

export function ComingUp(props: { today: TodaySummary; onOpenFile: (path: string) => void }) {
  const { events, milestone } = props.today;
  const { onOpenFile } = props;
  const when = 'shrink-0 w-[72px] text-[12px] text-nt-muted pt-0.5';
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead title="Coming up" />
      {events.length === 0 && !milestone ? (
        <p class="text-[13px] text-nt-faint">Nothing in the next {EVENTS_HORIZON_DAYS} days.</p>
      ) : (
        <ul class="flex flex-col gap-[10px] text-[14px]">
          {events.map((event) => (
            <li key={`${event.path}:${event.name}:${event.date}`} class="flex gap-[14px] min-w-0">
              <span class={when}>{whenLabel(event.daysUntil)}</span>
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
            <li class="flex gap-[14px] min-w-0">
              <span class={when}>{whenLabel(milestone.daysUntil)}</span>
              <button
                type="button"
                class={linkButton}
                onClick={() => onOpenFile(milestone.path)}
                title={`Milestone due ${milestone.dueDate}`}
              >
                ◆ {milestone.name}
                <span class="text-[12px] text-nt-muted"> · {milestone.open} open</span>
              </button>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

export function Trackers(props: {
  today: TodaySummary;
  busyPath: string | null;
  onCheckIn: (path: string) => void;
}) {
  const { habits } = props.today;
  const { busyPath } = props;
  if (habits.length === 0) return null;
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead title="Trackers" />
      <ul aria-label="Trackers" class="flex flex-col border-t border-nt-divider">
        {habits.map((habit) => {
          const reached = habit.week.filter(Boolean).length;
          return (
            <li
              key={habit.path}
              class="flex items-center gap-[10px] py-[10px] border-b border-nt-row"
            >
              {/* The console's habit files have no undo, so a tick stays for the day. */}
              <button
                type="button"
                onClick={() => props.onCheckIn(habit.path)}
                disabled={habit.checkedToday || busyPath !== null}
                aria-pressed={habit.checkedToday}
                aria-label={
                  habit.checkedToday
                    ? `${habit.name} is done for today`
                    : `Check in ${habit.name} for today`
                }
                title={habit.checkedToday ? 'Done for today' : 'Mark today'}
                class={`w-[18px] h-[18px] shrink-0 border disabled:cursor-default ${
                  habit.checkedToday
                    ? 'border-nt-accent bg-nt-accent'
                    : 'border-nt-icon hover:border-nt-accent'
                }`}
              />
              <span class="flex-1 min-w-0 text-[13px] truncate" title={habit.name}>
                {habit.name}
              </span>
              {habit.atRisk && (
                <span class="shrink-0 text-[11px] text-nt-prod" title="Check in to keep the streak">
                  at risk
                </span>
              )}
              <span
                role="img"
                aria-label={`${reached} of the last ${HABIT_WEEK_DAYS} days`}
                title={`${reached} of the last ${HABIT_WEEK_DAYS} days`}
                class="flex gap-[3px]"
              >
                {habit.week.map((done, index) => (
                  <span
                    // The strip is positional — the oldest day on the left, today on the right.
                    key={index}
                    class={`w-[6px] h-[12px] ${done ? 'bg-nt-done' : 'bg-nt-missed'}`}
                  />
                ))}
              </span>
              <span class="w-[44px] shrink-0 text-right text-[11px] text-nt-muted tabular-nums">
                {busyPath === habit.path ? '…' : `${habit.streak}d`}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Ideas gone quiet, offered back: a click opens the palette's `>id` search on the title. */
export function Resurface(props: { today: TodaySummary; onOpenIdea: (title: string) => void }) {
  const { resurface } = props.today;
  if (resurface.length === 0) return null;
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead title="Resurface" />
      <ul aria-label="Resurface" class="flex flex-col border-t border-nt-divider">
        {resurface.map((idea) => (
          <li
            key={idea.path}
            class="flex items-center gap-[10px] py-[10px] border-b border-nt-row min-w-0"
          >
            <button
              type="button"
              class={`flex-1 ${linkButton}`}
              onClick={() => props.onOpenIdea(idea.title)}
              title={`${idea.status} since ${idea.lastActivity}`}
            >
              {idea.title}
            </button>
            <span class="shrink-0 text-[11px] text-nt-muted tabular-nums">{idea.lastActivity}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ReadLater(props: {
  today: TodaySummary;
  busyPath: string | null;
  onOpenUrl: (url: string) => void;
  onReadDone: (path: string, id: string) => void;
}) {
  const { readLater, unreadCount } = props.today;
  const { busyPath, onOpenUrl } = props;
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead title="Read later" meta={`${unreadCount} unread`} />
      {readLater.length === 0 ? (
        <p class="text-[13px] text-nt-faint">Nothing saved.</p>
      ) : (
        <ul aria-label="Read later" class="flex flex-col gap-[10px]">
          {readLater.map((item) => (
            <li
              key={item.id}
              class="flex items-center gap-4 border border-nt-control px-[14px] py-3"
            >
              <button
                type="button"
                class="group flex-1 min-w-0 flex flex-col gap-[3px] text-left"
                onClick={() => onOpenUrl(item.url)}
                title={item.url}
              >
                <span class="text-[14px] truncate group-hover:text-nt-accent">{item.name}</span>
                {item.createdAt > 0 && (
                  <span class="text-[11px] text-nt-muted">
                    saved {new Date(item.createdAt).toLocaleDateString('en-US')}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => props.onReadDone(item.path, item.id)}
                disabled={busyPath !== null}
                aria-label={`Mark ${item.name} as read`}
                title="Mark as read"
                class="shrink-0 whitespace-nowrap text-[12px] text-nt-muted hover:text-nt-accent disabled:opacity-50"
              >
                {busyPath === `${item.path}#${item.id}` ? '…' : '✓ read'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** "just now", "12m ago", "3h ago", "2d ago" — how long a braindump has been waiting. */
export function ageLabel(since: number, now: Date): string {
  const minutes = Math.floor((now.getTime() - since) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (minutes < 24 * 60) return `${Math.floor(minutes / 60)}h ago`;
  return `${Math.floor(minutes / (24 * 60))}d ago`;
}

/** The lines after the title, for the collapsed row. */
const preview = (text: string, title: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => index > 0 || !line.includes(title.replace(/…$/, '')))
    .slice(0, 2)
    .join(' · ');

/**
 * Braindumps typed in the desktop's braindump window, waiting to be dealt with. A row opens to the
 * whole text; deleting one is how it is done with (git history keeps it). Delete asks once more
 * before it goes.
 */
export function Braindumps(props: {
  today: TodaySummary;
  now: Date;
  busyPath: string | null;
  onOpenFile: (path: string) => void;
  onDelete: (path: string, sha: string) => void;
}) {
  const { braindumps, braindumpCount } = props.today;
  const { busyPath } = props;
  const [open, setOpen] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  return (
    <section class="flex flex-col gap-[10px]">
      <SectionHead
        title="Braindumps"
        meta={
          braindumpCount > braindumps.length
            ? `${braindumps.length} of ${braindumpCount}`
            : undefined
        }
      />
      {braindumps.length === 0 ? (
        <p class="text-[13px] text-nt-faint">Nothing waiting.</p>
      ) : (
        <ul aria-label="Braindumps" class="flex flex-col gap-[10px]">
          {braindumps.map((dump) => {
            const expanded = open === dump.path;
            const rest = preview(dump.text, dump.title);
            return (
              <li
                key={dump.path}
                class="flex items-start gap-4 border border-nt-control px-[14px] py-3"
              >
                <button
                  type="button"
                  class="group flex-1 min-w-0 flex flex-col gap-[3px] text-left"
                  onClick={() => setOpen(expanded ? null : dump.path)}
                  aria-expanded={expanded}
                >
                  <span class="text-[14px] truncate group-hover:text-nt-accent">{dump.title}</span>
                  {expanded ? (
                    <span class="text-[12px] whitespace-pre-wrap break-words">{dump.text}</span>
                  ) : (
                    rest && <span class="text-[12px] text-nt-muted truncate">{rest}</span>
                  )}
                  <span class="text-[11px] text-nt-faint">
                    {ageLabel(dump.createdAt, props.now)}
                  </span>
                </button>
                <div class="shrink-0 flex flex-col items-end gap-[6px] text-[12px]">
                  <button
                    type="button"
                    onClick={() => props.onOpenFile(dump.path)}
                    title="Open in the console"
                    class="text-nt-muted hover:text-nt-accent"
                  >
                    open
                  </button>
                  <button
                    type="button"
                    disabled={busyPath !== null}
                    onClick={() => {
                      if (confirming !== dump.path) {
                        setConfirming(dump.path);
                        return;
                      }
                      setConfirming(null);
                      props.onDelete(dump.path, dump.sha);
                    }}
                    onBlur={() =>
                      setConfirming((current) => (current === dump.path ? null : current))
                    }
                    aria-label={
                      confirming === dump.path
                        ? `Really delete ${dump.title}`
                        : `Delete ${dump.title}`
                    }
                    class={`disabled:opacity-50 ${
                      confirming === dump.path
                        ? 'text-nt-prod'
                        : 'text-nt-muted hover:text-nt-accent'
                    }`}
                  >
                    {busyPath === dump.path ? '…' : confirming === dump.path ? 'delete?' : 'delete'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
