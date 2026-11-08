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

  it('shows a polite caption and refreshes the relative time every 30 s', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
    set({ lastSyncedAt: Date.now() });
    render(<SyncStatusBanner />);
    expect(screen.getByText('Updated just now')).toBeTruthy();
    expect(document.querySelector('[aria-live="polite"]')).toBeTruthy();
    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.getByText('Updated 1 min ago')).toBeTruthy();
  });

  it('reacts to status changes', () => {
    render(<SyncStatusBanner />);
    act(() => set({ phase: 'offline', pending: 2 }));
    expect(screen.getByText('Offline · 2 changes pending')).toBeTruthy();
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
