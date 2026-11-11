import { describe, expect, it } from 'vitest';
import { optimisticWrite } from './optimistic.js';

describe('optimisticWrite', () => {
  it('shows the change before the save settles', async () => {
    let shown = 'old';
    let release = () => {};
    const done = optimisticWrite({
      apply: () => {
        const prev = shown;
        shown = 'new';
        return prev;
      },
      write: () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
      rollback: (prev) => {
        shown = prev;
      },
    });
    expect(shown).toBe('new');
    release();
    await done;
    expect(shown).toBe('new');
  });

  it('rolls back and rejects when the save fails', async () => {
    let shown = 'old';
    await expect(
      optimisticWrite({
        apply: () => {
          const prev = shown;
          shown = 'new';
          return prev;
        },
        write: async () => {
          throw new Error('disk full');
        },
        rollback: (prev) => {
          shown = prev;
        },
      }),
    ).rejects.toThrow('disk full');
    expect(shown).toBe('old');
  });
});
