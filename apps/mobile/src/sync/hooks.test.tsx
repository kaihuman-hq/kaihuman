import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const runtime = vi.hoisted(() => ({
  refreshAll: vi.fn(async (_opts?: unknown) => {}),
  requestFocusRefresh: vi.fn(),
  resolveConflict: vi.fn(),
}));
vi.mock('./runtime.js', () => runtime);
vi.mock('expo-router', () => ({
  useFocusEffect: (cb: () => void) => {
    useEffect(cb, []);
  },
}));

import { haptics } from '../ui/haptics.js';
import { useFocusRefresh, useRefresh, useSyncRevision, useSyncStatus } from './hooks.js';
import { initialSyncStatus, syncRevision, syncStatus } from './status.js';

beforeEach(() => {
  runtime.refreshAll.mockClear();
  runtime.requestFocusRefresh.mockClear();
});
afterEach(cleanup);

describe('useRefresh', () => {
  it('pulls with haptic, toggles refreshing and ignores a double pull', async () => {
    const light = vi.spyOn(haptics, 'light');
    let done!: () => void;
    runtime.refreshAll.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          done = r;
        }),
    );
    const { result } = renderHook(() => useRefresh());
    expect(result.current.refreshing).toBe(false);
    act(() => result.current.onRefresh());
    act(() => result.current.onRefresh());
    expect(result.current.refreshing).toBe(true);
    expect(runtime.refreshAll).toHaveBeenCalledTimes(1);
    expect(runtime.refreshAll).toHaveBeenCalledWith({ reason: 'pull' });
    expect(light).toHaveBeenCalledTimes(1);
    await act(async () => done());
    await waitFor(() => expect(result.current.refreshing).toBe(false));
  });

  it('does not set state after unmount', async () => {
    let done!: () => void;
    runtime.refreshAll.mockImplementationOnce(
      () =>
        new Promise<void>((r) => {
          done = r;
        }),
    );
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { result, unmount } = renderHook(() => useRefresh());
    act(() => result.current.onRefresh());
    unmount();
    await act(async () => done());
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('signal hooks', () => {
  it('tracks the revision and status', () => {
    const rev = renderHook(() => useSyncRevision());
    const st = renderHook(() => useSyncStatus());
    expect(st.result.current).toBe(initialSyncStatus);
    act(() => {
      syncRevision.value = rev.result.current + 1;
      syncStatus.value = { ...initialSyncStatus, pending: 3 };
    });
    expect(rev.result.current).toBe(1);
    expect(st.result.current.pending).toBe(3);
  });
});

describe('useFocusRefresh', () => {
  it('requests a focus refresh', () => {
    renderHook(() => useFocusRefresh());
    expect(runtime.requestFocusRefresh).toHaveBeenCalledTimes(1);
  });
});
