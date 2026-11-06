import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { haptics } from './haptics.js';
import { Icon, type IconName } from './icon.js';
import { Text } from './text.js';

export type ButtonVariant = 'filled' | 'tinted' | 'plain' | 'outlined' | 'destructive';
export type ButtonSize = 'large' | 'medium' | 'small';

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  icon?: IconName;
  /** Custom leading graphic (e.g. a brand mark); receives the label colour so it matches in every scheme. */
  leading?: (color: string) => ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  testID?: string;
  accessibilityLabel?: string;
}

export function Button({
  label,
  onPress,
  variant = 'filled',
  size = 'large',
  icon,
  leading,
  disabled = false,
  loading = false,
  fullWidth,
  testID,
  accessibilityLabel,
}: ButtonProps) {
  const theme = useTheme();
  const { colors, metrics, shape, spacing } = theme;
  const ios = theme.platform === 'ios';
  const inactive = disabled || loading;

  const height = size === 'large' ? metrics.buttonHeight : size === 'medium' ? 40 : 32;
  // Small buttons stay visually compact but keep a full-size touch target.
  const slop = Math.max(0, (metrics.hitTarget - height) / 2);

  const enabledPalette = {
    filled: { bg: colors.accentFill, fg: colors.onAccentFill, border: undefined },
    tinted: { bg: colors.accentSoft, fg: colors.onAccentSoft, border: undefined },
    plain: { bg: 'transparent', fg: colors.accent, border: undefined },
    outlined: { bg: 'transparent', fg: colors.accent, border: colors.separator },
    destructive: { bg: colors.danger, fg: colors.onDanger, border: undefined },
  }[variant];
  // Disabled buttons go neutral, as UIKit and Material do, instead of a faded brand fill.
  const solid = variant === 'filled' || variant === 'tinted' || variant === 'destructive';
  const palette = disabled
    ? {
        bg: solid ? colors.fill : 'transparent',
        fg: colors.tertiaryLabel,
        border: enabledPalette.border,
      }
    : enabledPalette;

  const handlePress = () => {
    if (variant === 'filled' || variant === 'destructive') haptics.light();
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled: inactive, busy: loading }}
      disabled={inactive}
      onPress={handlePress}
      hitSlop={{ top: slop, bottom: slop }}
      testID={testID}
      android_ripple={ios ? undefined : { color: colors.pressed }}
      style={({ pressed }) => ({
        minHeight: height,
        paddingHorizontal: variant === 'plain' ? spacing.sm : size === 'small' ? spacing.md : 20,
        borderRadius: shape.button,
        backgroundColor: palette.bg,
        borderWidth: palette.border ? 1 : 0,
        borderColor: palette.border,
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'row',
        gap: spacing.sm,
        overflow: 'hidden',
        alignSelf: fullWidth ? 'stretch' : 'flex-start',
        opacity: pressed && ios ? 0.7 : 1,
      })}
    >
      {loading ? <ActivityIndicator size="small" color={palette.fg} /> : null}
      {!loading && leading ? <View>{leading(palette.fg)}</View> : null}
      {!loading && icon && !leading ? (
        <View>
          <Icon
            name={icon}
            size={size === 'small' ? 16 : 18}
            color={palette.fg}
            weight="semibold"
          />
        </View>
      ) : null}
      <Text
        variant={ios ? (size === 'large' ? 'headline' : 'subheadline') : 'subheadline'}
        weight={ios ? '600' : '500'}
        color={palette.fg}
        align="center"
      >
        {label}
      </Text>
    </Pressable>
  );
}
