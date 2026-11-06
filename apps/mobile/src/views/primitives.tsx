import type { ReactNode } from 'react';
import { View } from 'react-native';
import { spacing } from '../theme/theme.js';
import {
  Text,
  TextField,
  Button as UiButton,
  Card as UiCard,
  Screen as UiScreen,
} from '../ui/index.js';

// Legacy view primitives, kept with their original signatures and re-implemented on the
// native design system so older views pick up the new look until they are rewritten.

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  return <UiScreen scroll={scroll}>{children}</UiScreen>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text variant="title2" accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return <Text variant="body">{children}</Text>;
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text variant="footnote" tone="secondary">
      {children}
    </Text>
  );
}

export function Button({
  label,
  onPress,
  disabled = false,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
}) {
  // Tinted, not filled: legacy views have many buttons per screen and a wall of solid
  // Volt drowns the content. Screens pick a filled primary action when restyled.
  return (
    <UiButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      variant="tinted"
      size="medium"
      fullWidth
    />
  );
}

export function Field({
  label,
  value,
  onChangeText,
  secureTextEntry,
  multiline,
  placeholder,
  testID,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  secureTextEntry?: boolean;
  multiline?: boolean;
  placeholder?: string;
  testID?: string;
}) {
  return (
    <TextField
      label={label}
      value={value}
      onChangeText={onChangeText}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      placeholder={placeholder}
      testID={testID}
    />
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>{children}</View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <UiCard>{children}</UiCard>;
}
