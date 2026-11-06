import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { FileEditorController } from '../../src/screens/file-editor-screen.js';
import { FileEditorView } from '../../src/views/file-editor-view.js';

export default function FileRoute() {
  const params = useLocalSearchParams<{ path: string | string[] }>();
  const path = Array.isArray(params.path) ? params.path.join('/') : (params.path ?? '');
  const controller = useMemo(() => new FileEditorController(), []);
  return (
    <>
      <Stack.Screen
        options={{ title: path.slice(path.lastIndexOf('/') + 1), headerBackTitle: 'Files' }}
      />
      <FileEditorView controller={controller} path={path} />
    </>
  );
}
