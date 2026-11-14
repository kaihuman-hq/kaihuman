import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
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

/**
 * A header's right side that keeps search one tap away next to a screen's own controls.
 * Search is pushed (never replaced), so back returns to the screen the user came from.
 */
export function searchHeaderRight(extra?: () => ReactNode) {
  return function HeaderRight() {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {extra?.()}
        <SearchButton />
      </View>
    );
  };
}
