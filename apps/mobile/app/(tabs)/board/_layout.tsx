import { Stack } from 'expo-router';
import { SearchButton } from '../../../src/navigation/search-button.js';
import { useTabRootOptions } from '../../../src/navigation/stack-options.js';
import { webBackOptions } from '../../../src/navigation/web-back-button.js';

export default function BoardLayout() {
  const options = useTabRootOptions();
  return (
    <Stack screenOptions={options}>
      <Stack.Screen
        name="index"
        options={{ title: 'Board', headerRight: () => <SearchButton /> }}
      />
      <Stack.Screen
        name="todo"
        options={{
          title: 'Todo',
          // Free-form titles live in the form, so keep a standard inline header; the web preview
          // needs its header back because tab roots hide it.
          headerShown: true,
          headerLargeTitle: false,
          ...webBackOptions('/board'),
        }}
      />
    </Stack>
  );
}
