import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import type { QuickKind } from '../src/navigation/routes.js';
import { QuickCaptureController } from '../src/screens/quick-capture.js';
import { QuickCaptureView } from '../src/views/quick-capture-view.js';

export default function QuickCapture() {
  const { kind } = useLocalSearchParams<{ kind: QuickKind }>();
  const controller = useMemo(() => new QuickCaptureController(), []);
  return (
    <>
      <Stack.Screen options={{ title: `Quick ${kind}` }} />
      <QuickCaptureView controller={controller} kind={kind} />
    </>
  );
}
