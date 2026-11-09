import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon } from '../ui/index.js';

/** Header entry to global search, shared by the tab roots that offer it. */
export function SearchButton() {
  const router = useRouter();
  const { metrics } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Search"
      hitSlop={(metrics.hitTarget - 22) / 2}
      onPress={() => router.push('/search')}
    >
      <Icon name="search" size={22} />
    </Pressable>
  );
}
