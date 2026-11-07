import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { FileEditorController } from '../../src/screens/file-editor-screen.js';
import { FileBrowserView } from '../../src/views/file-editor-view.js';

export default function Files() {
  const router = useRouter();
  const controller = useMemo(() => new FileEditorController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Files', headerBackTitle: 'More' }} />
      <FileBrowserView
        controller={controller}
        onOpenFile={(path) =>
          router.push(`/files/${path.split('/').map(encodeURIComponent).join('/')}`)
        }
      />
    </>
  );
}
