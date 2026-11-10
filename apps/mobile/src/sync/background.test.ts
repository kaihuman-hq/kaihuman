import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  task: null as null | (() => Promise<unknown>),
  status: 1,
  register: vi.fn(async (_name: string, _opts: { minimumInterval: number }) => {}),
  bootstrap: vi.fn(),
  refreshAll: vi.fn(async (_opts: { reason: string }) => {}),
  failed: false,
}));

vi.mock('expo-task-manager', () => ({
  defineTask: (_name: string, fn: () => Promise<unknown>) => {
    h.task = fn;
  },
}));
vi.mock('expo-background-task', () => ({
  BackgroundTaskResult: { Success: 1, Failed: 2 },
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  getStatusAsync: async () => h.status,
  registerTaskAsync: h.register,
}));
vi.mock('../runtime/bootstrap.js', () => ({
  bootstrap: h.bootstrap,
  bootstrapReady: async () => undefined,
}));
vi.mock('./runtime.js', () => ({
  refreshAll: h.refreshAll,
  lastRunFailed: () => h.failed,
}));

const { BACKGROUND_SYNC_TASK, registerBackgroundSync } = await import('./background.js');

beforeEach(() => {
  h.register.mockClear();
  h.refreshAll.mockClear();
  h.failed = false;
  h.status = 2;
});

describe('background sync', () => {
  it('defines the task at module scope, before any component mounts', () => {
    expect(h.task).toBeTypeOf('function');
  });

  it('boots headless, then runs a full pull (which refreshes the widget snapshot)', async () => {
    expect(await h.task?.()).toBe(1);
    expect(h.bootstrap).toHaveBeenCalled();
    expect(h.refreshAll).toHaveBeenCalledWith({ reason: 'background' });
  });

  it('reports a failed run to the OS', async () => {
    h.failed = true;
    expect(await h.task?.()).toBe(2);
  });

  it('registers with the 15 min minimum when the OS allows background work', async () => {
    await registerBackgroundSync();
    expect(h.register).toHaveBeenCalledWith(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  });

  it('skips registration when Background App Refresh is off', async () => {
    h.status = 1;
    await registerBackgroundSync();
    expect(h.register).not.toHaveBeenCalled();
  });

  it('is configured in app.json (the plugin adds UIBackgroundModes and the BGTask identifier)', () => {
    const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8'));
    expect(app.expo.plugins).toContain('expo-background-task');
  });

  it('is imported first by the root layout, so a headless launch defines it', () => {
    const layout = readFileSync(new URL('../../app/_layout.tsx', import.meta.url), 'utf8');
    const firstImport = layout.split('\n').find((l) => l.startsWith('import '));
    expect(firstImport).toContain('src/sync/background.js');
  });
});
