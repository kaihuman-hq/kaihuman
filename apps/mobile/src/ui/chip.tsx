import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon, type IconName } from './icon.js';
import { Text } from './text.js';

export interface ChipProps {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}

export function Chip({ label, selected = false, onPress, icon }: ChipProps) {
  const theme = useTheme();
  const { colors, spacing } = theme;
  const ios = theme.platform === 'ios';
  const fg = selected ? colors.onAccentSoft : colors.label;
  const glyph = ios ? icon : selected ? 'check' : icon;

  const style = {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    height: 32,
    paddingHorizontal: spacing.md,
    borderRadius: ios ? theme.shape.pill : theme.shape.sm,
    backgroundColor: selected ? colors.accentSoft : ios ? colors.fill : 'transparent',
    borderWidth: ios || selected ? 0 : 1,
    borderColor: colors.separator,
  } as const;

  const content = (
    <>
      {glyph ? <Icon name={glyph} size={16} color={fg} /> : null}
      <Text variant="footnote" weight="500" color={fg} numberOfLines={1}>
        {label}
      </Text>
    </>
  );

  if (!onPress) return <View style={style}>{content}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      aria-selected={selected}
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      android_ripple={ios ? undefined : { color: colors.pressed }}
      style={({ pressed }) => [style, { opacity: pressed && ios ? 0.7 : 1 }]}
    >
      {content}
    </Pressable>
  );
}

export type BadgeTone = 'accent' | 'neutral' | 'danger' | 'success' | 'warning';

export type BadgeProps = { tone?: BadgeTone } & ({ label: string } | { count: number });

export function Badge(props: BadgeProps) {
  const { colors, spacing, shape } = useTheme();
  const { tone = 'accent' } = props;
  const text = 'count' in props ? String(props.count) : props.label;
  // Status colours are 6-digit hex, so an alpha suffix gives a matching translucent tint.
  const scheme = {
    accent: { bg: colors.accentSoft, fg: colors.onAccentSoft },
    neutral: { bg: colors.fill, fg: colors.secondaryLabel },
    danger: { bg: `${colors.danger}26`, fg: colors.danger },
    success: { bg: `${colors.success}26`, fg: colors.success },
    warning: { bg: `${colors.warning}26`, fg: colors.warning },
  }[tone];
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        minWidth: 20,
        height: 20,
        paddingHorizontal: spacing.sm - 1,
        borderRadius: shape.pill,
        backgroundColor: scheme.bg,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text
        variant="caption1"
        weight="600"
        color={scheme.fg}
        style={{ fontVariant: ['tabular-nums'] }}
      >
        {text}
      </Text>
    </View>
  );
}
