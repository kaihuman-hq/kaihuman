import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import type { QuickKind } from '../navigation/routes.js';
import { QuickCaptureController } from '../screens/quick-capture.js';
import { ErrorBoundary, HeaderButton } from '../ui/index.js';
import { CAPTURE_TITLES, type CaptureHeaderState, QuickCaptureView } from './quick-capture-view.js';

/**
 * expo-router has no partial dynamic segments (`quick-[kind]` never matches), so each
 * `kaihuman://quick-<kind>` deep link gets its own static route file rendering this screen.
 */
export function QuickCaptureScreen({
  kind,
  idea,
  text,
}: {
  kind: QuickKind;
  idea?: string;
  /** Prefill, e.g. from `kaihuman://quick-log?text=…` sent by Siri. */
  text?: string;
}) {
  const controller = useMemo(() => {
    const c = new QuickCaptureController();
    c.targetIdea = idea ?? null;
    return c;
  }, [idea]);
  const router = useRouter();
  const [header, setHeader] = useState<CaptureHeaderState | null>(null);
  // HIG: the primary action sits in the navigation bar on every platform.
  const headerAction = true;
  const dismiss = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/dashboard')),
    [router],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: CAPTURE_TITLES[kind],
          // The close control (Cancel) comes from the root layout.
          headerRight: () => (
            <HeaderButton
              label="Save"
              testID="capture-header-save"
              disabled={!header?.canSubmit}
              loading={header?.busy ?? false}
              onPress={() => header?.submit()}
            />
          ),
        }}
      />
      {/* A capture that fails to render shows an error card instead of closing the app. */}
      <ErrorBoundary what="this capture">
        <QuickCaptureView
          controller={controller}
          kind={kind}
          initialText={text}
          onDone={dismiss}
          headerAction={headerAction}
          onHeaderState={setHeader}
        />
      </ErrorBoundary>
    </>
  );
}
