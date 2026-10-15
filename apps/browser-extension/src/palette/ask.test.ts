import { describe, expect, it, vi } from 'vitest';
import { askHandler } from './ask';

const PAGE = { url: 'https://example.com/a', title: 'A page' };

describe('askHandler', () => {
  it('asks the worker, and runs the answer through it on choosing', async () => {
    const send = vi.fn(async (message: { type: string }) =>
      message.type === 'INTENT_PARSE'
        ? { intent: { action: 'log', description: '30m', tags: [] }, preview: 'Log: 30m' }
        : { success: true },
    );
    const item = await askHandler(send, () => PAGE)('log 30m on payments');
    expect(send).toHaveBeenCalledWith({
      type: 'INTENT_PARSE',
      text: 'log 30m on payments',
      ...PAGE,
    });
    expect(item?.title).toBe('Log: 30m');
    expect(await item?.action?.run?.([])).toBe('Done: Log: 30m');
    expect(send).toHaveBeenLastCalledWith({
      type: 'INTENT_RUN',
      intent: { action: 'log', description: '30m', tags: [] },
      ...PAGE,
      reuse: false,
    });
    expect(item?.action?.closes).toBeFalsy();
    expect(item?.action?.recent).toBe(false);
  });

  it('closes the palette for a bookmark, which opens a page', async () => {
    const send = vi.fn(async () => ({
      intent: { action: 'open-bookmark', bookmarkId: 'b1' },
      preview: 'Open Vitest guide',
    }));
    const item = await askHandler(send, () => PAGE, { reuse: true })('open the vitest guide');
    expect(item?.action?.closes).toBe(true);
  });

  it('is null when the worker has no intent or fails', async () => {
    expect(
      await askHandler(
        async () => ({ intent: null }),
        () => PAGE,
      )('a b c'),
    ).toBeNull();
    expect(
      await askHandler(
        async () => {
          throw new Error('no worker');
        },
        () => PAGE,
      )('a b c'),
    ).toBeNull();
  });
});
