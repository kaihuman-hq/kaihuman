import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { installAutoSync } from './auto-sync.js';

const setup = () => {
  const calls: string[] = [];
  const store = {
    syncNow: vi.fn(async () => {
      calls.push('sync');
      return 'synced' as const;
    }),
    flushOutbox: vi.fn(async () => {
      calls.push('flush');
    }),
  };
  const win = new EventTarget() as unknown as Window;
  const doc = Object.assign(new EventTarget(), {
    visibilityState: 'visible',
  }) as unknown as Document & {
    visibilityState: string;
  };
  return { store, win, doc, calls };
};
const flush = () => vi.advanceTimersByTimeAsync(0);

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe('installAutoSync', () => {
  it('runs once on install: sync, then flush', async () => {
    const { store, win, doc, calls } = setup();
    installAutoSync(store, { win, doc });
    await flush();
    expect(calls).toEqual(['sync', 'flush']);
  });

  it('runs on visible, focus and online, but not when hidden', async () => {
    const { store, win, doc } = setup();
    installAutoSync(store, { win, doc });
    await vi.advanceTimersByTimeAsync(2100);
    store.syncNow.mockClear();

    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await flush();
    expect(store.syncNow).not.toHaveBeenCalled();

    doc.visibilityState = 'visible';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(2100);
    win.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(2100);
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(store.syncNow).toHaveBeenCalledTimes(3);
    expect(store.flushOutbox).toHaveBeenCalledTimes(4);
  });

  it('throttles triggers within 2 s of the last run', async () => {
    const { store, win, doc } = setup();
    installAutoSync(store, { win, doc });
    await flush();
    win.dispatchEvent(new Event('focus'));
    win.dispatchEvent(new Event('online'));
    await flush();
    expect(store.syncNow).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2100);
    win.dispatchEvent(new Event('focus'));
    await flush();
    expect(store.syncNow).toHaveBeenCalledTimes(2);
  });

  it('polls on the interval only while visible', async () => {
    const { store, win, doc } = setup();
    installAutoSync(store, { win, doc, intervalMs: 10_000 });
    await flush();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(store.syncNow).toHaveBeenCalledTimes(2);
    doc.visibilityState = 'hidden';
    await vi.advanceTimersByTimeAsync(30_000);
    expect(store.syncNow).toHaveBeenCalledTimes(2);
  });

  it('logs and swallows errors', async () => {
    const { store, win, doc } = setup();
    store.syncNow.mockRejectedValueOnce(new Error('offline'));
    installAutoSync(store, { win, doc });
    await flush();
    expect(store.syncNow).toHaveBeenCalledTimes(1);
  });

  it('the disposer removes listeners and the interval', async () => {
    const { store, win, doc } = setup();
    const dispose = installAutoSync(store, { win, doc, intervalMs: 10_000 });
    await flush();
    dispose();
    await vi.advanceTimersByTimeAsync(5000);
    win.dispatchEvent(new Event('focus'));
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(store.syncNow).toHaveBeenCalledTimes(1);
  });
});
