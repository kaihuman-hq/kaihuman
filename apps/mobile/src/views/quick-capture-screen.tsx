import { Stack, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import type { QuickKind } from '../navigation/routes.js';
import { QuickCaptureController } from '../screens/quick-capture.js';
import { useTheme } from '../theme/theme.js';
import { Button } from '../ui/index.js';
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
  const { platform } = useTheme();
  const [header, setHeader] = useState<CaptureHeaderState | null>(null);
  // The iOS sheet puts its primary action in the navigation bar; Android and web use a footer button.
  const headerAction = platform === 'ios' && Platform.OS !== 'web';
  const dismiss = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/dashboard')),
    [router],
  );

  return (
    <>
      <Stack.Screen
        options={{
          title: CAPTURE_TITLES[kind],
          // Android and web keep the close control the root layout supplies.
          ...(headerAction && {
            headerRight: () => (
              <Button
                label="Save"
                variant="plain"
                size="small"
                testID="capture-header-save"
                disabled={!header?.canSubmit}
                loading={header?.busy}
                onPress={() => header?.submit()}
              />
            ),
          }),
        }}
      />
      <QuickCaptureView
        controller={controller}
        kind={kind}
        initialText={text}
        onDone={dismiss}
        headerAction={headerAction}
        onHeaderState={setHeader}
      />
    </>
  );
}
