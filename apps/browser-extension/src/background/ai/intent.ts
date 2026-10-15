/**
 * The palette's "Ask kaihuman" row: the model turns a line of plain language into one typed
 * action — a todo, a log entry, a timer — that the row previews and the user's Enter runs. It
 * only ever picks among the repo's own files, streams, habits, timers and bookmarks, and every
 * answer is checked against them again.
 */
import { localDate, newItemId, splitInlineTags } from '@kaihuman/formats';
import type { Bookmark } from '../bookmarks.js';
import { frecency } from '../ranking.js';
import { buildToday, type TodayCache } from '../today.js';
import { cached, hashKey } from './cache.js';
import { captureContext } from './capture.js';
import { detectLanguage, promptJson } from './model.js';
import { readAiSettings } from './settings.js';

export type Intent =
  | { action: 'add-todo'; text: string; path: string; tags: string[] }
  | { action: 'log'; description: string; tags: string[] }
  | { action: 'add-event'; name: string; startDate: string; endDate: string; path: string }
  | { action: 'pin-to-stream'; streamId: string }
  | { action: 'read-later' }
  | { action: 'open-bookmark'; bookmarkId: string }
  | { action: 'timer'; path: string; toggle: 'start' | 'stop' }
  | { action: 'check-in'; path: string };

export interface IntentContext {
  /** YYYY-MM-DD, local. */
  today: string;
  todoFiles: string[];
  eventFiles: string[];
  habits: { path: string; name: string }[];
  timers: { path: string; name: string; running: boolean }[];
  streams: { id: string; name: string }[];
  /** The top `MAX_BOOKMARKS` by frecency: enough to name the ones in use without a long prompt. */
  bookmarks: { id: string; title: string }[];
}

/** Longer than a capture's 4 s: the answer picks among more choices, and the row can wait. */
export const INTENT_TIMEOUT_MS = 8000;

const MAX_BOOKMARKS = 50;
const MAX_INPUT = 500;
const MAX_TEXT = 200;
// Long enough for a second try at the same words; short enough that "tomorrow" stays right.
const CACHE_TTL_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const MAX_DAYS_AWAY = 366;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function intentContext(
  cache: TodayCache,
  streams: { id: string; name: string }[],
  bookmarks: Bookmark[],
  now: Date,
): IntentContext {
  const files = captureContext(cache, now);
  const today = buildToday(cache, now);
  return {
    today: files.today,
    todoFiles: files.todoFiles.map((file) => file.path),
    eventFiles: files.eventFiles,
    habits: today.habits.map(({ path, name }) => ({ path, name })),
    timers: today.timers.map(({ path, name, running }) => ({ path, name, running })),
    streams: streams.map(({ id, name }) => ({ id, name })),
    bookmarks: bookmarks
      .map((bookmark) => ({ bookmark, score: frecency(bookmark, now) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, MAX_BOOKMARKS)
      .map(({ bookmark }) => ({ id: bookmark.id, title: bookmark.title })),
  };
}

const branch = (action: Intent['action'], fields: Record<string, object> = {}) => ({
  type: 'object',
  properties: { action: { type: 'string', enum: [action] }, ...fields },
  required: ['action', ...Object.keys(fields)],
});

const text = { type: 'string', maxLength: MAX_TEXT };
const date = { type: 'string', pattern: ISO_DATE.source };
const oneOf = (values: string[]) => ({ type: 'string', enum: values });

/** One branch per action the context has something for; every id and path is an enum of its. */
export function intentSchema(ctx: IntentContext): object {
  const branches: object[] = [];
  if (ctx.todoFiles.length) branches.push(branch('add-todo', { text, path: oneOf(ctx.todoFiles) }));
  branches.push(branch('log', { description: text }));
  if (ctx.eventFiles.length) {
    branches.push(
      branch('add-event', {
        name: text,
        startDate: date,
        endDate: date,
        path: oneOf(ctx.eventFiles),
      }),
    );
  }
  if (ctx.streams.length)
    branches.push(branch('pin-to-stream', { streamId: oneOf(ctx.streams.map((s) => s.id)) }));
  branches.push(branch('read-later'));
  if (ctx.bookmarks.length) {
    branches.push(branch('open-bookmark', { bookmarkId: oneOf(ctx.bookmarks.map((b) => b.id)) }));
  }
  if (ctx.timers.length) {
    branches.push(
      branch('timer', {
        path: oneOf(ctx.timers.map((t) => t.path)),
        toggle: oneOf(['start', 'stop']),
      }),
    );
  }
  if (ctx.habits.length)
    branches.push(branch('check-in', { path: oneOf(ctx.habits.map((h) => h.path)) }));
  return { oneOf: branches };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Noon, so a daylight-saving shift cannot move the date. */
const dayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12);
};

const systemPrompt = (ctx: IntentContext) =>
  [
    'You turn one line someone typed into their command palette into one action.',
    `Today is ${WEEKDAYS[dayOf(ctx.today).getDay()]}, ${ctx.today}.`,
    'Actions: "add-todo" adds something still to do; "log" records something already done ' +
      '(keep durations like "30m" in the description); "add-event" puts something on a date; ' +
      '"pin-to-stream" pins the open page to a stream; "read-later" saves the open page to read ' +
      'later; "open-bookmark" opens a bookmark; "timer" starts a stopped timer or stops a running ' +
      'one; "check-in" ticks off a habit for today.',
    'Resolve weekdays and relative dates to YYYY-MM-DD from today.',
    'Only use files, streams, timers, habits and bookmarks from the lists.',
  ].join('\n');

const list = (label: string, entries: string[]) =>
  entries.length ? [`${label}:`, ...entries.map((entry) => `- ${entry}`)] : [];

const promptInput = (input: string, ctx: IntentContext) =>
  [
    ...list('Todo files', ctx.todoFiles),
    ...list('Event files', ctx.eventFiles),
    ...list(
      'Timers',
      ctx.timers.map((t) => `${t.path} "${t.name}" (${t.running ? 'running' : 'stopped'})`),
    ),
    ...list(
      'Habits',
      ctx.habits.map((h) => `${h.path} "${h.name}"`),
    ),
    ...list(
      'Streams',
      ctx.streams.map((s) => `${s.id} "${s.name}"`),
    ),
    ...list(
      'Bookmarks',
      ctx.bookmarks.map((b) => `${b.id} "${b.title}"`),
    ),
    '',
    `Line: ${input.slice(0, MAX_INPUT)}`,
  ].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isRealDate = (iso: string) => ISO_DATE.test(iso) && localDate(dayOf(iso)) === iso;

const daysBetween = (a: string, b: string) =>
  Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / DAY_MS);

const TAG = /^[\w-]+$/;

/**
 * An answer held to the context: null when it names anything the repo does not have, or does
 * what cannot be done (stopping a stopped timer). Tags are only the `#tags` the user typed into
 * `input`, since the context has no list of known tags to pick from; without `input` — an intent
 * checked again before it runs — the intent's own tags are kept when they are tag-shaped.
 */
export function validateIntent(raw: unknown, ctx: IntentContext, input?: string): Intent | null {
  if (!isRecord(raw)) return null;
  const own = Array.isArray(raw.tags)
    ? raw.tags.filter((tag): tag is string => typeof tag === 'string' && TAG.test(tag))
    : [];
  const tags = [...new Set(input === undefined ? own : splitInlineTags(input).tags)];
  const words = (value: unknown) => splitInlineTags(str(value)).text.slice(0, MAX_TEXT);
  switch (raw.action) {
    case 'add-todo': {
      const path = str(raw.path);
      const todo = words(raw.text);
      return ctx.todoFiles.includes(path) && todo
        ? { action: 'add-todo', text: todo, path, tags }
        : null;
    }
    case 'log': {
      const description = words(raw.description);
      return description ? { action: 'log', description, tags } : null;
    }
    case 'add-event': {
      const path = str(raw.path);
      const name = words(raw.name);
      // `;` separates the columns of the events file.
      if (!ctx.eventFiles.includes(path) || !name || name.includes(';')) return null;
      const startDate = str(raw.startDate);
      const endDate = str(raw.endDate) || startDate;
      if (!isRealDate(startDate) || !isRealDate(endDate)) return null;
      if (Math.abs(daysBetween(ctx.today, startDate)) > MAX_DAYS_AWAY) return null;
      const length = daysBetween(startDate, endDate);
      if (length < 0 || length > MAX_DAYS_AWAY) return null;
      return { action: 'add-event', name, startDate, endDate, path };
    }
    case 'pin-to-stream': {
      const streamId = str(raw.streamId);
      return ctx.streams.some((s) => s.id === streamId)
        ? { action: 'pin-to-stream', streamId }
        : null;
    }
    case 'read-later':
      return { action: 'read-later' };
    case 'open-bookmark': {
      const bookmarkId = str(raw.bookmarkId);
      return ctx.bookmarks.some((b) => b.id === bookmarkId)
        ? { action: 'open-bookmark', bookmarkId }
        : null;
    }
    case 'timer': {
      const timer = ctx.timers.find((t) => t.path === str(raw.path));
      const toggle = raw.toggle;
      if (!timer || (toggle !== 'start' && toggle !== 'stop')) return null;
      // The worker only toggles, so a start on a running timer would stop it, and vice versa.
      if ((toggle === 'stop') !== timer.running) return null;
      return { action: 'timer', path: timer.path, toggle };
    }
    case 'check-in': {
      const path = str(raw.path);
      return ctx.habits.some((h) => h.path === path) ? { action: 'check-in', path } : null;
    }
    default:
      return null;
  }
}

/** The one action the line asks for; null without the model, when switched off, or too slow. */
export async function parseIntent(text: string, ctx: IntentContext): Promise<Intent | null> {
  const input = text.trim();
  if (!input) return null;
  if ((await readAiSettings()).palette === false) return null;
  const deadline = Date.now() + INTENT_TIMEOUT_MS;
  return cached(hashKey('intent', input, JSON.stringify(ctx)), CACHE_TTL_MS, async () => {
    const language = await detectLanguage(input, { timeoutMs: INTENT_TIMEOUT_MS });
    const timeoutMs = deadline - Date.now();
    if (timeoutMs <= 0) return null;
    return promptJson({
      system: systemPrompt(ctx),
      input: promptInput(input, ctx),
      schema: intentSchema(ctx),
      validate: (raw) => validateIntent(raw, ctx, input),
      priority: 'interactive',
      timeoutMs,
      languages: language === 'de' ? ['en', 'de'] : ['en'],
    });
  });
}

const hashtags = (tags: string[]) => tags.map((tag) => ` #${tag}`).join('');

/** What the row says it will do, naming the file, stream, timer, habit or bookmark it touches. */
export function previewOf(intent: Intent, ctx: IntentContext): string {
  switch (intent.action) {
    case 'add-todo':
      return `Todo: ${intent.text}${hashtags(intent.tags)} → ${intent.path}`;
    case 'log':
      return `Log: ${intent.description}${hashtags(intent.tags)}`;
    case 'add-event': {
      const when =
        intent.endDate === intent.startDate
          ? `on ${intent.startDate}`
          : `${intent.startDate} – ${intent.endDate}`;
      return `Event: ${intent.name} ${when} → ${intent.path}`;
    }
    case 'pin-to-stream': {
      const stream = ctx.streams.find((s) => s.id === intent.streamId);
      return `Pin this page to ${stream?.name ?? intent.streamId}`;
    }
    case 'read-later':
      return 'Read later: this page';
    case 'open-bookmark': {
      const bookmark = ctx.bookmarks.find((b) => b.id === intent.bookmarkId);
      return `Open ${bookmark?.title ?? intent.bookmarkId}`;
    }
    case 'timer': {
      const timer = ctx.timers.find((t) => t.path === intent.path);
      return `${intent.toggle === 'start' ? 'Start' : 'Stop'} timer: ${timer?.name ?? intent.path}`;
    }
    case 'check-in': {
      const habit = ctx.habits.find((h) => h.path === intent.path);
      return `Check in: ${habit?.name ?? intent.path}`;
    }
  }
}

/**
 * The messages the worker's existing handlers take for an intent, in order — so running one is
 * the same write the start page or the palette would make.
 */
export function intentMessages(
  intent: Intent,
  opts: {
    page: { url: string; title: string; text: string };
    logPath: string;
    bookmarkUrl?: string;
    reuse?: boolean;
  },
): object[] {
  const { page } = opts;
  switch (intent.action) {
    case 'add-todo':
      return [{ type: 'ADD_TODO', text: intent.text, path: intent.path, tags: intent.tags }];
    case 'log':
      return [
        {
          type: 'ADD_ACTION_LOG',
          path: opts.logPath,
          description: intent.description,
          tags: intent.tags,
        },
      ];
    case 'add-event':
      return [
        {
          type: 'ADD_EVENT',
          name: intent.name,
          eventType: 'general',
          startDate: intent.startDate,
          endDate: intent.endDate,
          path: intent.path,
        },
      ];
    case 'pin-to-stream':
      return [
        {
          type: 'WORK_OPS',
          ops: [
            {
              op: 'pin',
              streamId: intent.streamId,
              itemId: newItemId(),
              url: page.url,
              title: page.title || page.url,
              labels: [],
              at: new Date().toISOString(),
            },
          ],
        },
      ];
    case 'read-later':
      return [{ type: 'READ_LATER_ADD', url: page.url, title: page.title, text: page.text }];
    case 'open-bookmark':
      return [
        { type: 'RECORD_BOOKMARK_USE', bookmarkId: intent.bookmarkId },
        { type: 'OPEN_URL', url: opts.bookmarkUrl ?? '', reuse: opts.reuse === true },
      ];
    case 'timer':
      return [{ type: 'TODAY_TOGGLE_TIMER', path: intent.path }];
    case 'check-in':
      return [{ type: 'TODAY_CHECK_IN', path: intent.path }];
  }
}
