/**
 * The start page's braindump digest: the model groups what is waiting in the braindumps into a
 * few themes, each with a todo and the dumps it came from. It only ever names dumps it was given;
 * turning a theme into a todo or an idea is the user's click, so nothing is written here.
 */
import { allBraindumps, type TodayCache } from '../today.js';
import { cached, hashKey } from './cache.js';
import { promptJson } from './model.js';
import { readAiSettings } from './settings.js';

export interface Theme {
  title: string;
  ids: string[];
  todo: string;
}

export interface DigestInput {
  id: string;
  title: string;
  text: string;
}

export const MAX_DUMPS = 30;
export const MAX_THEMES = 5;
// A dump is a thought typed in a minute; the start of it says what it is about.
const MAX_DUMP_TEXT = 600;
const MAX_LINE = 120;
// The key already changes with the dumps, so this only bounds how long a stale answer can live.
const CACHE_TTL_MS = 60 * 60_000;
// Like summarize and ask: a person is waiting, but the model is slow on 30 dumps.
const INTERACTIVE_TIMEOUT_MS = 30_000;

export function digestSchema(ids: string[]): object {
  return {
    type: 'object',
    properties: {
      themes: {
        type: 'array',
        minItems: 1,
        maxItems: MAX_THEMES,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string' },
            ids: { type: 'array', minItems: 1, items: { type: 'string', enum: ids } },
            todo: { type: 'string' },
          },
          required: ['title', 'ids', 'todo'],
        },
      },
    },
    required: ['themes'],
  };
}

const SYSTEM = [
  "You sort someone's pending braindumps (quick thoughts typed into a notes app) into themes.",
  `Give at most ${MAX_THEMES} themes. Each has a short title, the ids of the dumps it covers, and one`,
  'todo: a single concrete next step written as a task. Use only the ids given.',
].join('\n');

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const line = (value: unknown) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE) : '';

/** The themes that name at least one given id, with their ids held to the given ones. */
export function parseDigest(raw: unknown, ids: ReadonlySet<string>): Theme[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.themes)) return null;
  const themes: Theme[] = [];
  for (const candidate of raw.themes) {
    if (!isRecord(candidate) || !Array.isArray(candidate.ids)) continue;
    const own = [
      ...new Set(candidate.ids.filter((id): id is string => typeof id === 'string' && ids.has(id))),
    ];
    const title = line(candidate.title);
    const todo = line(candidate.todo);
    if (!own.length || !title || !todo) continue;
    themes.push({ title, ids: own, todo });
    if (themes.length === MAX_THEMES) break;
  }
  return themes.length ? themes : null;
}

/** Themes for up to 30 braindumps; null without the model or when its answer does not hold up. */
export async function digestBraindumps(dumps: DigestInput[]): Promise<Theme[] | null> {
  const used = dumps.slice(0, MAX_DUMPS);
  if (!used.length) return null;
  const ids = used.map((dump) => dump.id);
  return promptJson({
    system: SYSTEM,
    input: used
      .map((dump) => `id: ${dump.id}\n${dump.text.trim().slice(0, MAX_DUMP_TEXT)}`)
      .join('\n---\n'),
    schema: digestSchema(ids),
    validate: (raw) => parseDigest(raw, new Set(ids)),
    // Asked for by a click.
    priority: 'interactive',
    timeoutMs: INTERACTIVE_TIMEOUT_MS,
  });
}

/** The digest of the braindumps in the synced files; null when switched off or not possible. */
export async function digestToday(cache: TodayCache | undefined): Promise<Theme[] | null> {
  if (!cache || (await readAiSettings()).newTab === false) return null;
  // Not the page's list, which stops at ten.
  const newest = allBraindumps(cache).slice(0, MAX_DUMPS);
  const dumps = newest.map((dump) => ({ id: dump.path, title: dump.title, text: dump.text }));
  if (!dumps.length) return null;
  // The sha is in the key, so an edited dump gets a fresh digest.
  const key = hashKey('digest', ...newest.map((dump) => `${dump.path}@${dump.sha}`));
  return cached(key, CACHE_TTL_MS, () => digestBraindumps(dumps));
}
