import { Stack } from 'expo-router';
import { useTabRootOptions } from '../../../src/navigation/stack-options.js';
import { webBackOptions } from '../../../src/navigation/web-back-button.js';

export default function IdeasLayout() {
  const options = useTabRootOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Ideas' }} />
      <Stack.Screen
        name="[slug]"
        options={{
          title: 'Idea',
          // Idea titles are long and free-form, so the detail keeps a standard inline title,
          // and the web preview needs its header back (tab roots hide it).
          headerShown: true,
          headerLargeTitle: false,
          ...webBackOptions('/ideas'),
        }}
      />
    </Stack>
  );
}
