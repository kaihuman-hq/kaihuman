import {
  type ActionLogEntry,
  calculateDurationMinutes,
  formatDuration,
  parseActionLog,
  parseTimeTracking,
  type StreamsFile,
} from '@kaihuman/formats';
import type { TodayCache } from '../today.js';
import type { WorkSnapshot } from '../work/types.js';
import { promptJson } from './model.js';

export type ReviewRange = 'standup' | 'week';

export interface ReviewSources {
  log: ActionLogEntry[];
  done: { title: string; url: string }[];
  merged: { title: string; url: string }[];
  minutes: { name: string; minutes: number }[];
}

const MAX_BULLETS = 8;
const MAX_BULLET = 200;
/** A click on a menu item: slower than a classify, but the user is watching a spinner. */
const REVIEW_TIMEOUT_MS = 30_000;

const pad = (n: number) => String(n).padStart(2, '0');
const dateOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Standup: since yesterday 00:00. Week: Monday 00:00 of the current week. */
export function rangeStart(range: ReviewRange, now: Date): Date {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  start.setDate(start.getDate() - (range === 'standup' ? 1 : (now.getDay() + 6) % 7));
  return start;
}

export function reviewSources(
  range: ReviewRange,
  now: Date,
  data: {
    logs: string[];
    streams: StreamsFile | null;
    snapshot?: WorkSnapshot;
    todayCache: TodayCache;
  },
): ReviewSources {
  const start = rangeStart(range, now);
  const startMs = start.getTime();
  const inRange = (iso: string) => {
    const ms = Date.parse(iso);
    return ms >= startMs && ms <= now.getTime();
  };
  // Action log timestamps are local wall-clock strings, which sort as text.
  const startText = `${dateOf(start)} 00:00:00`;
  const nowText = `${dateOf(now)} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  const log = data.logs
    .flatMap((content) => parseActionLog(content).entries)
    .filter((e) => e.timestamp >= startText && e.timestamp <= nowText)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));

  const done = (data.streams?.streams ?? []).flatMap((stream) =>
    stream.items
      .filter((item) => item.doneAt !== undefined && inRange(item.doneAt))
      .map((item) => ({ title: item.title, url: item.url })),
  );

  // The snapshot keeps no merge time, so the last update stands in for it.
  const merged = Object.values(data.snapshot?.pinned ?? {}).flatMap((status) =>
    'error' in status || status.state !== 'merged' || !inRange(status.updatedAt)
      ? []
      : [{ title: status.title, url: status.url }],
  );

  const minutes = data.todayCache.files
    .filter((file) => file.path.toLowerCase().endsWith('.timetracking.csv'))
    .flatMap((file) => parseTimeTracking(file.content).entries)
    .filter((entry) => entry.date >= dateOf(start) && entry.date <= dateOf(now))
    .map((entry) => ({ name: entry.date, minutes: calculateDurationMinutes(entry) }))
    .filter((m) => m.minutes > 0);

  return { log, done, merged, minutes };
}

/** The rule fallback, and the only text the model is shown. */
export function bulletsOf(s: ReviewSources): string {
  const lines = [
    ...s.log.map((e) => `- Logged: ${e.description}`),
    ...s.done.map((d) => `- Done: ${d.title}`),
    ...s.merged.map((m) => `- Merged: ${m.title}`),
    ...s.minutes.map((m) => `- Tracked ${formatDuration(m.minutes)} on ${m.name}`),
  ];
  return lines.join('\n');
}

const SCHEMA = {
  type: 'object',
  properties: {
    bullets: {
      type: 'array',
      items: { type: 'string', maxLength: MAX_BULLET },
      minItems: 1,
      maxItems: MAX_BULLETS,
    },
  },
  required: ['bullets'],
  additionalProperties: false,
};

const systemFor = (range: ReviewRange) =>
  [
    range === 'standup'
      ? 'You write the user’s standup update from what they logged since yesterday.'
      : 'You write the user’s review of their week from what they logged since Monday.',
    `Answer with at most ${MAX_BULLETS} short bullets in the first person, past tense.`,
    'Merge related items. Use only things named in the list; invent nothing.',
  ].join(' ');

/** Prose bullets from the model, or null when it is missing, slow, or answers badly. */
export async function draftReview(s: ReviewSources, range: ReviewRange): Promise<string | null> {
  const input = bulletsOf(s);
  // An empty list would only invite the model to invent a week.
  if (input === '') return null;
  return promptJson<string>({
    system: systemFor(range),
    input,
    schema: SCHEMA,
    priority: 'interactive',
    timeoutMs: REVIEW_TIMEOUT_MS,
    validate: (raw) => {
      const list = (raw as { bullets?: unknown } | null)?.bullets;
      if (!Array.isArray(list) || list.length === 0 || list.length > MAX_BULLETS) return null;
      const bullets = list.map((b) => (typeof b === 'string' ? b.trim() : ''));
      if (!bullets.every((b) => b !== '' && b.length <= MAX_BULLET)) return null;
      return bullets.map((b) => `- ${b.replace(/^[-*]\s+/, '')}`).join('\n');
    },
  });
}
