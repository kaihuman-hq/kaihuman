import type { ReactNode } from 'react';
import { Alert, Modal, Pressable, ScrollView } from 'react-native';
import { useTheme } from '../../theme/theme.js';
import { KeyboardLift, Text } from '../../ui/index.js';

/**
 * A bottom sheet for editing one thing a tile shows: scrolls its content, dismisses on a tap
 * outside or the system back gesture. Footer buttons stay pinned below the scrolling part.
 */
export function TileSheet({
  title,
  onClose,
  children,
  footer,
  testID,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  testID?: string;
}) {
  const { colors, spacing, shape } = useTheme();
  return (
    <Modal transparent animationType="slide" onRequestClose={onClose} visible>
      <KeyboardLift>
        <Pressable
          accessibilityLabel="Close"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: '#0006', justifyContent: 'flex-end' }}
        >
          {/* Swallows presses so taps inside the sheet do not dismiss it. */}
          <Pressable
            accessible={false}
            testID={testID}
            style={{
              backgroundColor: colors.surface,
              maxHeight: '90%',
              padding: spacing.lg,
              gap: spacing.md,
              borderTopLeftRadius: shape.lg,
              borderTopRightRadius: shape.lg,
            }}
          >
            <Text variant="headline" accessibilityRole="header" numberOfLines={2}>
              {title}
            </Text>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.sm }}
            >
              {children}
            </ScrollView>
            {footer}
          </Pressable>
        </Pressable>
      </KeyboardLift>
    </Modal>
  );
}

/** Asks before a destructive action: a native alert with a red confirm button. */
export function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void,
) {
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: confirmLabel, style: 'destructive', onPress: onConfirm },
  ]);
}
