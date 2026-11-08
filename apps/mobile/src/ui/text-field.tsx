import { useState } from 'react';
import { type KeyboardTypeOptions, type ReturnKeyTypeOptions, TextInput, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Text } from './text.js';

export interface TextFieldProps {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  secureTextEntry?: boolean;
  multiline?: boolean;
  helper?: string;
  error?: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: KeyboardTypeOptions;
  returnKeyType?: ReturnKeyTypeOptions;
  onSubmitEditing?: () => void;
  /** Focus on mount, e.g. the main field of a capture sheet. */
  autoFocus?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
  testID?: string;
}

export function TextField({
  label,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  multiline,
  helper,
  error,
  autoCapitalize = 'none',
  keyboardType,
  returnKeyType,
  onSubmitEditing,
  autoFocus,
  onFocus,
  onBlur,
  testID,
}: TextFieldProps) {
  const theme = useTheme();
  const { colors, spacing, shape, metrics } = theme;
  const ios = theme.platform === 'ios';
  const [focused, setFocused] = useState(false);

  const input = (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.tertiaryLabel}
      secureTextEntry={secureTextEntry}
      multiline={multiline}
      autoCapitalize={autoCapitalize}
      autoCorrect={false}
      keyboardType={keyboardType}
      returnKeyType={returnKeyType}
      onSubmitEditing={onSubmitEditing}
      autoFocus={autoFocus}
      onFocus={() => {
        setFocused(true);
        onFocus?.();
      }}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      selectionColor={colors.accent}
      cursorColor={colors.accent}
      testID={testID}
      style={[
        theme.type.body,
        {
          color: colors.label,
          fontFamily: theme.fontFamily.system,
          paddingVertical: ios ? spacing.sm + 2 : spacing.xs,
          minHeight: multiline ? 120 : undefined,
          textAlignVertical: multiline ? 'top' : 'center',
          outlineWidth: 0,
          // A 'solid' style makes the zero width win over the browser's focus ring in the web preview.
          outlineStyle: 'solid',
        },
      ]}
    />
  );

  const indicator = error ? colors.danger : focused ? colors.accent : colors.secondaryLabel;

  return (
    <View style={{ gap: spacing.xs }}>
      {ios ? (
        <>
          <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: spacing.xs }}>
            {label}
          </Text>
          <View
            style={{
              backgroundColor: colors.fill,
              borderRadius: shape.md,
              paddingHorizontal: spacing.md,
              minHeight: metrics.hitTarget,
              justifyContent: 'center',
              borderWidth: error ? 1 : 0,
              borderColor: colors.danger,
            }}
          >
            {input}
          </View>
        </>
      ) : (
        <View
          style={{
            backgroundColor: colors.fill,
            borderTopLeftRadius: 4,
            borderTopRightRadius: 4,
            paddingHorizontal: spacing.lg,
            paddingTop: spacing.sm,
            minHeight: 56,
            borderBottomWidth: focused || error ? 2 : 1,
            borderBottomColor: indicator,
          }}
        >
          <Text
            variant="footnote"
            color={error ? colors.danger : focused ? colors.accent : colors.secondaryLabel}
          >
            {label}
          </Text>
          {input}
        </View>
      )}
      {error ? (
        <Text variant="footnote" tone="danger" style={{ paddingHorizontal: spacing.xs }}>
          {error}
        </Text>
      ) : helper ? (
        <Text variant="footnote" tone="secondary" style={{ paddingHorizontal: spacing.xs }}>
          {helper}
        </Text>
      ) : null}
    </View>
  );
}
