import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { githubContentFiles } from '../../../src/screens/file-editor-screen.js';
import { Screen } from '../../../src/ui/index.js';
import { TodoAddSheet } from '../../../src/views/todo-add-sheet.js';

export default function TodoAdd() {
  const { path } = useLocalSearchParams<{ path: string }>();
  const router = useRouter();
  const [content, setContent] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    if (!path) return;
    githubContentFiles
      .read(path)
      .then((text) => setContent(text))
      .catch(() => router.back());
  }, [path, router]);

  const write = useCallback(async (file: string, next: string) => {
    await githubContentFiles.write(file, next);
    setContent(next);
    setNow(new Date());
  }, []);

  return (
    <Screen keyboard scroll={false}>
      {path && content !== null ? (
        <TodoAddSheet
          path={path}
          content={content}
          now={now}
          onWrite={write}
          onClose={() => router.back()}
        />
      ) : null}
    </Screen>
  );
}
