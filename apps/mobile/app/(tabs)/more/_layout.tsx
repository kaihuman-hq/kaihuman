import { Stack } from 'expo-router';
import { useTabRootOptions } from '../../../src/navigation/stack-options.js';

export default function MoreLayout() {
  const options = useTabRootOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'More' }} />
      <Stack.Screen name="notifications" options={{ title: 'Notifications' }} />
    </Stack>
  );
}
