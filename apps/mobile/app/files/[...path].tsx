import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { fileKindForPath, hasViewer } from '../../src/files/file-kinds.js';
import { FileEditorController } from '../../src/screens/file-editor-screen.js';
import { FileEditorView, type FileMode } from '../../src/views/file-editor-view.js';
import { FileModeToggle } from '../../src/views/file-mode-toggle.js';

export default function FileRoute() {
  const params = useLocalSearchParams<{ path: string | string[] }>();
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  const controller = useMemo(() => new FileEditorController(), []);
  const [mode, setMode] = useState<FileMode>('view');
  const viewable = hasViewer(fileKindForPath(path).view);
  return (
    <>
      <Stack.Screen
        options={{
          title: path.slice(path.lastIndexOf('/') + 1),
          headerBackTitle: 'Files',
          // Kinds without a viewer open straight in the editor, so there is nothing to toggle.
          headerRight: viewable
            ? () => <FileModeToggle mode={mode} onChange={setMode} />
            : undefined,
        }}
      />
      <FileEditorView controller={controller} path={path} mode={viewable ? mode : 'source'} />
    </>
  );
}
