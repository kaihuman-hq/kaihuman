import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  refreshAll: vi.fn(async (_opts?: unknown) => {}),
  requestFocusRefresh: vi.fn(),
  resolveConflict: vi.fn(),
}));
vi.mock('./runtime.js', () => runtime);

import { initialSyncStatus, type SyncStatus, syncStatus } from './status.js';
import { SyncStatusBanner } from './sync-status-banner.js';

const set = (patch: Partial<SyncStatus>) => {
  syncStatus.value = { ...initialSyncStatus, ...patch };
};

beforeEach(() => {
  vi.clearAllMocks();
  set({});
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('SyncStatusBanner', () => {
  it('renders nothing before the first sync', () => {
    const { container } = render(<SyncStatusBanner />);
    expect(container.textContent).toBe('');
  });

  it('stays silent for passive states', () => {
    vi.useFakeTimers();
    set({ lastSyncedAt: Date.now() });
    const { container } = render(<SyncStatusBanner />);
    expect(container.textContent).toBe('');
    act(() => set({ phase: 'offline', pending: 2 }));
    expect(container.textContent).toBe('');
    act(() => set({ phase: 'syncing' }));
    expect(container.textContent).toBe('');
  });

  it('offers Retry on errors', () => {
    set({ phase: 'error', error: 'Rate limited' });
    render(<SyncStatusBanner />);
    expect(screen.getByText('Rate limited')).toBeTruthy();
    fireEvent.click(screen.getByText('Retry'));
    expect(runtime.refreshAll).toHaveBeenCalledWith({ reason: 'pull' });
  });

  it('resolves every conflict with the chosen side', () => {
    set({ conflicts: ['a.md', 'b.md'] });
    render(<SyncStatusBanner />);
    expect(screen.getByText('2 files changed on GitHub and here')).toBeTruthy();
    fireEvent.click(screen.getByText('Keep mine'));
    expect(runtime.resolveConflict).toHaveBeenCalledWith('a.md', 'keep_local');
    expect(runtime.resolveConflict).toHaveBeenCalledWith('b.md', 'keep_local');
    fireEvent.click(screen.getByText('Use theirs'));
    expect(runtime.resolveConflict).toHaveBeenCalledWith('b.md', 'use_remote');
  });

  it('uses the singular for one file', () => {
    set({ conflicts: ['a.md'] });
    render(<SyncStatusBanner />);
    expect(screen.getByText('1 file changed on GitHub and here')).toBeTruthy();
  });
});
