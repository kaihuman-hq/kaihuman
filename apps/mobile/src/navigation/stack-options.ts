import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { Platform } from 'react-native';
import { useTheme } from '../theme/theme.js';

/** Header chrome shared by every stack: themed colours, no shadow, left-aligned on Android. */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const { colors, fontFamily, platform } = useTheme();
  return {
    contentStyle: { backgroundColor: colors.background },
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.label, fontFamily: fontFamily.system },
    headerShadowVisible: false,
    headerTitleAlign: platform === 'android' ? 'left' : undefined,
    headerBackButtonDisplayMode: 'minimal',
  };
}

/**
 * Options for a tab's root screen. The web preview hides the header because `Screen` draws
 * the large title inline there.
 */
export function useTabRootOptions(): NativeStackNavigationOptions {
  const base = useStackScreenOptions();
  const { colors, platform } = useTheme();
  if (Platform.OS === 'web') return { ...base, headerShown: false };
  if (platform === 'ios') {
    return {
      ...base,
      headerLargeTitle: true,
      headerLargeStyle: { backgroundColor: colors.background },
      headerLargeTitleShadowVisible: false,
      headerTransparent: false,
    };
  }
  return { ...base, headerTitleStyle: { ...base.headerTitleStyle, fontSize: 22 } };
}
