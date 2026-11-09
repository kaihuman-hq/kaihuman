import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { haptics } from '../ui/haptics.js';
import { useSignalValue } from '../views/use-signal.js';
import { refreshAll, requestFocusRefresh } from './runtime.js';
import { type SyncStatus, syncRevision, syncStatus } from './status.js';

/** Pull-to-refresh: forces a sync; `refreshing` is true only while it runs. */
export function useRefresh(): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const busy = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    haptics.light();
    setRefreshing(true);
    void refreshAll({ reason: 'pull' }).finally(() => {
      busy.current = false;
      if (mounted.current) setRefreshing(false);
    });
  }, []);

  return { refreshing, onRefresh };
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
