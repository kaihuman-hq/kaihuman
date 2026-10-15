import { peek, put } from './cache.js';
import { buildWorkContext, contextText, type WorkContext } from './context.js';
import { promptJson } from './model.js';

/** Both cards are read from `aiCache` by the new tab page; only the worker runs the model. */
export const FOCUS_KEY = 'card:focus';
export const BRIEF_KEY = 'card:brief';

const MAX_FOCUS = 120;
const MAX_SENTENCE = 160;
const SENTENCES = 3;
const HOUR_MS = 3_600_000;
// A refused answer is remembered briefly, so a model that keeps refusing is not asked on every run.
const REFUSED_TTL_MS = 15 * 60_000;
const FOCUS_REFUSED_KEY = 'card:focus:refused';
const BRIEF_REFUSED_KEY = 'card:brief:refused';
/** The brief is a morning card: nothing is generated before this hour. */
const BRIEF_FROM_HOUR = 5;
// Outlives the day, so a late start still finds the card until the next one lands.
const BRIEF_TTL_MS = 36 * HOUR_MS;

const FOCUS_SCHEMA = {
  type: 'object',
  properties: { focus: { type: 'string', maxLength: MAX_FOCUS } },
  required: ['focus'],
  additionalProperties: false,
};

const BRIEF_SCHEMA = {
  type: 'object',
  properties: {
    sentences: {
      type: 'array',
      items: { type: 'string', maxLength: MAX_SENTENCE },
      minItems: SENTENCES,
      maxItems: SENTENCES,
    },
  },
  required: ['sentences'],
  additionalProperties: false,
};

const FOCUS_SYSTEM = [
  'You name the one thing the user should focus on next, from their work list.',
  'Answer with one plain sentence of at most 120 characters. Use only things named in the list.',
].join(' ');

const BRIEF_SYSTEM = [
  'You write the user’s morning brief from their work list: exactly three short sentences.',
  'Cover what is on today, what waits on them, and what is at risk.',
  'Use only things named in the list.',
].join(' ');

export async function focusLine(ctx: WorkContext): Promise<string | null> {
  const input = contextText(ctx);
  // An empty list would only invite the model to invent a focus.
  if (input === '') return null;
  return promptJson<string>({
    system: FOCUS_SYSTEM,
    input,
    schema: FOCUS_SCHEMA,
    priority: 'background',
    validate: (raw) => {
      const focus = (raw as { focus?: unknown } | null)?.focus;
      if (typeof focus !== 'string') return null;
      const text = focus.trim();
      return text !== '' && text.length <= MAX_FOCUS ? text : null;
    },
  });
}

export async function morningBrief(ctx: WorkContext): Promise<string[] | null> {
  const input = contextText(ctx);
  if (input === '') return null;
  return promptJson<string[]>({
    system: BRIEF_SYSTEM,
    input,
    schema: BRIEF_SCHEMA,
    priority: 'background',
    validate: (raw) => {
      const list = (raw as { sentences?: unknown } | null)?.sentences;
      if (!Array.isArray(list) || list.length !== SENTENCES) return null;
      const sentences = list.map((s) => (typeof s === 'string' ? s.trim() : ''));
      return sentences.every((s) => s !== '' && s.length <= MAX_SENTENCE) ? sentences : null;
    },
  });
}

/** The user's calendar date, since the brief is for their day and not the UTC one. */
export function localDate(now: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

interface StoredBrief {
  date: string;
  sentences: string[];
}

type Inputs = Parameters<typeof buildWorkContext>[0];

/** Precompute job body: the focus line at most hourly. `inputs` is read only when work is due. */
export async function precomputeFocus(inputs: () => Promise<Inputs | null>): Promise<void> {
  if ((await peek<string>(FOCUS_KEY)) !== undefined) return;
  if ((await peek(FOCUS_REFUSED_KEY)) !== undefined) return;
  const gathered = await inputs();
  if (!gathered) return;
  const focus = await focusLine(buildWorkContext(gathered));
  if (focus !== null) await put(FOCUS_KEY, focus, HOUR_MS);
  else await put(FOCUS_REFUSED_KEY, true, REFUSED_TTL_MS);
}

/** Precompute job body: the brief once per date, from 05:00. */
export async function precomputeBrief(
  inputs: () => Promise<Inputs | null>,
  now = new Date(),
): Promise<void> {
  if (now.getHours() < BRIEF_FROM_HOUR) return;
  const date = localDate(now);
  if ((await peek<StoredBrief>(BRIEF_KEY))?.date === date) return;
  if ((await peek(BRIEF_REFUSED_KEY)) !== undefined) return;
  const gathered = await inputs();
  if (!gathered) return;
  const sentences = await morningBrief(buildWorkContext(gathered));
  if (sentences !== null) await put<StoredBrief>(BRIEF_KEY, { date, sentences }, BRIEF_TTL_MS);
  else await put(BRIEF_REFUSED_KEY, true, REFUSED_TTL_MS);
}

export interface AiCards {
  focus?: string;
  brief?: string[];
  briefDate?: string;
}

/** What the new tab page shows; an earlier day's brief is left out rather than shown as today's. */
export async function readAiCards(now = new Date()): Promise<AiCards> {
  const [focus, brief] = await Promise.all([peek<string>(FOCUS_KEY), peek<StoredBrief>(BRIEF_KEY)]);
  const cards: AiCards = {};
  if (focus !== undefined) cards.focus = focus;
  if (brief && brief.date === localDate(now)) {
    cards.brief = brief.sentences;
    cards.briefDate = brief.date;
  }
  return cards;
}
