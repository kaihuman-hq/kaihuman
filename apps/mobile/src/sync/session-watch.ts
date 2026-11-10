import { effect, untracked } from '@preact/signals';

/**
 * Calls `onChange` whenever a signed-in session (token and repository) appears or changes after
 * start-up: sign-in, re-login with a new token, a repository switch. Start-up itself is the
 * scheduler's 'launch' run. Without this, a new sign-in waited for a poll or a manual sync.
 */
export function watchSession(
  read: () => readonly [token: string | null, repo: string | null],
  onChange: () => void,
): () => void {
  let first = true;
  let last: string | null = null;
  return effect(() => {
    const [token, repo] = read();
    const key = token && repo ? `${repo}\n${token}` : null;
    const changed = key !== null && key !== last;
    last = key;
    if (first) {
      first = false;
      return;
    }
    if (changed) untracked(onChange);
  });
}
