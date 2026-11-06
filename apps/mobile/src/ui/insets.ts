import { useContext } from 'react';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

const none = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Safe-area insets that degrade to zero without a provider (web preview, unit tests);
 * expo-router supplies the provider at runtime.
 */
export function useInsets() {
  return useContext(SafeAreaInsetsContext) ?? none;
}
