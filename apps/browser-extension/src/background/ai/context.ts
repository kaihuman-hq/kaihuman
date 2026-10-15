import {
  ideaSlugOf,
  itemRefOf,
  OPEN_IDEA_STATUSES,
  parseIdea,
  parseTodos,
  type StreamsFile,
} from '@kaihuman/formats';
import type { TodayCache, TodaySummary } from '../today.js';
import { buildInbox } from '../work/inbox.js';
import type { PinnedStatus, WorkItemStatus, WorkSnapshot } from '../work/types.js';

/**
 * What the user is working on, boiled down to short lists. The on-device model features (ranking,
 * labels, cards) share it as prompt background; names only, never page or file bodies.
 */
export interface WorkContext {
  streams: {
    name: string;
    repos: string[];
    hosts: string[];
    labels: string[];
    titles: string[];
  }[];
  todos: string[];
  todoTags: string[];
  eventsToday: string[];
  waiting: string[];
  redCi: string[];
  openIdeas: string[];
}

const TITLES_PER_STREAM = 5;
const WAITING_LIMIT = 3;
const TEXT_LIMIT = 2000;
const LINE_LIMIT = 300;

const unique = (values: string[]) => [...new Set(values)];

const isStatus = (status: PinnedStatus | undefined): status is WorkItemStatus =>
  status !== undefined && !('error' in status);

function streamsContext(file: StreamsFile | null): WorkContext['streams'] {
  return (file?.streams ?? []).map((stream) => {
    const open = stream.items.filter((item) => !item.doneAt);
    const repos: string[] = [];
    const hosts: string[] = [];
    for (const item of open) {
      const ref = itemRefOf(item.url);
      if (!ref) continue;
      if (ref.kind === 'link') hosts.push(ref.host);
      else repos.push(`${ref.owner}/${ref.repo}`);
    }
    return {
      name: stream.name,
      repos: unique(repos),
      hosts: unique(hosts),
      labels: unique(open.flatMap((item) => item.labels)),
      titles: open.slice(0, TITLES_PER_STREAM).map((item) => item.title),
    };
  });
}

export function buildWorkContext(input: {
  today: TodaySummary;
  todayCache: TodayCache;
  streams: StreamsFile | null;
  snapshot: WorkSnapshot | undefined;
  /** Keys the user muted by label; they do not wait on anyone, so the model is not told of them. */
  muted?: Set<string>;
}): WorkContext {
  const { today, todayCache, streams, snapshot, muted } = input;
  const todoTags: string[] = [];
  const openIdeas: string[] = [];
  for (const { path, content } of todayCache.files) {
    if (path.toLowerCase().endsWith('.todos.md')) {
      for (const todo of parseTodos(content).items) {
        if (todo.status === 'backlog' || todo.status === 'in-progress') todoTags.push(...todo.tags);
      }
    } else if (ideaSlugOf(path)) {
      const idea = parseIdea(content);
      if (OPEN_IDEA_STATUSES.includes(idea.status)) openIdeas.push(idea.title);
    }
  }

  const redCi: string[] = [];
  if (snapshot) {
    for (const stream of streams?.streams ?? []) {
      for (const item of stream.items) {
        if (item.doneAt) continue;
        const ref = itemRefOf(item.url);
        const status = ref && ref.kind !== 'link' ? snapshot.pinned[ref.key] : undefined;
        if (isStatus(status) && status.ci === 'failure') redCi.push(status.title);
      }
    }
  }

  return {
    streams: streamsContext(streams),
    todos: unique([...today.overdue, ...today.inProgress].map((todo) => todo.text)),
    todoTags: unique(todoTags),
    eventsToday: today.events.filter((event) => event.daysUntil === 0).map((event) => event.name),
    // Inbox rows come urgency-ordered, so the head is the most pressing.
    waiting: snapshot
      ? buildInbox(snapshot, streams, {}, new Date(), muted)
          .waiting.slice(0, WAITING_LIMIT)
          .map((row) => row.title)
      : [],
    redCi: unique(redCi),
    openIdeas: unique(openIdeas),
  };
}

const clip = (text: string, max: number) =>
  text.length > max ? `${text.slice(0, max - 1)}…` : text;

/** A compact prompt block; the on-device model's small context window is why it is capped hard. */
export function contextText(ctx: WorkContext): string {
  const lines: string[] = [];
  const list = (label: string, values: string[]) => {
    if (values.length > 0) lines.push(`${label}: ${values.join('; ')}`);
  };
  list('Today', ctx.eventsToday);
  list('Waiting on me', ctx.waiting);
  list('Red CI', ctx.redCi);
  list('In progress', ctx.todos);
  list('Todo tags', ctx.todoTags);
  list('Open ideas', ctx.openIdeas);
  // Streams come last so the cap cuts the long tail of them, not the urgent lines above.
  for (const stream of ctx.streams) {
    const parts = [
      stream.repos.length > 0 && `repos ${stream.repos.join(', ')}`,
      stream.hosts.length > 0 && `sites ${stream.hosts.join(', ')}`,
      stream.labels.length > 0 && `labels ${stream.labels.join(', ')}`,
      stream.titles.length > 0 && `items ${stream.titles.join(' | ')}`,
    ].filter(Boolean);
    lines.push(`Stream ${stream.name}${parts.length > 0 ? ` (${parts.join('; ')})` : ''}`);
  }
  const out: string[] = [];
  let used = 0;
  for (const line of lines) {
    const fitted = clip(line, LINE_LIMIT);
    if (used + fitted.length + 1 > TEXT_LIMIT) break;
    out.push(fitted);
    used += fitted.length + 1;
  }
  return out.join('\n');
}
