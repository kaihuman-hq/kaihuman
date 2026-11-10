import { Stack } from 'expo-router';
import { SearchButton } from '../../../src/navigation/search-button.js';
import { useTabRootOptions } from '../../../src/navigation/stack-options.js';

export default function CaptureLayout() {
  const options = useTabRootOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen
        name="index"
        options={{ title: 'Capture', headerRight: () => <SearchButton /> }}
      />
    </Stack>
  );
}
