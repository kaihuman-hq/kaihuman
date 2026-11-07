import { useRouter } from 'expo-router';
import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { Platform, Pressable } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon } from '../ui/index.js';

function WebBackButton({ fallback }: { fallback: string }) {
  const router = useRouter();
  const { metrics } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Back"
      hitSlop={(metrics.hitTarget - 22) / 2}
      // A deep link has no history to pop, so go to the screen's parent instead.
      onPress={() => (router.canGoBack() ? router.back() : router.replace(fallback as never))}
    >
      <Icon name="chevronLeft" size={22} />
    </Pressable>
  );
}

/**
 * Header options that give a pushed screen a back control on the web preview, where the
 * native stack draws none. Native platforms keep their own back button.
 */
export function webBackOptions(fallback: string): NativeStackNavigationOptions {
  if (Platform.OS !== 'web') return {};
  return { headerLeft: () => <WebBackButton fallback={fallback} /> };
}
