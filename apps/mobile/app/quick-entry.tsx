import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { githubContentFiles } from '../src/screens/file-editor-screen.js';
import { updateLoadedTile } from '../src/screens/loaded-tiles.js';
import { formHeaderOptions, type HeaderAction } from '../src/ui/index.js';
import { glanceForFile } from '../src/views/glance-for-file.js';
import { QuickEntryView } from '../src/views/quick-entry-view.js';

/** `/quick-entry?path=…`: the one-field sheet a ＋ menu Track entry opens. */
export default function QuickEntry() {
  const { path } = useLocalSearchParams<{ path?: string }>();
  const router = useRouter();
  const dismiss = useCallback(
    () => (router.canGoBack() ? router.back() : router.replace('/dashboard')),
    [router],
  );
  const [action, setAction] = useState<HeaderAction | null>(null);
  return (
    <>
      {/* HIG: Cancel top-left, Add top-right; the view reports its validity and submit. */}
      <Stack.Screen
        options={formHeaderOptions({
          title: 'Quick entry',
          onCancel: dismiss,
          action: action ?? { label: 'Add', disabled: true, onPress: () => {} },
        })}
      />
      {path ? (
        <QuickEntryView
          key={path}
          path={path}
          files={githubContentFiles}
          glanceFor={glanceForFile}
          onSaved={updateLoadedTile}
          onDone={dismiss}
          onHeaderAction={setAction}
        />
      ) : null}
    </>
  );
}
