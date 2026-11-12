import {
  type ActionLogEntry,
  type ActionLogFile,
  parseActionLog,
  serializeActionLog,
} from './action-log.js';
import {
  parseReadItLater,
  type ReadItLaterConfig,
  type ReadItLaterItem,
  serializeReadItLater,
} from './read-later.js';
import {
  type Milestone,
  parseTodos,
  serializeTodos,
  type TodoData,
  type TodoItem,
} from './todos.js';

/** Same shape as `MergeResult` in `@kaihuman/core`; formats must not import core. */
export type StructuralMergeResult = { clean: true; content: string } | { clean: false };

/** `null`: this input cannot be merged structurally (e.g. a lossy round-trip); use a line merge. */
export type StructuralMergeFn = (
  base: string,
  local: string,
  remote: string,
) => StructuralMergeResult | null;

/** `unsupported` means the structural merge cannot speak for this input; diff3 takes over. */
type Outcome<T> = { kind: 'merged'; value: T } | { kind: 'conflict' } | { kind: 'unsupported' };

const merged = <T>(value: T): Outcome<T> => ({ kind: 'merged', value });
const CONFLICT = { kind: 'conflict' } as const;
const UNSUPPORTED = { kind: 'unsupported' } as const;

/**
 * Parses all three versions, or returns undefined when any of them would not survive
 * parse → serialize unchanged: merging the parsed form would silently drop what the parser
 * ignores (comments, blank lines, unknown keys). An empty file is the empty list.
 */
function parseAll<D>(
  parse: (text: string) => D,
  serialize: (data: D) => string,
  texts: readonly [string, string, string],
): [D, D, D] | undefined {
  const out: D[] = [];
  for (const text of texts) {
    try {
      const data = parse(text);
      if (text !== '' && serialize(data) !== text) return undefined;
      out.push(data);
    } catch {
      return undefined;
    }
  }
  const [b, l, r] = out;
  return b !== undefined && l !== undefined && r !== undefined ? [b, l, r] : undefined;
}

/** Structural equality for parsed JSON-like values; keys holding `undefined` count as absent. */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((x, i) => deepEqual(x, b[i]));
  }
  const ra = a as Record<string, unknown>;
  const rb = b as Record<string, unknown>;
  const keys = new Set([...Object.keys(ra), ...Object.keys(rb)]);
  for (const key of keys) if (!deepEqual(ra[key], rb[key])) return false;
  return true;
}

function mergeScalar<T>(base: T, local: T, remote: T): Outcome<T> {
  if (deepEqual(local, base)) return merged(remote);
  if (deepEqual(remote, base) || deepEqual(local, remote)) return merged(local);
  return CONFLICT;
}

/** Undefined when two items share a key: then the items cannot be told apart reliably. */
function byKey<T>(items: readonly T[], keyOf: (item: T) => string): Map<string, T> | undefined {
  const map = new Map<string, T>();
  for (const item of items) {
    const key = keyOf(item);
    if (map.has(key)) return undefined;
    map.set(key, item);
  }
  return map;
}

/** Whether `side` keeps the base's relative order of the items both still hold. */
function keepsBaseOrder(baseKeys: readonly string[], sideKeys: readonly string[]): boolean {
  const inSide = new Set(sideKeys);
  const inBase = new Set(baseKeys);
  const a = baseKeys.filter((k) => inSide.has(k));
  const b = sideKeys.filter((k) => inBase.has(k));
  return a.every((k, i) => k === b[i]);
}

/**
 * Key-based three-way merge of a list. Additions on either side are kept; a deletion wins over
 * an unchanged item but conflicts with a modification; one-sided modifications are taken;
 * different modifications on both sides conflict. Order follows local, unless only remote
 * reordered; the other side's additions go right after their predecessor on that side.
 */
function mergeList<T>(
  base: readonly T[],
  local: readonly T[],
  remote: readonly T[],
  keyOf: (item: T) => string,
): Outcome<T[]> {
  const b = byKey(base, keyOf);
  const l = byKey(local, keyOf);
  const r = byKey(remote, keyOf);
  if (!b || !l || !r) return UNSUPPORTED;

  const result = new Map<string, T>();
  for (const key of new Set([...b.keys(), ...l.keys(), ...r.keys()])) {
    const bv = b.get(key);
    const lv = l.get(key);
    const rv = r.get(key);
    if (bv === undefined) {
      if (lv !== undefined && rv !== undefined && !deepEqual(lv, rv)) return CONFLICT;
      const added = lv ?? rv;
      if (added !== undefined) result.set(key, added);
    } else if (lv !== undefined && rv !== undefined) {
      const m = mergeScalar(bv, lv, rv);
      if (m.kind !== 'merged') return CONFLICT;
      result.set(key, m.value);
    } else if (lv !== undefined) {
      if (!deepEqual(lv, bv)) return CONFLICT;
    } else if (rv !== undefined) {
      if (!deepEqual(rv, bv)) return CONFLICT;
    }
  }

  const baseKeys = [...b.keys()];
  const localKeys = [...l.keys()];
  const remoteKeys = [...r.keys()];
  const remoteLeads = keepsBaseOrder(baseKeys, localKeys) && !keepsBaseOrder(baseKeys, remoteKeys);
  const [lead, other] = remoteLeads ? [remoteKeys, localKeys] : [localKeys, remoteKeys];

  const order = lead.filter((k) => result.has(k));
  const placed = new Set(order);
  let predecessor: string | undefined;
  for (const key of other) {
    if (!result.has(key)) continue;
    if (!placed.has(key)) {
      order.splice(predecessor === undefined ? 0 : order.indexOf(predecessor) + 1, 0, key);
      placed.add(key);
    }
    predecessor = key;
  }
  return merged(order.flatMap((k) => (result.has(k) ? [result.get(k) as T] : [])));
}

function mergeTodos(base: string, local: string, remote: string): Outcome<string> {
  const parsed = parseAll(parseTodos, serializeTodos, [base, local, remote]);
  if (!parsed) return UNSUPPORTED;
  const [b, l, r] = parsed;

  // Item ids are positional (`item-<index>`), so they change whenever an item is added or
  // removed above; creation time is the stable identity, with the text for legacy items.
  // An explicit `::id::` wins. A todo that only some sides have an id for (backfill) is matched
  // through its fallback key so it is not mistaken for a delete plus an add.
  const fallbackKey = (item: Omit<TodoItem, 'id'>) => item.createdAt ?? `text:${item.text}`;
  const idByFallback = new Map<string, string>();
  for (const item of [...b.items, ...l.items, ...r.items]) {
    if (item.todoId) idByFallback.set(fallbackKey(item), item.todoId);
  }
  const itemKey = (item: Omit<TodoItem, 'id'>) => {
    const id = item.todoId ?? idByFallback.get(fallbackKey(item));
    return id ? `id:${id}` : fallbackKey(item);
  };
  const withoutId = (items: TodoItem[]) => items.map(({ id: _id, ...rest }) => rest);
  const items = mergeList(withoutId(b.items), withoutId(l.items), withoutId(r.items), itemKey);
  const milestones = mergeList<Milestone>(b.milestones, l.milestones, r.milestones, (m) => m.id);
  const color = mergeScalar(b.color, l.color, r.color);
  if (items.kind === 'unsupported' || milestones.kind === 'unsupported') return UNSUPPORTED;
  if (items.kind !== 'merged' || milestones.kind !== 'merged' || color.kind !== 'merged') {
    return CONFLICT;
  }

  const data: TodoData = {
    milestones: milestones.value,
    items: items.value.map((item, i) => ({ ...item, id: `item-${i}` })),
    isLegacyFormat: false,
  };
  if (color.value) data.color = color.value;
  return merged(serializeTodos(data));
}

function mergeReadItLater(base: string, local: string, remote: string): Outcome<string> {
  const parsed = parseAll<ReadItLaterConfig>(parseReadItLater, serializeReadItLater, [
    base,
    local,
    remote,
  ]);
  if (!parsed) return UNSUPPORTED;
  const [b, l, r] = parsed;
  const items = mergeList<ReadItLaterItem>(b.items, l.items, r.items, (item) => item.id);
  if (items.kind !== 'merged') return items;
  return merged(serializeReadItLater({ items: items.value }));
}

/** Log entries have no id; two identical lines are interchangeable, so an occurrence count disambiguates them. */
function keyLogEntries(entries: readonly ActionLogEntry[]): Array<[string, ActionLogEntry]> {
  const seen = new Map<string, number>();
  return entries.map((entry) => {
    const base = `${entry.timestamp}\u0000${entry.description}`;
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return [`${base}\u0000${n}`, entry];
  });
}

const isChronological = (entries: readonly ActionLogEntry[]): boolean =>
  entries.every((e, i) => i === 0 || (entries[i - 1]?.timestamp ?? '') <= e.timestamp);

function mergeActionLog(base: string, local: string, remote: string): Outcome<string> {
  const parsed = parseAll<ActionLogFile>(parseActionLog, serializeActionLog, [base, local, remote]);
  if (!parsed) return UNSUPPORTED;
  const [b, l, r] = parsed;

  const entries = mergeList(
    keyLogEntries(b.entries),
    keyLogEntries(l.entries),
    keyLogEntries(r.entries),
    ([key]) => key,
  );
  const frontmatter = mergeList(
    Object.entries(b.frontmatter),
    Object.entries(l.frontmatter),
    Object.entries(r.frontmatter),
    ([key]) => key,
  );
  if (entries.kind !== 'merged' || frontmatter.kind !== 'merged') return CONFLICT;

  let ordered = entries.value.map(([, entry]) => entry);
  // The log is appended oldest first; keep it that way when both sides were, so entries
  // appended on both devices interleave by time instead of by device.
  if (isChronological(l.entries) && isChronological(r.entries)) {
    ordered = [...ordered].sort((p, q) =>
      p.timestamp < q.timestamp ? -1 : p.timestamp > q.timestamp ? 1 : 0,
    );
  }
  return merged(
    serializeActionLog({ frontmatter: Object.fromEntries(frontmatter.value), entries: ordered }),
  );
}

const toResult = (outcome: Outcome<string>): StructuralMergeResult | null =>
  outcome.kind === 'merged'
    ? { clean: true, content: outcome.value }
    : outcome.kind === 'conflict'
      ? { clean: false }
      : null;

/**
 * Three-way merges of list formats, keyed by lower-case path suffix, for registration with
 * core's `registerStructuralMerger`. Items are matched by identity, so additions on both sides
 * merge where a line diff3 would conflict.
 */
export const structuralMergers: Record<string, StructuralMergeFn> = {
  '.todos.md': (b, l, r) => toResult(mergeTodos(b, l, r)),
  '.readitlater.json': (b, l, r) => toResult(mergeReadItLater(b, l, r)),
  '.actionlog.md': (b, l, r) => toResult(mergeActionLog(b, l, r)),
};
