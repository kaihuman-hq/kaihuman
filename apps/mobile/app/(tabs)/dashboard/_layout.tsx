import { Stack } from 'expo-router';
import { useTabRootOptions } from '../../../src/navigation/stack-options.js';
import { webBackOptions } from '../../../src/navigation/web-back-button.js';

export default function TodayLayout() {
  const options = useTabRootOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Today' }} />
      <Stack.Screen
        name="tile"
        options={{
          title: 'Tile',
          // Tab roots hide the header on web; the detail needs it for its title and back control.
          headerShown: true,
          headerLargeTitle: false,
          ...webBackOptions('/dashboard'),
        }}
      />
    </Stack>
  );
}
