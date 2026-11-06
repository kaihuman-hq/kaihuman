import { Stack, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { IdeasScreenController } from '../../../src/screens/ideas-screen.js';
import { IdeasView } from '../../../src/views/ideas-view.js';

export default function Route() {
  const { status } = useLocalSearchParams<{ status?: string | string[] }>();
  const raw = Array.isArray(status) ? status[0] : status;
  const controller = useMemo(() => {
    const c = new IdeasScreenController();
    c.applyLinkStatus(raw);
    return c;
  }, [raw]);
  return (
    <>
      <Stack.Screen options={{ title: 'Ideas' }} />
      <IdeasView controller={controller} />
    </>
  );
}
