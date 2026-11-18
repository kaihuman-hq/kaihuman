import { Stack, useRouter } from 'expo-router';
import { useMemo } from 'react';
import { BraindumpsScreenController } from '../src/screens/braindumps-screen.js';
import { BraindumpsView } from '../src/views/braindumps-view.js';

export default function Braindumps() {
  const router = useRouter();
  const controller = useMemo(() => new BraindumpsScreenController(), []);
  return (
    <>
      <Stack.Screen options={{ title: 'Braindumps', headerBackTitle: 'More' }} />
      <BraindumpsView
        controller={controller}
        onNew={() => router.push('/quick-braindump')}
        onOpen={(path) =>
          router.push(`/files/${path.split('/').map(encodeURIComponent).join('/')}` as never)
        }
      />
    </>
  );
}
