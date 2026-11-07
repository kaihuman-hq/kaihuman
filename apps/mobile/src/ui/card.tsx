import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon, type IconName } from './icon.js';
import { Text, type TextTone } from './text.js';

export interface CardProps {
  children?: ReactNode;
  title?: string;
  icon?: IconName;
  accessory?: ReactNode;
  onPress?: () => void;
  padding?: number;
}

export function Card({ children, title, icon, accessory, onPress, padding }: CardProps) {
  const theme = useTheme();
  const { colors, spacing, shape } = theme;
  const ios = theme.platform === 'ios';
  const hasHeader = title !== undefined || icon !== undefined || accessory !== undefined;

  const box = (pressed: boolean) =>
    ({
      backgroundColor: pressed && ios ? colors.surfaceElevated : colors.surface,
      borderRadius: shape.lg,
      padding: padding ?? spacing.lg,
      gap: spacing.sm,
      overflow: ios ? 'visible' : 'hidden',
      // Dark surfaces separate by tone alone; shadows only help on light backgrounds.
      ...(ios && theme.scheme === 'light'
        ? {
            shadowColor: colors.shadow,
            shadowOpacity: 0.06,
            shadowRadius: 8,
            shadowOffset: { width: 0, height: 1 },
          }
        : null),
    }) as const;

  const inner = (
    <>
      {hasHeader ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          {icon ? <Icon name={icon} size={20} /> : null}
          <View style={{ flex: 1 }}>
            {title ? (
              <Text variant="headline" numberOfLines={1} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
          </View>
          {accessory}
        </View>
      ) : null}
      {children}
    </>
  );

  if (!onPress) return <View style={box(false)}>{inner}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      android_ripple={ios ? undefined : { color: colors.pressed }}
      style={({ pressed }) => box(pressed)}
    >
      {inner}
    </Pressable>
  );
}

export interface StatTileProps {
  label: string;
  value: string | number;
  delta?: string;
  icon?: IconName;
  tone?: 'neutral' | 'success' | 'danger' | 'accent';
}

const deltaTone: Record<NonNullable<StatTileProps['tone']>, TextTone> = {
  neutral: 'secondary',
  success: 'success',
  danger: 'danger',
  accent: 'accent',
};

export function StatTile({ label, value, delta, icon, tone = 'neutral' }: StatTileProps) {
  const { spacing } = useTheme();
  return (
    <Card>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs }}>
        {icon ? <Icon name={icon} size={16} /> : null}
        <Text variant="footnote" tone="secondary" numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text variant="title1" style={{ fontVariant: ['tabular-nums'] }} numberOfLines={1}>
        {String(value)}
      </Text>
      {delta ? (
        <Text variant="footnote" tone={deltaTone[tone]} style={{ fontVariant: ['tabular-nums'] }}>
          {delta}
        </Text>
      ) : null}
    </Card>
  );
}
