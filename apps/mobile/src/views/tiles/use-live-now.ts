import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { msToNextBoundary } from '../../components/widgets/timetracking-tile.js';

/**
 * The current time, re-read on each `unitMs` boundary (so a minute display flips exactly on the
 * minute). Ticking stops while the app is backgrounded and resumes, with an immediate refresh,
 * when it returns. `start` only seeds the first render so callers stay deterministic.
 */
export function useLiveNow(start: Date, unitMs = 60_000): Date {
  const [now, setNow] = useState(start);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = () => {
      if (timer !== undefined) clearTimeout(timer);
      timer = undefined;
    };
    const schedule = () => {
      stop();
      // Chained timeouts re-align after every tick, so drift never accumulates.
      timer = setTimeout(
        () => {
          setNow(new Date());
          schedule();
        },
        msToNextBoundary(Date.now(), unitMs),
      );
    };
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setNow(new Date());
        schedule();
      } else stop();
    });
    if (AppState.currentState !== 'background' && AppState.currentState !== 'inactive') schedule();
    return () => {
      stop();
      sub.remove();
    };
  }, [unitMs]);
  return now;
}
