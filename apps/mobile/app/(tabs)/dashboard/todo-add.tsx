import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { ErrorBoundary, Screen } from '../../../src/ui/index.js';
import { TodoAddSheet } from '../../../src/views/todo-add-sheet.js';

export default function TodoAdd() {
  const { path } = useLocalSearchParams<{ path: string }>();
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());
  // Add closes the sheet before its write settles; the screen is gone by then.
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  useEffect(() => {
    if (!path) return;
    githubContentFiles
      .read(path)
      .then((text) => setContent(text))
      .catch(() => router.back());
  }, [path, router]);

  const write = useCallback(async (file: string, next: string) => {
    await githubContentFiles.write(file, next);
    if (!mounted.current) return;
    setContent(next);
    setNow(new Date());
  }, []);

  return (
    <Screen keyboard scroll={false}>
      {path && content !== null ? (
        <ErrorBoundary what="this form" resetKey={content}>
          <TodoAddSheet
            path={path}
            content={content}
            now={now}
            onWrite={write}
            onClose={() => router.back()}
          />
        </ErrorBoundary>
      ) : null}
    </Screen>
  );
}
