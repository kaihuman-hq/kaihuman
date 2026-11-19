import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haptics } from '../ui/haptics.js';
import { useSignalValue } from '../views/use-signal.js';
import { refreshAll, requestFocusRefresh } from './runtime.js';
import { type SyncStatus, syncRevision, syncStatus } from './status.js';

export type SyncNowResult = { ok: true; at: number } | { ok: false; error: string };

/** Settings "Sync now": forces a full sync; `running` is true only while it runs. */
export function useSyncNow(): {
  running: boolean;
  result: SyncNowResult | null;
  syncNow: () => void;
} {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SyncNowResult | null>(null);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const syncNow = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    haptics.light();
    setRunning(true);
    setResult(null);
    // refreshAll never throws; the outcome is what the run left in the status.
    void refreshAll({ reason: 'pull' }).finally(() => {
      busy.current = false;
      if (!mounted.current) return;
      const { error } = syncStatus.peek();
      setResult(error ? { ok: false, error } : { ok: true, at: Date.now() });
      setRunning(false);
    });
  }, []);

  return { running, result, syncNow };
}

/** Changes after every sync run that may have changed data; add it to a load effect's deps. */
export function useSyncRevision(): number {
  return useSignalValue(syncRevision);
}

/** Refreshes when the screen gains focus; the scheduler decides whether data is stale. */
export function useFocusRefresh(): void {
  useFocusEffect(
    useCallback(() => {
      requestFocusRefresh();
    }, []),
  );
}

export function useSyncStatus(): SyncStatus {
  return useSignalValue(syncStatus);
}
