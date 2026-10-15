import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let store: Record<string, unknown>;

/** A fresh module per test: the job registry is module state. */
const load = async () => {
  vi.resetModules();
  const precompute = await import('./precompute');
  const settings = await import('./settings');
  return { ...precompute, ...settings };
};

beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        },
      },
    },
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('runPrecompute', () => {
  it('runs registered jobs in order', async () => {
    const { registerPrecompute, runPrecompute } = await load();
    const log: string[] = [];
    registerPrecompute({ id: 'a', group: 'newTab', run: async () => void log.push('a') });
    registerPrecompute({ id: 'b', group: 'sidePanel', run: async () => void log.push('b') });
    registerPrecompute({ id: 'c', group: 'tabs', run: async () => void log.push('c') });
    await runPrecompute('alarm');
    expect(log).toEqual(['a', 'b', 'c']);
  });

  it('skips jobs whose group is off', async () => {
    const { registerPrecompute, runPrecompute, writeAiSettings } = await load();
    await writeAiSettings({ newTab: false });
    const log: string[] = [];
    registerPrecompute({ id: 'a', group: 'newTab', run: async () => void log.push('a') });
    registerPrecompute({ id: 'b', group: 'palette', run: async () => void log.push('b') });
    await runPrecompute('today');
    expect(log).toEqual(['b']);
  });

  it('one failing job does not stop the rest', async () => {
    const { registerPrecompute, runPrecompute } = await load();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const log: string[] = [];
    registerPrecompute({
      id: 'a',
      group: 'newTab',
      run: async () => {
        throw new Error('boom');
      },
    });
    registerPrecompute({ id: 'b', group: 'newTab', run: async () => void log.push('b') });
    await expect(runPrecompute('work')).resolves.toBeUndefined();
    expect(log).toEqual(['b']);
  });

  it('a second runPrecompute while one runs is coalesced', async () => {
    const { registerPrecompute, runPrecompute } = await load();
    let runs = 0;
    let finish: () => void = () => {};
    registerPrecompute({
      id: 'slow',
      group: 'newTab',
      run: () =>
        new Promise<void>((resolve) => {
          runs++;
          finish = resolve;
        }),
    });
    const started = async (count: number) => {
      while (runs < count) await new Promise((resolve) => setTimeout(resolve, 0));
    };
    const first = runPrecompute('alarm');
    const second = runPrecompute('today');
    await started(1);
    finish();
    await Promise.all([first, second]);
    expect(runs).toBe(1);
    // Once it is done, the next call runs again.
    const third = runPrecompute('alarm');
    await started(2);
    finish();
    await third;
    expect(runs).toBe(2);
  });
});

describe('the work throttle', () => {
  it('work and today triggers run at most once per 10 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    const start = new Date('2026-10-15T10:00:00.000Z').getTime();
    vi.setSystemTime(start);
    const { registerPrecompute, runPrecompute } = await load();
    let runs = 0;
    registerPrecompute({ id: 'a', group: 'newTab', run: async () => void runs++ });
    await runPrecompute('work');
    vi.setSystemTime(start + 60_000);
    await runPrecompute('work');
    expect(runs).toBe(1);
    // A start page sync is throttled the same way: every new tab can bring one.
    await runPrecompute('today');
    expect(runs).toBe(1);
    // The hourly alarm always runs.
    await runPrecompute('alarm');
    expect(runs).toBe(2);
    // Any run restarts the clock; eleven minutes after the last one, both run again.
    vi.setSystemTime(start + 11 * 60_000);
    await runPrecompute('today');
    expect(runs).toBe(3);
    vi.setSystemTime(start + 22 * 60_000);
    await runPrecompute('work');
    expect(runs).toBe(4);
    vi.useRealTimers();
  });

  it('remembers the last run across a worker restart', async () => {
    const first = await load();
    let runs = 0;
    first.registerPrecompute({ id: 'a', group: 'newTab', run: async () => void runs++ });
    await first.runPrecompute('work');
    const restarted = await load();
    restarted.registerPrecompute({ id: 'a', group: 'newTab', run: async () => void runs++ });
    await restarted.runPrecompute('work');
    expect(runs).toBe(1);
  });
});

describe('AI settings', () => {
  it('fills in defaults and keeps what was stored', async () => {
    const { readAiSettings, writeAiSettings, AI_SETTINGS_KEY } = await load();
    expect(await readAiSettings()).toEqual({
      newTab: true,
      enrichment: true,
      sidePanel: true,
      palette: true,
      tabs: true,
      inboxLabels: [],
    });
    await writeAiSettings({ tabs: false });
    await writeAiSettings({ palette: false });
    expect(store[AI_SETTINGS_KEY]).toMatchObject({ tabs: false, palette: false });
    expect(await readAiSettings()).toMatchObject({ tabs: false, palette: false, newTab: true });
  });

  it('keeps at most six inbox labels', async () => {
    const { readAiSettings, writeAiSettings } = await load();
    const labels = Array.from({ length: 8 }, (_, i) => ({ name: `l${i}`, hint: '', mute: false }));
    await writeAiSettings({ inboxLabels: labels });
    expect((await readAiSettings()).inboxLabels).toHaveLength(6);
  });

  it('reads stored inbox labels that are not a list as none', async () => {
    const { readAiSettings, AI_SETTINGS_KEY } = await load();
    store[AI_SETTINGS_KEY] = { inboxLabels: 'oops', tabs: false };
    expect(await readAiSettings()).toMatchObject({ inboxLabels: [], tabs: false });
  });

  it('keeps both of two writes made back to back', async () => {
    const { readAiSettings, writeAiSettings } = await load();
    await Promise.all([writeAiSettings({ tabs: false }), writeAiSettings({ palette: false })]);
    expect(await readAiSettings()).toMatchObject({ tabs: false, palette: false });
  });
});

describe('the background helpers', () => {
  it('creates the hourly alarm only when it is missing', async () => {
    const { ensureAiAlarm } = await load();
    const create = vi.fn(async () => {});
    let existing: object | undefined;
    vi.stubGlobal('chrome', { alarms: { get: async () => existing, create } });
    await ensureAiAlarm();
    expect(create).toHaveBeenCalledWith('ai', { periodInMinutes: 60 });
    existing = { name: 'ai' };
    await ensureAiAlarm();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('a background run never throws at its caller', async () => {
    const { registerPrecompute, precomputeInBackground } = await load();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.stubGlobal('chrome', {
      storage: {
        local: {
          get: async () => {
            throw new Error('storage gone');
          },
        },
      },
    });
    registerPrecompute({ id: 'a', group: 'newTab', run: async () => {} });
    expect(() => precomputeInBackground('today')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(warn).toHaveBeenCalled();
  });
});
