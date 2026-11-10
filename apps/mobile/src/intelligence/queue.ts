import { type SmartCapture, toCapture } from './smart-capture.js';

/** App Group file the Siri "Add to inbox" intent appends to when a capture is not a plain todo. */
export const SMART_CAPTURE_QUEUE_FILE = 'smart-captures.json';

export interface QueuedCapture {
  /** What the user said, kept so an unusable model result still becomes an inbox todo. */
  text: string;
  capture: SmartCapture;
}

/** Parses the queue file; a broken file or entry is skipped rather than blocking the rest. */
export function parseQueue(json: string | null, now: Date): QueuedCapture[] {
  if (!json) return [];
  let rows: unknown;
  try {
    rows = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row): QueuedCapture[] => {
    if (!row || typeof row !== 'object') return [];
    const { text, capture, capturedAt } = row as Record<string, unknown>;
    const at =
      typeof capturedAt === 'string' && !Number.isNaN(Date.parse(capturedAt))
        ? new Date(capturedAt)
        : now;
    const said = typeof text === 'string' ? text.trim() : '';
    const parsed = toCapture(capture, at);
    if (parsed) return [{ text: said, capture: parsed }];
    return said ? [{ text: said, capture: { kind: 'todo', text: said, tags: [] } }] : [];
  });
}

export interface QueueStore {
  read(name: string): string | null;
  write(name: string, content: string): void;
}

/**
 * Files every queued Siri capture. The queue is cleared first so a crash mid-way cannot file an
 * entry twice; entries that fail to save are written back for the next launch.
 */
export async function drainQueue(
  store: QueueStore,
  save: (capture: SmartCapture) => Promise<{ ok: boolean }>,
  now: Date,
): Promise<number> {
  const raw = store.read(SMART_CAPTURE_QUEUE_FILE);
  const items = parseQueue(raw, now);
  if (raw === null || raw === '' || raw === '[]') return 0;
  store.write(SMART_CAPTURE_QUEUE_FILE, '[]');
  const failed: QueuedCapture[] = [];
  let saved = 0;
  for (const item of items) {
    const res = await save(item.capture).catch(() => ({ ok: false }));
    if (res.ok) saved++;
    else failed.push(item);
  }
  if (failed.length) {
    const rows = failed.map((f) => ({
      text: f.text,
      capturedAt: now.toISOString(),
      capture: toRaw(f.capture),
    }));
    store.write(SMART_CAPTURE_QUEUE_FILE, JSON.stringify(rows));
  }
  return saved;
}

/** Back to the queue/model field names (`toCapture` reads these). */
export function toRaw(c: SmartCapture): Record<string, unknown> {
  switch (c.kind) {
    case 'todo':
      return {
        kind: 'todo',
        text: c.text,
        tags: c.tags,
        ...(c.due ? { due: c.due.time ? `${c.due.date}T${c.due.time}` : c.due.date } : {}),
      };
    case 'log':
      return { kind: 'log', text: c.text, tags: c.tags };
    case 'budget':
      return {
        kind: 'budget',
        text: c.name,
        tags: [],
        amount: c.amount,
        category: c.category,
        due: c.date,
      };
    case 'habit':
      return { kind: 'habit', text: c.habit, tags: [], due: c.date };
  }
}
