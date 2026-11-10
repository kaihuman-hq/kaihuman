import { githubFileStore, githubProfileStore } from '@kaihuman/core';
import { effect } from '@preact/signals';

/**
 * True once the current repo's tree is loaded (cache or network). Before that, a read of an
 * existing file returns null and a write creates it from scratch; the first loadTree then clears
 * open files, so a capture made in that window (a widget cold-launching the app) was lost.
 */
export const repoReady = (): boolean => {
  const repo = githubProfileStore.currentRepo.peek()?.full_name;
  return (
    !!repo && githubFileStore.loadedRepo.peek() === repo && githubFileStore.tree.peek().length > 0
  );
};

/** Resolves true when `repoReady()`, false after `timeoutMs`. */
export function whenRepoReady(timeoutMs = 20_000): Promise<boolean> {
  if (repoReady()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let settled = false;
    let stop: (() => void) | null = null;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      stop?.();
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), timeoutMs);
    stop = effect(() => {
      githubProfileStore.currentRepo.value;
      githubFileStore.loadedRepo.value;
      githubFileStore.tree.value;
      if (repoReady()) finish(true);
    });
    if (settled) stop();
  });
}
