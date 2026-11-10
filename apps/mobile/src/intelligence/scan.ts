import { localDate, parseDue, type TodoDue } from '@kaihuman/formats';
import { BUDGET_CATEGORIES } from '../components/widgets/budget-tile.js';
import {
  addConsumptionReading,
  consumptionColumns,
} from '../components/widgets/consumption-tile.js';
import { addTravelTrip } from '../components/widgets/travel-tile.js';
import type { CaptureResult, QuickCaptureController } from '../screens/quick-capture.js';
import type { LanguageModel, ObjectSchema } from './model.js';
import { type CaptureFiles, saveCapture } from './save-capture.js';
import { SCAN_KINDS, type ScanKind } from './scan-kinds.js';

/** What a scanned receipt, ticket, screenshot or meter becomes. */
export type ScanEntry =
  | { kind: 'budget'; name: string; amount: number; category: string; date: string }
  | { kind: 'travel'; title: string; start?: string; end?: string; destination?: string }
  | { kind: 'todo'; text: string; due?: TodoDue }
  /** A meter reading; `meter` is matched against the consumption file's columns. */
  | { kind: 'consumption'; meter: string; reading: number; date: string };

export { isScanKind, SCAN_KINDS, type ScanKind } from './scan-kinds.js';

export const SCAN_SCHEMA: ObjectSchema = {
  type: 'object',
  description: 'One entry read from a scanned document',
  properties: {
    kind: { type: 'string', enum: SCAN_KINDS },
    title: {
      type: 'string',
      description: 'Merchant, trip or event name, todo text, or meter name',
    },
    date: { type: 'string', description: 'YYYY-MM-DD (purchase, start, due or reading date)' },
    endDate: { type: 'string', description: 'YYYY-MM-DD, travel only' },
    place: { type: 'string', description: 'Destination, travel only' },
    amount: { type: 'number', description: 'Total paid, budget only' },
    category: { type: 'string', enum: BUDGET_CATEGORIES.map((c) => c.id) },
    reading: { type: 'number', description: 'Meter value, consumption only' },
  },
  required: ['kind', 'title'],
};

/** Document text can be long; the on-device window is 4096 tokens, so keep the prompt well under it. */
export const MAX_SCAN_CHARS = 6000;

export const scanInstructions = (now: Date, prefer?: ScanKind): string =>
  [
    `Today is ${localDate(now)}. The text was read from a photo or screenshot. Extract one entry.`,
    'budget = a receipt or invoice (title = merchant, amount = total paid); travel = a flight, train, hotel or event booking; consumption = a utility meter (title = meter name, reading = value); todo = anything else to act on.',
    prefer ? `The user asked for a ${prefer} entry.` : '',
  ]
    .filter(Boolean)
    .join('\n');

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const day = (v: unknown): string | undefined => parseDue(str(v).slice(0, 10))?.date;
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number.NaN);

export function toScanEntry(raw: unknown, now: Date): ScanEntry | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = str(r.title).replace(/[;\n\r]+/g, ' ');
  if (!title) return null;
  const date = day(r.date);
  switch (r.kind) {
    case 'budget': {
      const amount = Math.abs(num(r.amount));
      if (!(amount > 0)) return null;
      const category = str(r.category);
      return {
        kind: 'budget',
        name: title,
        amount: Math.round(amount * 100) / 100,
        category: BUDGET_CATEGORIES.some((c) => c.id === category) ? category : 'other-outcome',
        date: date ?? localDate(now),
      };
    }
    case 'travel': {
      const end = day(r.endDate);
      const place = str(r.place);
      return {
        kind: 'travel',
        title,
        ...(date ? { start: date } : {}),
        ...(end && (!date || end >= date) ? { end } : {}),
        ...(place ? { destination: place } : {}),
      };
    }
    case 'todo':
      return date ? { kind: 'todo', text: title, due: { date } } : { kind: 'todo', text: title };
    case 'consumption': {
      const reading = num(r.reading);
      return Number.isFinite(reading)
        ? { kind: 'consumption', meter: title, reading, date: date ?? localDate(now) }
        : null;
    }
    default:
      return null;
  }
}

/** Without a model: the first readable line as a todo, which the user can edit before saving. */
export function plainScanEntry(text: string): ScanEntry | null {
  const line = text
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 1);
  return line ? { kind: 'todo', text: line.slice(0, 200) } : null;
}

/** Recognised text -> entry. On-device: receipts are private. */
export async function scanTextToEntry(
  text: string,
  deps: { model: LanguageModel | null; now: Date; prefer?: ScanKind },
): Promise<{ entry: ScanEntry | null; source: 'model' | 'plain' }> {
  const plain = { entry: plainScanEntry(text), source: 'plain' as const };
  if (!text.trim() || !deps.model?.available('device')) return plain;
  try {
    const raw = await deps.model.json(
      text.slice(0, MAX_SCAN_CHARS),
      scanInstructions(deps.now, deps.prefer),
      SCAN_SCHEMA,
      'device',
    );
    const entry = toScanEntry(raw, deps.now);
    return entry ? { entry, source: 'model' } : plain;
  } catch {
    return plain;
  }
}

/**
 * Saves into the module's file. Travel and consumption need an existing file (and, for a reading,
 * a matching meter); otherwise the entry becomes a todo or log so the scan is not lost.
 */
export async function saveScanEntry(
  entry: ScanEntry,
  deps: { controller: QuickCaptureController; files: CaptureFiles; newId?: () => string },
): Promise<CaptureResult> {
  const { controller, files } = deps;
  switch (entry.kind) {
    case 'budget':
      return saveCapture(entry, deps);
    case 'todo':
      return controller.quickTodo(entry.text, [], entry.due);
    case 'travel': {
      const path = files.list('.travel.json')[0];
      const when = [entry.start, entry.end].filter(Boolean).join(' – ');
      if (!path)
        return controller.quickTodo(`Plan trip: ${entry.title}${when ? ` (${when})` : ''}`, [
          'travel',
        ]);
      const id = deps.newId?.() ?? `trip-${Date.now().toString(36)}`;
      const next = addTravelTrip(
        (await files.read(path)) ?? '',
        {
          name: entry.title,
          start: entry.start ?? '',
          end: entry.end ?? '',
          destination: entry.destination ?? '',
        },
        id,
      );
      if (!next.ok) return { ok: false, error: next.error };
      await files.write(path, next.content);
      return { ok: true, path, message: 'Trip added' };
    }
    case 'consumption': {
      const path = files.list('.consumption.csv')[0];
      const content = path ? ((await files.read(path)) ?? '') : '';
      const want = entry.meter.toLowerCase();
      const col = path
        ? consumptionColumns(content).find(
            (c) => c.title.toLowerCase().includes(want) || want.includes(c.title.toLowerCase()),
          )
        : undefined;
      if (!path || !col)
        return controller.quickLog(`${entry.meter} reading ${entry.reading} on ${entry.date}`, [
          'consumption',
        ]);
      const next = addConsumptionReading(
        content,
        entry.date,
        { [col.key]: String(entry.reading) },
        new Date(),
      );
      if (!next.ok) return { ok: false, error: next.error };
      await files.write(path, next.content);
      return { ok: true, path, message: `${col.title} reading added` };
    }
  }
}

export const SCAN_LABELS: Record<ScanKind, string> = {
  budget: 'Budget',
  travel: 'Travel',
  todo: 'Todo',
  consumption: 'Meter',
};

/** One line for the preview, e.g. "Budget · Migros · 42.16 · 2026-11-08". */
export function describeScanEntry(e: ScanEntry): string {
  const parts =
    e.kind === 'budget'
      ? [e.name, String(e.amount), e.category, e.date]
      : e.kind === 'travel'
        ? [e.title, e.destination, [e.start, e.end].filter(Boolean).join(' – ')]
        : e.kind === 'todo'
          ? [e.text, e.due && `due ${e.due.date}`]
          : [e.meter, String(e.reading), e.date];
  return [SCAN_LABELS[e.kind], ...parts].filter(Boolean).join(' · ');
}
