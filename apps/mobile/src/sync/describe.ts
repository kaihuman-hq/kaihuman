import type { SyncStatus } from './status.js';

export interface SyncDescription {
  text: string;
  tone: 'neutral' | 'warning' | 'error';
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function age(ms: number): string {
  const min = Math.floor(Math.max(0, ms) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.floor(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

/** One caption for the sync state. Precedence: conflicts > error > offline > syncing > pending > updated. */
export function describeSyncStatus(s: SyncStatus, now: number): SyncDescription {
  const pending = `${s.pending} ${plural(s.pending, 'change', 'changes')} pending`;
  if (s.conflicts.length > 0) {
    const n = s.conflicts.length;
    return { text: `${n} ${plural(n, 'file needs', 'files need')} review`, tone: 'warning' };
  }
  if (s.phase === 'error') return { text: s.error ?? "Couldn't sync", tone: 'error' };
  if (s.phase === 'offline') {
    return { text: s.pending > 0 ? `Offline · ${pending}` : 'Offline', tone: 'neutral' };
  }
  if (s.phase === 'syncing') return { text: 'Syncing…', tone: 'neutral' };
  if (s.pending > 0) return { text: pending, tone: 'neutral' };
  if (s.lastSyncedAt === null) return { text: '', tone: 'neutral' };
  return { text: `Updated ${age(now - s.lastSyncedAt)}`, tone: 'neutral' };
}
