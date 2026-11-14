import type { NativeStackNavigationOptions } from 'expo-router/native-stack';
import { Platform } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { SearchButton } from './search-button.js';

/**
 * Header chrome shared by every stack: themed colours, no shadow, left-aligned on Android, and a
 * search button so search is one tap from every pushed screen. Screens with their own right-hand
 * controls use `searchHeaderRight`; the search screen itself sets `headerRight: undefined`.
 */
export function useStackScreenOptions(): NativeStackNavigationOptions {
  const { colors, fontFamily, platform } = useTheme();
  return {
    contentStyle: { backgroundColor: colors.background },
    headerStyle: { backgroundColor: colors.background },
    headerTintColor: colors.accent,
    headerTitleStyle: { color: colors.label, fontFamily: fontFamily.system },
    headerShadowVisible: false,
    headerRight: SearchButton,
    headerTitleAlign: platform === 'android' ? 'left' : undefined,
    headerBackButtonDisplayMode: 'minimal',
    // iOS already pushes with the native slide; Android's default fade felt abrupt next to it.
    // The native stack skips the animation itself when the OS asks for reduced motion.
    animation: platform === 'android' ? 'slide_from_right' : 'default',
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
