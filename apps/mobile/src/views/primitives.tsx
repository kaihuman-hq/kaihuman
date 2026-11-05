import type { ReactNode } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { colors, spacing, typography } from '../theme/tokens.js';

const mono = typography.mono;

export function Screen({ children, scroll = false }: { children: ReactNode; scroll?: boolean }) {
  const style = { flex: 1, backgroundColor: colors.background } as const;
  if (scroll) {
    return (
      <ScrollView style={style} contentContainerStyle={{ padding: spacing.lg, gap: spacing.md }}>
        {children}
      </ScrollView>
    );
  }
  return <View style={{ ...style, padding: spacing.lg, gap: spacing.md }}>{children}</View>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text
      accessibilityRole="header"
      style={{ color: colors.accent, fontFamily: mono, fontSize: typography.sizes.title }}
    >
      {children}
    </Text>
  );
}

export function Body({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: colors.text, fontFamily: mono, fontSize: typography.sizes.body }}>
      {children}
    </Text>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return (
    <Text style={{ color: colors.muted, fontFamily: mono, fontSize: typography.sizes.caption }}>
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
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      testID={testID}
      style={{
        borderWidth: 1,
        borderColor: disabled ? colors.border : colors.accent,
        padding: spacing.md,
        alignItems: 'center',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <Text
        style={{
          color: disabled ? colors.muted : colors.accent,
          fontFamily: mono,
          fontSize: typography.sizes.body,
        }}
      >
        {label}
      </Text>
    </Pressable>
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
    <View style={{ gap: spacing.xs }}>
      <Muted>{label}</Muted>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={colors.muted}
        autoCapitalize="none"
        autoCorrect={false}
        testID={testID}
        style={{
          color: colors.text,
          fontFamily: mono,
          fontSize: typography.sizes.body,
          backgroundColor: colors.surface,
          borderWidth: 1,
          borderColor: colors.border,
          padding: spacing.md,
          minHeight: multiline ? 120 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
        }}
      />
    </View>
  );
}

export function Row({ children }: { children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>{children}</View>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.border,
        padding: spacing.md,
        gap: spacing.sm,
      }}
    >
      {children}
    </View>
  );
}
