import type { ReadonlySignal } from '@preact/signals';
import { useSyncExternalStore } from 'react';

/** Subscribes a React component to a Preact signal; re-renders when it changes. */
export function useSignalValue<T>(s: ReadonlySignal<T>): T {
  // `subscribe` fires immediately; useSyncExternalStore tolerates that (same snapshot).
  return useSyncExternalStore(
    (onChange) => s.subscribe(onChange),
    () => s.value,
    () => s.value,
  );
}
