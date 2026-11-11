import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { initialSyncStatus, type SyncStatus, syncStatus } from './status.js';
import { SyncIndicator } from './sync-indicator.js';

const set = (patch: Partial<SyncStatus>) => {
  syncStatus.value = { ...initialSyncStatus, ...patch };
};

afterEach(() => {
  cleanup();
  set({});
});

describe('SyncIndicator', () => {
  it('shows an icon only while syncing, with no text', () => {
    set({ lastSyncedAt: Date.now() });
    const { container } = render(<SyncIndicator />);
    expect(screen.queryByTestId('sync-indicator')).toBeNull();
    act(() => set({ phase: 'syncing' }));
    expect(screen.getByTestId('sync-indicator')).toBeTruthy();
    expect(container.textContent).toBe('');
    act(() => set({ phase: 'idle', lastSyncedAt: Date.now() }));
    expect(screen.queryByTestId('sync-indicator')).toBeNull();
  });
});
