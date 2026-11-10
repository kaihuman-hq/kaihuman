import { localDate, parseDue, type TodoDue } from '@kaihuman/formats';
import { BUDGET_CATEGORIES } from '../components/widgets/budget-tile.js';
import type { LanguageModel, ObjectSchema } from './model.js';

/** One typed capture; each kind maps to the file the matching quick-capture form writes. */
export type SmartCapture =
  | { kind: 'todo'; text: string; tags: string[]; due?: TodoDue }
  | { kind: 'log'; text: string; tags: string[] }
  /** `amount` is always positive; the category says whether it is money in or out. */
  | { kind: 'budget'; name: string; amount: number; category: string; date: string }
  | { kind: 'habit'; habit: string; date: string };

export type CaptureKind = SmartCapture['kind'];
export const CAPTURE_KINDS = [
  'todo',
  'log',
  'budget',
  'habit',
] as const satisfies readonly CaptureKind[];

/** Field names must match `ParsedCapture` in targets/ios-widget/SmartCaptureModel.swift (Siri queue). */
export const CAPTURE_SCHEMA: ObjectSchema = {
  type: 'object',
  description: 'One quick capture',
  properties: {
    kind: { type: 'string', enum: CAPTURE_KINDS },
    text: { type: 'string', description: 'Todo or log text, merchant name, or habit name' },
    tags: { type: 'array', items: { type: 'string' }, description: 'Lowercase, no #' },
    due: { type: 'string', description: 'YYYY-MM-DD or YYYY-MM-DDTHH:MM' },
    amount: { type: 'number', description: 'Money amount, budget only' },
    category: { type: 'string', enum: BUDGET_CATEGORIES.map((c) => c.id) },
  },
  required: ['kind', 'text', 'tags'],
};

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface CaptureContext {
  tags?: readonly string[];
  habits?: readonly string[];
}

export const captureInstructions = (now: Date, ctx: CaptureContext = {}): string =>
  [
    `Today is ${WEEKDAYS[now.getDay()]} ${localDate(now)}. Turn the user's note into one capture.`,
    'kind: todo = something to do; log = something done or noticed; budget = money spent or earned (set amount and category); habit = a habit done (text = habit name).',
    'Resolve relative dates ("friday", "tomorrow") to the next such date as due. "#word" is the tag "word". Remove tags and date words from text.',
    ctx.tags?.length ? `Known tags: ${ctx.tags.slice(0, 40).join(', ')}.` : '',
    ctx.habits?.length ? `Known habits: ${ctx.habits.slice(0, 20).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const cleanTags = (v: unknown): string[] =>
  Array.isArray(v)
    ? [
        ...new Set(
          v.map((t) => str(t).replace(/^#/, '').toLowerCase()).filter((t) => /^[\w-]+$/.test(t)),
        ),
      ]
    : [];

/**
 * Validates what a model (or the Siri queue) produced. Returns null for anything unusable, so the
 * caller falls back to the plain capture rather than saving garbage.
 */
export function toCapture(raw: unknown, now: Date): SmartCapture | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const text = str(r.text);
  const tags = cleanTags(r.tags);
  const due = str(r.due) ? parseDue(str(r.due)) : undefined;
  const today = localDate(now);
  switch (r.kind) {
    case 'todo':
      if (!text) return null;
      return due ? { kind: 'todo', text, tags, due } : { kind: 'todo', text, tags };
    case 'log':
      return text ? { kind: 'log', text, tags } : null;
    case 'budget': {
      const amount = typeof r.amount === 'number' ? Math.abs(r.amount) : Number.NaN;
      const category = str(r.category);
      if (!text || !Number.isFinite(amount) || amount === 0) return null;
      if (/[;\n\r]/.test(text)) return null;
      return {
        kind: 'budget',
        name: text,
        amount: Math.round(amount * 100) / 100,
        category: BUDGET_CATEGORIES.some((c) => c.id === category) ? category : 'other-outcome',
        date: due?.date ?? today,
      };
    }
    case 'habit':
      return text ? { kind: 'habit', habit: text, date: due?.date ?? today } : null;
    default:
      return null;
  }
}

/** Today's behaviour: the whole text becomes an inbox todo (its `#tags` are parsed by the todo format). */
export const plainCapture = (text: string): SmartCapture => ({
  kind: 'todo',
  text: text.trim(),
  tags: [],
});

export interface ParsedCapture {
  capture: SmartCapture;
  /** `model` when Foundation Models produced a valid capture, `plain` for the fallback. */
  source: 'model' | 'plain';
}

/** On-device only: a capture is short, private, and must work offline. */
export async function parseCapture(
  text: string,
  deps: { model: LanguageModel | null; now: Date; context?: CaptureContext },
): Promise<ParsedCapture> {
  const plain: ParsedCapture = { capture: plainCapture(text), source: 'plain' };
  const { model, now } = deps;
  if (!text.trim() || !model?.available('device')) return plain;
  try {
    const raw = await model.json(
      text.trim(),
      captureInstructions(now, deps.context),
      CAPTURE_SCHEMA,
      'device',
    );
    const capture = toCapture(raw, now);
    return capture ? { capture, source: 'model' } : plain;
  } catch {
    return plain;
  }
}

/** One line for the confirmation toast, e.g. "Todo · due 2026-11-13 · #money". */
export function describeCapture(c: SmartCapture): string {
  switch (c.kind) {
    case 'todo':
      return [
        'Todo',
        c.due && `due ${c.due.date}${c.due.time ? ` ${c.due.time}` : ''}`,
        ...c.tags.map((t) => `#${t}`),
      ]
        .filter(Boolean)
        .join(' · ');
    case 'log':
      return ['Log', ...c.tags.map((t) => `#${t}`)].join(' · ');
    case 'budget':
      return `Budget · ${c.amount} · ${c.category}`;
    case 'habit':
      return `Habit · ${c.habit}`;
  }
}
