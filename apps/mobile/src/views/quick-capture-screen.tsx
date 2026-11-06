import { Stack } from 'expo-router';
import { useMemo } from 'react';
import type { QuickKind } from '../navigation/routes.js';
import { QuickCaptureController } from '../screens/quick-capture.js';
import { QuickCaptureView } from './quick-capture-view.js';

/**
 * expo-router has no partial dynamic segments (`quick-[kind]` never matches), so each
 * `kaihuman://quick-<kind>` deep link gets its own static route file rendering this screen.
 */
export function QuickCaptureScreen({ kind }: { kind: QuickKind }) {
  const controller = useMemo(() => new QuickCaptureController(), []);
  return (
    <>
      <Stack.Screen options={{ title: `Quick ${kind}` }} />
      <QuickCaptureView controller={controller} kind={kind} />
    </>
  );
}
