import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { WikiScreenController, wikiPagePath } from '../../src/screens/wiki-screen.js';
import { WikiPageView } from '../../src/views/wiki-view.js';

export default function Route() {
  const params = useLocalSearchParams<{ page: string | string[] }>();
  const segments = Array.isArray(params.page) ? params.page : params.page ? [params.page] : [];
  const controller = useMemo(() => new WikiScreenController(), []);
  const [title, setTitle] = useState('Page');
  return (
    <>
      <Stack.Screen options={{ title }} />
      <WikiPageView controller={controller} path={wikiPagePath(segments)} onTitle={setTitle} />
    </>
  );
}
