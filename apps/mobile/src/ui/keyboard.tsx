import { HeaderHeightContext } from 'expo-router/react-navigation';
import { type ReactNode, useContext } from 'react';
import { KeyboardAvoidingView, Platform, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Expo 58 draws Android edge-to-edge, so the window no longer resizes for the keyboard and a
 * disabled KeyboardAvoidingView leaves fields under it. Padding works the same on both platforms.
 */
export const KEYBOARD_BEHAVIOR = 'padding' as const;

/**
 * On iOS a scroll view sets its own bottom inset to the keyboard overlap and scrolls the focused
 * field above it. Only for scroll views that nothing else lifts: a lifted one would be inset twice.
 */
export const keyboardScrollProps = (lifted: boolean) =>
  ({
    keyboardShouldPersistTaps: 'handled',
    automaticallyAdjustKeyboardInsets: Platform.OS === 'ios' && !lifted,
  }) as const;

/**
 * Lifts its children above the keyboard. `KeyboardAvoidingView` measures itself against its
 * parent, so under a navigation header the header height is added back as the offset; inside a
 * modal there is no header context and the offset stays 0.
 */
export function KeyboardLift({
  children,
  style,
  enabled = true,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  enabled?: boolean;
}) {
  const headerHeight = useContext(HeaderHeightContext) ?? 0;
  return (
    <KeyboardAvoidingView
      behavior={KEYBOARD_BEHAVIOR}
      keyboardVerticalOffset={headerHeight}
      enabled={enabled}
      style={[{ flex: 1 }, style]}
    >
      {children}
    </KeyboardAvoidingView>
  );
}
