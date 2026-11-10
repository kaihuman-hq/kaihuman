import { signal } from '@preact/signals';
import { describe, expect, it, vi } from 'vitest';
import { watchSession } from './session-watch.js';

describe('watchSession', () => {
  it('syncs after sign-in, re-login and repo switch, not at start or sign-out', () => {
    // Regression: after signing in nothing synced until the user pressed sync.
    const token = signal<string | null>('t1');
    const repo = signal<string | null>('o/a');
    const onChange = vi.fn();
    const stop = watchSession(() => [token.value, repo.value], onChange);
    expect(onChange).not.toHaveBeenCalled();

    token.value = null; // sign-out
    expect(onChange).not.toHaveBeenCalled();
    token.value = 't2'; // sign-in
    expect(onChange).toHaveBeenCalledTimes(1);
    repo.value = 'o/b'; // repo switch
    expect(onChange).toHaveBeenCalledTimes(2);
    repo.value = null; // picking a repo after sign-in
    repo.value = 'o/b';
    expect(onChange).toHaveBeenCalledTimes(3);

    stop();
    token.value = 't3';
    expect(onChange).toHaveBeenCalledTimes(3);
  });
});
