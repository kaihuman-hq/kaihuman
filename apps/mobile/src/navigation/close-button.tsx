import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon } from '../ui/index.js';

/** Header close control for modal screens; a swipe also dismisses the iOS sheet. */
export function CloseButton() {
  const router = useRouter();
  const { metrics } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Close"
      hitSlop={(metrics.hitTarget - 22) / 2}
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/dashboard'))}
    >
      <Icon name="close" size={22} />
    </Pressable>
  );
}
