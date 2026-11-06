import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Haptics are garnish: never let a missing engine or a web build break an interaction.
function fire(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
  try {
    run().catch(() => {});
  } catch {
    // ignore
  }
}

export const haptics = {
  selection: () => fire(() => Haptics.selectionAsync()),
  light: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)),
  medium: () => fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)),
  success: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)),
  warning: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)),
  error: () => fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)),
};
