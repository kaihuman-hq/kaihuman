import type { ReactNode } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

/** Gesture handlers (swipe actions) only work beneath this root, so mount it once at the app root. */
export function GestureRoot({ children }: { children: ReactNode }) {
  return <GestureHandlerRootView style={{ flex: 1 }}>{children}</GestureHandlerRootView>;
}
