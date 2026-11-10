import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback } from 'react';
import { githubContentFiles } from '../src/screens/file-editor-screen.js';
import { updateLoadedTile } from '../src/screens/loaded-tiles.js';
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
  return (
    <>
      <Stack.Screen options={{ title: 'Quick entry' }} />
      {path ? (
        <QuickEntryView
          key={path}
          path={path}
          files={githubContentFiles}
          glanceFor={glanceForFile}
          onSaved={updateLoadedTile}
          onDone={dismiss}
        />
      ) : null}
    </>
  );
}
