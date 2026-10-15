/**
 * The start page's one capture box: the model guesses whether a line is a note, a todo, a log
 * entry or an event, and where it goes. It only ever picks among the repo's own files, milestones
 * and tags; the save itself is still the user's Enter.
 */
import { localDate, parseTodos, splitInlineTags } from '@kaihuman/formats';
import { inboxPath, type TodayCache } from '../today.js';
import { cached, hashKey } from './cache.js';
import { detectLanguage, promptJson } from './model.js';
import { readAiSettings } from './settings.js';

export type CaptureGuess =
  | { kind: 'note'; text: string }
  | { kind: 'todo'; text: string; tags: string[]; path: string; milestoneId?: string }
  | { kind: 'log'; description: string; tags: string[] }
  | {
      kind: 'event';
      name: string;
      type: string;
      startDate: string;
      endDate: string;
      path: string;
    };

export interface CaptureContext {
  /** YYYY-MM-DD, local. */
  today: string;
  todoFiles: { path: string; milestones: { id: string; name: string }[] }[];
  eventFiles: string[];
  tags: string[];
}

/** The page gives up after this, so the worker does too. */
export const CAPTURE_TIMEOUT_MS = 4000;

const MAX_GUESSES = 3;
const MAX_TAGS = 5;
// Enough to tell what a line is; a pasted page would only crowd the context.
const MAX_INPUT = 1000;
const MAX_KNOWN_TAGS = 60;
const MAX_NAME = 120;
// Plenty for a capture typed a minute ago, and short enough that "tomorrow" stays right.
const CACHE_TTL_MS = 10 * 60_000;
const DAY_MS = 86_400_000;
const MAX_DAYS_AWAY = 366;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const EVENT_TYPE = /^[\w-]+$/;

export function captureContext(cache: TodayCache, now: Date): CaptureContext {
  const todoFiles: CaptureContext['todoFiles'] = [];
  const eventFiles: string[] = [];
  const tags = new Set<string>();
  for (const file of cache.files) {
    const lower = file.path.toLowerCase();
    if (lower.endsWith('.todos.md')) {
      const data = parseTodos(file.content);
      todoFiles.push({
        path: file.path,
        milestones: data.milestones.map(({ id, name }) => ({ id, name })),
      });
      for (const item of data.items) for (const tag of item.tags) tags.add(tag);
    } else if (lower.endsWith('.events.csv')) {
      eventFiles.push(file.path);
    }
  }
  // The inbox is where a todo goes by default, even before it exists: the worker creates it.
  const inbox = inboxPath(cache);
  if (!todoFiles.some((file) => file.path === inbox))
    todoFiles.push({ path: inbox, milestones: [] });
  return {
    today: localDate(now),
    todoFiles,
    eventFiles,
    tags: [...tags].sort().slice(0, MAX_KNOWN_TAGS),
  };
}

const kindsFor = (ctx: CaptureContext) =>
  ['note', 'todo', 'log', ...(ctx.eventFiles.length ? ['event'] : [])] as const;

/** What the model may answer: every choice is one of the repo's own files, milestones and tags. */
export function captureSchema(ctx: CaptureContext): object {
  const milestones = ctx.todoFiles.flatMap((file) => file.milestones.map((m) => m.id));
  const properties: Record<string, object> = {
    kind: { type: 'string', enum: kindsFor(ctx) },
    text: { type: 'string' },
    tags: ctx.tags.length
      ? { type: 'array', items: { type: 'string', enum: ctx.tags }, maxItems: MAX_TAGS }
      : { type: 'array', maxItems: 0 },
    path: { type: 'string', enum: [...ctx.todoFiles.map((file) => file.path), ...ctx.eventFiles] },
  };
  if (milestones.length)
    properties.milestoneId = { type: 'string', enum: [...new Set(milestones)] };
  if (ctx.eventFiles.length) {
    properties.type = { type: 'string', pattern: EVENT_TYPE.source };
    properties.startDate = { type: 'string', pattern: ISO_DATE.source };
    properties.endDate = { type: 'string', pattern: ISO_DATE.source };
  }
  return {
    type: 'object',
    properties: {
      guesses: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_GUESSES,
        items: { type: 'object', properties, required: ['kind', 'text'] },
      },
    },
    required: ['guesses'],
  };
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Noon, so a daylight-saving shift cannot move the date. */
const dayOf = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y ?? 0, (m ?? 1) - 1, d ?? 1, 12);
};

const systemPrompt = (ctx: CaptureContext) =>
  [
    'You sort one line someone typed into their personal notes app.',
    `Today is ${WEEKDAYS[dayOf(ctx.today).getDay()]}, ${ctx.today}.`,
    'Kinds: "todo" is something still to do; "log" is something that already happened; ' +
      '"event" is something on a date (a meeting, a trip, a birthday); "note" is anything else.',
    'Give up to three guesses, the most likely first, each a different kind or file.',
    'For a todo, pick the todo file and milestone it belongs to. For an event, put the event name ' +
      'in "text" without the date, and resolve weekdays and relative dates to YYYY-MM-DD from today.',
    'Only use tags from the list.',
  ].join('\n');

const promptInput = (text: string, ctx: CaptureContext) =>
  [
    'Todo files:',
    ...ctx.todoFiles.map(
      (file) =>
        `- ${file.path}${
          file.milestones.length
            ? ` (milestones: ${file.milestones.map((m) => `${m.id} "${m.name}"`).join(', ')})`
            : ''
        }`,
    ),
    ...(ctx.eventFiles.length
      ? ['Event files:', ...ctx.eventFiles.map((path) => `- ${path}`)]
      : []),
    `Tags: ${ctx.tags.join(', ') || '(none)'}`,
    '',
    `Line: ${text.slice(0, MAX_INPUT)}`,
  ].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const isRealDate = (iso: string) => ISO_DATE.test(iso) && localDate(dayOf(iso)) === iso;

const daysBetween = (a: string, b: string) =>
  Math.round((dayOf(b).getTime() - dayOf(a).getTime()) / DAY_MS);

/** One guess held to the context; null when it names anything the repo does not have. */
function guessFrom(raw: unknown, input: string, ctx: CaptureContext): CaptureGuess | null {
  if (!isRecord(raw)) return null;
  const typed = splitInlineTags(input);
  const known = new Set(ctx.tags);
  // Tags typed as `#tag` are the user's own, so they stay whatever the model makes of them.
  const tags = () =>
    [
      ...new Set([
        ...(Array.isArray(raw.tags) ? raw.tags : []).filter(
          (tag): tag is string => typeof tag === 'string' && known.has(tag),
        ),
        ...typed.tags,
      ]),
    ].slice(0, MAX_TAGS);

  switch (raw.kind) {
    case 'note':
      return { kind: 'note', text: input.trim() };
    case 'todo': {
      const file = ctx.todoFiles.find((candidate) => candidate.path === raw.path);
      if (!file || !typed.text) return null;
      const milestoneId = str(raw.milestoneId);
      if (milestoneId && !file.milestones.some((m) => m.id === milestoneId)) return null;
      return {
        kind: 'todo',
        text: typed.text,
        tags: tags(),
        path: file.path,
        ...(milestoneId ? { milestoneId } : {}),
      };
    }
    case 'log':
      return typed.text ? { kind: 'log', description: typed.text, tags: tags() } : null;
    case 'event': {
      const path = str(raw.path);
      if (!ctx.eventFiles.includes(path)) return null;
      const name = str(raw.text).slice(0, MAX_NAME);
      if (!name || name.includes(';')) return null;
      const type = str(raw.type).toLowerCase() || 'general';
      if (!EVENT_TYPE.test(type)) return null;
      const startDate = str(raw.startDate);
      if (!isRealDate(startDate) || Math.abs(daysBetween(ctx.today, startDate)) > MAX_DAYS_AWAY) {
        return null;
      }
      const endDate = type === 'birthday' ? startDate : str(raw.endDate) || startDate;
      if (!isRealDate(endDate)) return null;
      const length = daysBetween(startDate, endDate);
      if (length < 0 || length > MAX_DAYS_AWAY) return null;
      return { kind: 'event', name, type, startDate, endDate, path };
    }
    default:
      return null;
  }
}

/** The usable guesses, at most one per kind and file; null when none is. */
export function parseCaptureAnswer(
  raw: unknown,
  input: string,
  ctx: CaptureContext,
): CaptureGuess[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.guesses)) return null;
  const seen = new Set<string>();
  const guesses: CaptureGuess[] = [];
  for (const candidate of raw.guesses) {
    const guess = guessFrom(candidate, input, ctx);
    if (!guess) continue;
    const key = `${guess.kind}:${'path' in guess ? guess.path : ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    guesses.push(guess);
    if (guesses.length === MAX_GUESSES) break;
  }
  return guesses.length ? guesses : null;
}

const within = <T>(work: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    work,
    new Promise<T>((resolve) => {
      timer = setTimeout(() => resolve(fallback), ms);
    }),
  ]).finally(() => clearTimeout(timer));
};

/** Up to three guesses, the best first; [] without the model, when switched off, or too slow. */
export async function classifyCapture(text: string, ctx: CaptureContext): Promise<CaptureGuess[]> {
  const input = text.trim();
  if (!input) return [];
  if ((await readAiSettings()).enrichment === false) return [];
  const deadline = Date.now() + CAPTURE_TIMEOUT_MS;
  const guesses = await cached(
    hashKey('capture', input, JSON.stringify(ctx)),
    CACHE_TTL_MS,
    async () => {
      const language = await within(detectLanguage(input), CAPTURE_TIMEOUT_MS, null);
      const timeoutMs = deadline - Date.now();
      if (timeoutMs <= 0) return null;
      return promptJson({
        system: systemPrompt(ctx),
        input: promptInput(input, ctx),
        schema: captureSchema(ctx),
        validate: (raw) => parseCaptureAnswer(raw, input, ctx),
        priority: 'interactive',
        timeoutMs,
        languages: language === 'de' ? ['en', 'de'] : ['en'],
      });
    },
  );
  return guesses ?? [];
}
