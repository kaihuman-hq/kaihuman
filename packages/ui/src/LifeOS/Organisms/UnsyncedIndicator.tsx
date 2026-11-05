import { githubFileStore } from '@kaihuman/core';
import { MonoLabel, MonoText } from '../Atoms/Typography';

/**
 * Count of edits that are saved on this device but have not reached GitHub yet. Hidden at zero so
 * a healthy session shows nothing; a number that stays up means sync is failing or offline.
 */
export function UnsyncedIndicator() {
  const count = githubFileStore.unsyncedCount.value;
  if (count === 0) return null;
  return (
    <div
      className="hidden md:flex items-center gap-2 whitespace-nowrap"
      title={`${count} ${count === 1 ? 'file has' : 'files have'} edits waiting to reach GitHub. They are saved on this device and sync automatically when a connection is available.`}
    >
      <MonoLabel className="text-[9px]">UNSYNCED</MonoLabel>
      <MonoText className="text-[10px] text-[var(--los-accent)]">{count}</MonoText>
    </div>
  );
}
