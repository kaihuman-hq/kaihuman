import { asIdeaSlug } from '@kaihuman/formats';
import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { IdeasScreenController } from '../../../src/screens/ideas-screen.js';
import { EmptyState, Screen } from '../../../src/ui/index.js';
import { IdeaDetailView } from '../../../src/views/ideas-view.js';

export default function Route() {
  const params = useLocalSearchParams<{ slug: string | string[] }>();
  const raw = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const slug = raw ? asIdeaSlug(raw) : null;
  const controller = useMemo(() => new IdeasScreenController(), []);
  const [title, setTitle] = useState('Idea');
  if (!slug) {
    return (
      <Screen>
        <EmptyState icon="ideas" title="Idea not found" message="That link isn't an idea." />
      </Screen>
    );
  }
  return (
    <>
      <Stack.Screen options={{ title }} />
      <IdeaDetailView controller={controller} slug={slug} onTitle={setTitle} />
    </>
  );
}
