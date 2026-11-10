import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSyncScheduler } from './scheduler.js';
import type { SyncTrigger } from './status.js';

interface Harness {
  calls: SyncTrigger[];
  gates: Array<(ok: boolean) => void>;
  results: boolean[];
  sched: ReturnType<typeof createSyncScheduler>;
}

/** `manual` runs hold until released, to observe coalescing; otherwise they resolve at once. */
const make = (opts: { manual?: boolean } = {}): Harness => {
  const h: Harness = { calls: [], gates: [], results: [], sched: undefined as never };
  h.sched = createSyncScheduler({
    run: (t) => {
      h.calls.push(t);
      if (opts.manual) return new Promise<boolean>((resolve) => h.gates.push(resolve));
      return Promise.resolve(h.results.shift() ?? true);
    },
    now: () => Date.now(),
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
  });
  return h;
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
});
afterEach(() => vi.useRealTimers());

describe('single flight and coalescing', () => {
  it('runs one at a time and joins passive triggers to the run in flight', async () => {
    const h = make({ manual: true });
    const first = h.sched.trigger('launch');
    const second = h.sched.trigger('foreground');
    expect(h.calls).toEqual(['launch']);
    h.gates[0]?.(true);
    await first;
    await second;
    expect(h.calls).toEqual(['launch']);
  });

  it('queues exactly one follow-up for pulls that arrive during a run', async () => {
    const h = make({ manual: true });
    const first = h.sched.trigger('launch');
    const a = h.sched.trigger('pull');
    const b = h.sched.trigger('pull');
    h.gates[0]?.(true);
    await vi.waitFor(() => expect(h.calls).toEqual(['launch', 'pull']));
    h.gates[1]?.(true);
    await Promise.all([first, a, b]);
    expect(h.calls).toEqual(['launch', 'pull']);
  });

  it('a write during a run also queues a follow-up', async () => {
    const h = make({ manual: true });
    void h.sched.trigger('launch');
    void h.sched.trigger('write');
    await vi.advanceTimersByTimeAsync(1_500);
    h.gates[0]?.(true);
    await vi.waitFor(() => expect(h.calls).toEqual(['launch', 'write']));
  });

  it('a run that throws counts as a failure and does not stall the scheduler', async () => {
    const sched = createSyncScheduler({
      run: vi.fn().mockRejectedValueOnce(new Error('x')).mockResolvedValue(true),
      now: () => Date.now(),
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
    });
    await sched.trigger('pull');
    expect(sched.lastSuccessAt()).toBeNull();
    await sched.trigger('pull');
    expect(sched.lastSuccessAt()).not.toBeNull();
  });
});

describe('throttle', () => {
  it('drops passive triggers within the throttle window but never pull or write', async () => {
    const h = make();
    await h.sched.trigger('launch');
    await h.sched.trigger('foreground');
    expect(h.calls).toEqual(['launch']);
    await h.sched.trigger('pull');
    expect(h.calls).toEqual(['launch', 'pull']);
    void h.sched.trigger('write');
    await vi.advanceTimersByTimeAsync(1_500);
    expect(h.calls).toEqual(['launch', 'pull', 'write']);
  });

  it('allows a passive trigger once the window has passed', async () => {
    const h = make();
    await h.sched.trigger('launch');
    await vi.advanceTimersByTimeAsync(2_000);
    await h.sched.trigger('foreground');
    expect(h.calls).toEqual(['launch', 'foreground']);
  });
});

describe('focus and staleness', () => {
  it('is stale before the first success and runs on focus', async () => {
    const h = make();
    expect(h.sched.isStale()).toBe(true);
    await h.sched.trigger('focus');
    expect(h.calls).toEqual(['focus']);
    expect(h.sched.lastSuccessAt()).toBe(Date.now());
    expect(h.sched.isStale()).toBe(false);
  });

  it('skips focus while fresh and runs it after 30 s', async () => {
    const h = make();
    await h.sched.trigger('pull');
    vi.setSystemTime(Date.now() + 29_000);
    await h.sched.trigger('focus');
    expect(h.calls).toEqual(['pull']);
    vi.setSystemTime(Date.now() + 2_000);
    expect(h.sched.isStale()).toBe(true);
    await h.sched.trigger('focus');
    expect(h.calls).toEqual(['pull', 'focus']);
  });

  it('a failed run does not refresh lastSuccessAt', async () => {
    const h = make();
    h.results.push(false);
    await h.sched.trigger('pull');
    expect(h.sched.lastSuccessAt()).toBeNull();
  });
});

describe('write debounce', () => {
  it('collapses a burst of writes into one run 1.5 s after the last', async () => {
    const h = make();
    void h.sched.trigger('write');
    await vi.advanceTimersByTimeAsync(1_000);
    void h.sched.trigger('write');
    await vi.advanceTimersByTimeAsync(1_000);
    expect(h.calls).toEqual([]);
    await vi.advanceTimersByTimeAsync(500);
    expect(h.calls).toEqual(['write']);
  });
});

describe('online and offline', () => {
  it('runs nothing while offline, then runs on online', async () => {
    const h = make();
    h.sched.setOnline(false);
    await h.sched.trigger('pull');
    await h.sched.trigger('launch');
    void h.sched.trigger('write');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.calls).toEqual([]);
    h.sched.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['online']);
  });

  it('background always runs, even offline', async () => {
    const h = make();
    h.sched.setOnline(false);
    await h.sched.trigger('background');
    expect(h.calls).toEqual(['background']);
  });

  it('only an offline to online edge triggers online', async () => {
    const h = make();
    h.sched.setOnline(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual([]);
  });
});

describe('foreground', () => {
  it('triggers foreground on the inactive to active edge only', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['foreground']);
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['foreground']);
  });
});

describe('foreground after a long background', () => {
  it('queues a fresh run behind one iOS froze while suspended, when data is > 2 min old', async () => {
    const h = make({ manual: true });
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    h.gates[0]?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['foreground']);
    h.sched.setActive(false);
    void h.sched.trigger('background'); // started just before suspension, never answers
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 3 * 60_000);
    h.sched.setActive(true);
    h.gates[1]?.(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['foreground', 'background', 'foreground']);
  });

  it('joins the run in flight when data is fresh', async () => {
    const h = make({ manual: true });
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    h.gates[0]?.(true);
    await vi.advanceTimersByTimeAsync(0);
    h.sched.setActive(false);
    void h.sched.trigger('background');
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 30_000);
    h.sched.setActive(true);
    h.gates[1]?.(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['foreground', 'background']);
  });
});

describe('leaving the foreground', () => {
  it('pushes a debounced edit at once instead of after iOS suspends the app', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    vi.setSystemTime(Date.now() + 10_000);
    void h.sched.trigger('write');
    h.sched.setActive(false);
    await vi.advanceTimersByTimeAsync(0);
    expect(h.calls).toEqual(['foreground', 'write']);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.calls).toEqual(['foreground', 'write']);
  });

  it('starts nothing when no edit is waiting', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    h.sched.setActive(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(h.calls).toEqual(['foreground']);
  });
});

describe('polling', () => {
  it('polls every 60 s while active, online and not in low power mode', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls).toEqual(['foreground', 'poll']);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls).toEqual(['foreground', 'poll', 'poll']);
  });

  it('does not poll in the background', async () => {
    const h = make();
    await h.sched.trigger('launch');
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.calls).toEqual(['launch']);
  });

  it('stops polling when the app goes inactive', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    h.sched.setActive(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.calls).toEqual(['foreground']);
  });

  it('pauses in low power mode and resumes after', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    h.sched.setLowPower(true);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.calls).toEqual(['foreground']);
    h.sched.setLowPower(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls).toEqual(['foreground', 'poll']);
  });

  it('pauses while offline', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    h.sched.setOnline(false);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(h.calls).toEqual(['foreground']);
  });

  it('doubles the delay on failure up to 10 min and resets on success', async () => {
    const h = make();
    h.results.push(false, false, false, false, false, false, false);
    h.sched.setActive(true); // foreground fails -> 120 s
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(119_000);
    expect(h.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1_000); // poll fails -> 240 s
    expect(h.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(240_000); // fails -> 480 s
    expect(h.calls).toHaveLength(3);
    await vi.advanceTimersByTimeAsync(480_000); // fails -> capped 600 s
    expect(h.calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(599_000);
    expect(h.calls).toHaveLength(4);
    await vi.advanceTimersByTimeAsync(1_000); // fails -> 600 s
    expect(h.calls).toHaveLength(5);
    h.results.length = 0; // next poll succeeds
    await vi.advanceTimersByTimeAsync(600_000);
    expect(h.calls).toHaveLength(6);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls).toHaveLength(7);
  });

  it('keeps polling after a poll that was throttled away', async () => {
    const h = make({ manual: false });
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    await h.sched.trigger('pull');
    await vi.advanceTimersByTimeAsync(60_000);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(h.calls.filter((c) => c === 'poll').length).toBeGreaterThanOrEqual(1);
  });
});

describe('dispose', () => {
  it('cancels timers and ignores later triggers', async () => {
    const h = make();
    h.sched.setActive(true);
    await vi.advanceTimersByTimeAsync(0);
    void h.sched.trigger('write');
    h.sched.dispose();
    await vi.advanceTimersByTimeAsync(300_000);
    await h.sched.trigger('pull');
    expect(h.calls).toEqual(['foreground']);
  });
});
