import { matchesWidgetFilter } from '@kaihuman/core';
import { localDate, parseActionLog } from '@kaihuman/formats';
import {
  type ActionLogView,
  addBookmarkEntry,
  addReadLaterUrl,
  type BoardOverviewView,
  type BookmarksView,
  cityOf,
  type EventRow,
  eventDateParts,
  logAction,
  type ReadLaterView,
  type RssView,
  type TemplatesView,
  type TodosView,
  type TravelView,
  type WorldClock,
} from '../../../components/widgets/tile-controllers.js';
import { tileTitle } from './name.js';
import type { Glance, GlanceInput } from './types.js';

const WEEK_MS = 7 * 86_400_000;

/** Days-away hero: "Today" has no unit, one day is singular. */
const daysHero = (days: number): Pick<Glance, 'hero' | 'unit'> =>
  days <= 0 ? { hero: 'Today' } : { hero: String(days), unit: days === 1 ? 'day' : 'days' };

/** `href` of the tile screen's add sheet. */
/** Opens the tile's detail with its add form already showing. */
export const addHref = (path: string): string =>
  `/dashboard/tile?path=${encodeURIComponent(path)}&add=1`;

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};

export function todosGlance({ path, now, filter }: GlanceInput, view: TodosView): Glance {
  const rows = view.rows.filter((r) =>
    matchesWidgetFilter(
      { tags: r.tags, filePath: path, milestoneId: r.milestoneId, milestoneName: r.milestone },
      filter,
    ),
  );
  const today = localDate(now);
  let open = 0;
  let doing = 0;
  let overdue = 0;
  let done = 0;
  for (const row of rows) {
    if (row.status === 'done') done++;
    else if (row.status !== 'backlog' && row.status !== 'in-progress') continue;
    else if (row.dueDate && row.dueDate < today) overdue++;
    else if (row.status === 'in-progress') doing++;
    else open++;
  }
  const isOverdue = (r: (typeof rows)[number]): boolean =>
    (r.status === 'backlog' || r.status === 'in-progress') && !!r.dueDate && r.dueDate < today;
  return {
    title: tileTitle(path, 'Todos'),
    icon: 'todo',
    tint: 'olive',
    hero: '',
    counts: [
      { value: rows.filter((r) => r.status === 'backlog').length, label: 'open', tone: 'label' },
      {
        value: rows.filter((r) => r.status === 'in-progress').length,
        label: 'doing',
        tone: 'info',
      },
      { value: rows.filter(isOverdue).length, label: 'overdue', tone: 'warning' },
    ],
    label: '',
    // Segments are exclusive (an overdue todo is not also counted as open) so shares add up.
    viz: {
      kind: 'segments',
      parts: [
        { value: open, tone: 'info' },
        { value: doing, tone: 'accent' },
        { value: overdue, tone: 'warning' },
        { value: done, tone: 'muted' },
      ],
    },
    action: {
      kind: 'open',
      icon: 'add',
      label: 'New todo',
      href: `/dashboard/todo-add?path=${encodeURIComponent(path)}`,
    },
  };
}

export function eventsGlance({ path, now }: GlanceInput, view: EventRow[]): Glance {
  const base = { icon: 'calendar', tint: 'red' } as const;
  const action = { kind: 'open', icon: 'add', label: 'Add event', href: addHref(path) } as const;
  const next = view[0];
  if (!next)
    return { ...base, title: tileTitle(path, 'Events'), hero: '0', label: 'no upcoming', action };
  const p = eventDateParts(next.date);
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const more = view.slice(1).filter((r) => r.date.startsWith(month)).length;
  return {
    ...base,
    title: tileTitle(path, 'Events'),
    ...daysHero(next.daysUntil),
    label: '',
    viz: {
      kind: 'text',
      title: next.name,
      caption: `${p.weekday} ${p.day} ${p.month}${more > 0 ? ` · +${more} this month` : ''}`,
    },
    action,
  };
}

export function logGlance({ path, content, now }: GlanceInput, view: ActionLogView): Glance {
  const today = localDate(now);
  const entries = parseActionLog(content).entries.filter((e) => e.timestamp.startsWith(today));
  const last = view.entries[0];
  return {
    title: tileTitle(path, 'Log'),
    icon: 'list',
    tint: 'purple',
    hero: String(entries.length),
    label: 'entries today',
    ...(last && {
      viz: { kind: 'text', time: last.timestamp.slice(11, 16), title: last.description } as const,
    }),
    action: {
      kind: 'field',
      icon: 'add',
      label: 'Log entry',
      placeholder: 'What did you do?',
      submit: (c, value, at) => logAction(c, value, at),
    },
  };
}

export function clocksGlance(_input: GlanceInput, view: WorldClock[]): Glance {
  const first = view[0];
  return {
    title: 'Clocks',
    icon: 'globe',
    tint: 'blue',
    hero: first?.time ?? '--:--',
    label: first
      ? `${first.cities[0] ?? cityOf(first.name)} · ${first.date.split(',')[0]}`
      : 'no clocks',
    viz: {
      kind: 'rows',
      rows: view.slice(1, 3).map((c) => ({ left: c.cities[0] ?? cityOf(c.name), right: c.time })),
    },
  };
}

export function readLaterGlance(_input: GlanceInput, view: ReadLaterView): Glance {
  const top = view.unread[0];
  return {
    title: 'Read later',
    icon: 'bookmark',
    tint: 'purple',
    hero: String(view.unread.length),
    // The file carries no reading times, so there is no "~2h" estimate.
    label: 'unread',
    ...(top && { viz: { kind: 'text', title: top.name } as const }),
    action: {
      kind: 'field',
      icon: 'add',
      label: 'Save link',
      placeholder: 'https://',
      keyboard: 'url',
      submit: (c, value, at) => addReadLaterUrl(c, value, at),
    },
  };
}

export function bookmarksGlance({ path, now }: GlanceInput, view: BookmarksView): Glance {
  const list = view.bookmarks;
  const week = list.filter((b) => {
    const t = Date.parse(b.createdAt);
    return !Number.isNaN(t) && now.getTime() - t <= WEEK_MS;
  }).length;
  const labels = list.slice(0, 4).map((b) => (hostOf(b.url).charAt(0) || '?').toUpperCase());
  if (list.length > 4) labels.push(`+${list.length - 4}`);
  return {
    title: tileTitle(path, 'Bookmarks'),
    icon: 'star',
    tint: 'blue',
    hero: String(list.length),
    label: `saved · ${week} this week`,
    ...(labels.length > 0 && { viz: { kind: 'chips', labels } as const }),
    action: {
      kind: 'field',
      icon: 'add',
      label: 'Add bookmark',
      placeholder: 'https://',
      keyboard: 'url',
      submit: (c, value, at) => addBookmarkEntry(c, { url: value }, at),
    },
  };
}

// Template files record no use counts, so the first row stands in for the most used.
const templatesGlance = (
  { path }: GlanceInput,
  view: TemplatesView,
  base: Pick<Glance, 'icon' | 'tint'> & { fallback: string; label: string; mono: boolean },
): Glance => {
  const top = view.rows[0];
  return {
    title: tileTitle(path, base.fallback),
    icon: base.icon,
    tint: base.tint,
    hero: String(view.rows.length),
    label: base.label,
    ...(top && {
      viz: {
        kind: 'copy',
        label: top.title,
        text: top.template,
        ...(base.mono && { mono: true }),
      } as const,
    }),
  };
};

export const promptsGlance = (input: GlanceInput, view: TemplatesView): Glance =>
  templatesGlance(input, view, {
    icon: 'prompt',
    tint: 'purple',
    fallback: 'Prompts',
    label: 'templates',
    mono: false,
  });

export const commandsGlance = (input: GlanceInput, view: TemplatesView): Glance =>
  templatesGlance(input, view, {
    icon: 'terminal',
    tint: 'olive',
    fallback: 'Commands',
    label: 'snippets',
    mono: true,
  });

export function rssGlance(_input: GlanceInput, view: RssView): Glance {
  const newest = view.items.find((i) => i.unread);
  return {
    title: 'Feeds',
    icon: 'rss',
    tint: 'orange',
    hero: String(view.unreadCount),
    label: `unread · ${view.feeds.length} feeds`,
    ...(newest && {
      viz: { kind: 'text', title: newest.title, caption: newest.source } as const,
    }),
  };
}

/** `2026-11-28` -> `28 Nov`. */
const shortDay = (iso: string): string => {
  const p = eventDateParts(iso);
  return `${p.day} ${p.month}`;
};

export function travelGlance({ path }: GlanceInput, view: TravelView): Glance {
  const base = { title: tileTitle(path, 'Travel'), icon: 'travel', tint: 'blue' } as const;
  const action = { kind: 'open', icon: 'add', label: 'Add trip', href: addHref(path) } as const;
  const next = view.next;
  if (!next) return { ...base, hero: String(view.trips.length), label: 'trips', action };
  const trip = view.trips.find((t) => t.name === next.name && t.status === 'upcoming');
  const range = trip?.dateRange.split(' – ').filter((d) => /^\d{4}-/.test(d));
  const parts = [
    range && range.length > 0 ? range.map(shortDay).join(' – ') : undefined,
    trip && `${trip.steps} ${trip.steps === 1 ? 'step' : 'steps'}`,
  ].filter(Boolean);
  return {
    ...base,
    ...daysHero(next.daysUntil),
    label: '',
    viz: {
      kind: 'text',
      title: next.name,
      ...(parts.length > 0 && { caption: parts.join(' · ') }),
    },
    action,
  };
}

/** Column labels short enough for a tile bar. */
const BAR_LABEL: Record<string, string> = {
  backlog: 'Inbox',
  'in-progress': 'Doing',
  done: 'Done',
  rejected: 'Rej.',
};

export function boardGlance(_input: GlanceInput, view: BoardOverviewView): Glance {
  const open = view.columns
    .filter((c) => c.status === 'backlog' || c.status === 'in-progress')
    .reduce((sum, c) => sum + c.count, 0);
  const doing = view.columns.findIndex((c) => c.status === 'in-progress');
  return {
    title: 'Board',
    icon: 'board',
    tint: 'olive',
    hero: String(open),
    label: 'open',
    ...(view.overdueCount > 0 && {
      delta: { text: `${view.overdueCount} overdue`, tone: 'warning' } as const,
    }),
    viz: {
      kind: 'bars',
      values: view.columns.map((c) => c.count),
      labels: view.columns.map((c) => BAR_LABEL[c.status] ?? c.label.slice(0, 5)),
      ...(doing >= 0 && { accent: doing }),
    },
  };
}
