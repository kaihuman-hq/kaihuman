import { localDate } from '@kaihuman/formats';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { githubContentFiles } from '../screens/file-editor-screen.js';
import { useFocusRefresh, useRefresh, useSyncRevision } from '../sync/hooks.js';
import { type BusinessState, loadBusiness } from './load.js';
import { type BusinessWriter, businessWriter, type Outcome } from './write.js';

/** Business records for a screen: loads from the local cache and re-reads after every sync. */
export function useBusiness() {
  const [state, setState] = useState<BusinessState | null>(null);
  const [now, setNow] = useState(() => new Date());
  const { refreshing, onRefresh } = useRefresh();
  const rev = useSyncRevision();
  useFocusRefresh();

  const reload = useCallback(async () => {
    const next = await loadBusiness(githubContentFiles);
    setState(next);
    setNow(new Date());
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: `rev` re-reads after a sync
  useEffect(() => {
    let cancelled = false;
    void githubContentFiles
      .refresh()
      .then(() => loadBusiness(githubContentFiles))
      .then((next) => {
        if (!cancelled) {
          setState(next);
          setNow(new Date());
        }
      });
    return () => {
      cancelled = true;
    };
  }, [rev]);

  const writer: BusinessWriter = useMemo(() => businessWriter(githubContentFiles), []);
  /** Runs a write, re-reads, and reports a refusal; resolves true on success. */
  const act = useCallback(
    async (write: (w: BusinessWriter) => Promise<Outcome>): Promise<boolean> => {
      const outcome = await write(writer);
      if (!outcome.ok) {
        showError(outcome.message);
        return false;
      }
      await reload();
      return true;
    },
    [writer, reload],
  );

  return { state, now, today: localDate(now), refreshing, onRefresh, act };
}

function showError(message: string) {
  // Alert.alert is a no-op on web.
  if (Platform.OS === 'web') console.warn(message);
  else Alert.alert('Not saved', message);
}
