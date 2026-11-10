import { Stack } from 'expo-router';
import { useTabRootOptions } from '../../../src/navigation/stack-options.js';

export default function SearchLayout() {
  const options = useTabRootOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen name="index" options={{ title: 'Search' }} />
    </Stack>
  );
}
