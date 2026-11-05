/** A change of one side against the base: base lines [baseStart, baseEnd) became side lines [sideStart, sideEnd). */
interface Hunk {
  baseStart: number;
  baseEnd: number;
  sideStart: number;
  sideEnd: number;
}

interface TaggedHunk extends Hunk {
  side: 'local' | 'remote';
}

export type Diff3Result = { clean: true; lines: string[] } | { clean: false };

/** Index pairs [aIndex, bIndex] of a longest common subsequence, ascending. */
export function matchLines(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  // Trimming the common prefix and suffix keeps the Myers trace small for typical edits.
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }
  const midA = a.slice(prefix, a.length - suffix);
  const midB = b.slice(prefix, b.length - suffix);

  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < prefix; i++) pairs.push([i, i]);
  for (const [x, y] of myers(midA, midB)) pairs.push([x + prefix, y + prefix]);
  for (let i = suffix; i > 0; i--) pairs.push([a.length - i, b.length - i]);
  return pairs;
}

/** Myers O((N+M)D) diff, returning the matched index pairs ascending. */
function myers(a: readonly string[], b: readonly string[]): Array<[number, number]> {
  const n = a.length;
  const m = b.length;
  if (n === 0 || m === 0) return [];
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  // Only the diagonals [-d-1, d+1] are read at step d, so each snapshot stores just those.
  const trace: Int32Array[] = [];
  const at = (snap: Int32Array, d: number, k: number): number => snap[k + d + 1] ?? 0;
  const vk = (k: number): number => v[k + offset] ?? 0;

  let finalD = -1;
  outer: for (let d = 0; d <= max; d++) {
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && vk(k - 1) < vk(k + 1)) ? vk(k + 1) : vk(k - 1) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) {
        finalD = d;
        break outer;
      }
    }
  }

  const reversed: Array<[number, number]> = [];
  let x = n;
  let y = m;
  for (let d = finalD; d > 0; d--) {
    const snap = trace[d];
    if (!snap) break;
    const k = x - y;
    const prevK = k === -d || (k !== d && at(snap, d, k - 1) < at(snap, d, k + 1)) ? k + 1 : k - 1;
    const prevX = at(snap, d, prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      x--;
      y--;
      reversed.push([x, y]);
    }
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    x--;
    y--;
    reversed.push([x, y]);
  }
  return reversed.reverse();
}

function hunks(base: readonly string[], side: readonly string[]): Hunk[] {
  const out: Hunk[] = [];
  let bi = 0;
  let si = 0;
  const pairs = matchLines(base, side);
  pairs.push([base.length, side.length]);
  for (const [b, s] of pairs) {
    if (b > bi || s > si) out.push({ baseStart: bi, baseEnd: b, sideStart: si, sideEnd: s });
    bi = b + 1;
    si = s + 1;
  }
  return out;
}

/** The side's lines standing for base [start, end), given that side's hunks inside that range. */
function sideSpan(
  side: readonly string[],
  own: readonly Hunk[],
  base: readonly string[],
  start: number,
  end: number,
): string[] {
  const first = own[0];
  const last = own[own.length - 1];
  if (!first || !last) return base.slice(start, end);
  // Outside its hunks a side equals the base line for line, so the offsets carry over.
  return side.slice(
    first.sideStart - (first.baseStart - start),
    last.sideEnd + (end - last.baseEnd),
  );
}

const sameLines = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, i) => line === b[i]);

/**
 * Classic diff3 over lines. Hunks of the two sides that overlap or touch in the base form one
 * region; touching counts as overlap (as in GNU diff3 and git) because the order of two
 * insertions at the same spot cannot be decided. A region changed by one side takes that side; a
 * region changed identically by both takes either; anything else is a conflict.
 */
export function diff3Lines(
  base: readonly string[],
  local: readonly string[],
  remote: readonly string[],
): Diff3Result {
  const all: TaggedHunk[] = [
    ...hunks(base, local).map((h) => ({ ...h, side: 'local' as const })),
    ...hunks(base, remote).map((h) => ({ ...h, side: 'remote' as const })),
  ].sort((p, q) => p.baseStart - q.baseStart || p.baseEnd - q.baseEnd);

  const out: string[] = [];
  let cursor = 0;
  let i = 0;
  while (i < all.length) {
    const head = all[i];
    if (!head) break;
    const group: TaggedHunk[] = [head];
    let start = head.baseStart;
    let end = head.baseEnd;
    i++;
    for (let next = all[i]; next && next.baseStart <= end; next = all[i]) {
      group.push(next);
      start = Math.min(start, next.baseStart);
      end = Math.max(end, next.baseEnd);
      i++;
    }

    out.push(...base.slice(cursor, start));
    const ownLocal = group.filter((h) => h.side === 'local');
    const ownRemote = group.filter((h) => h.side === 'remote');
    const localSpan = sideSpan(local, ownLocal, base, start, end);
    const remoteSpan = sideSpan(remote, ownRemote, base, start, end);
    if (ownRemote.length === 0) out.push(...localSpan);
    else if (ownLocal.length === 0) out.push(...remoteSpan);
    else if (sameLines(localSpan, remoteSpan)) out.push(...localSpan);
    else return { clean: false };
    cursor = end;
  }
  out.push(...base.slice(cursor));
  return { clean: true, lines: out };
}
