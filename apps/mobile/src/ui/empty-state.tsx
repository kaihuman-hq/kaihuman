import { View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Button } from './button.js';
import { Icon, type IconName } from './icon.js';
import { Text } from './text.js';

export interface EmptyStateProps {
  icon: IconName;
  title: string;
  message?: string;
  action?: { label: string; onPress: () => void };
}

export function EmptyState({ icon, title, message, action }: EmptyStateProps) {
  const theme = useTheme();
  const { spacing, colors } = theme;
  return (
    <View
      style={{
        alignItems: 'center',
        paddingVertical: spacing.xxl,
        paddingHorizontal: spacing.xl,
        gap: spacing.sm,
      }}
    >
      <Icon name={icon} size={48} color={colors.tertiaryLabel} />
      <Text variant="title3" align="center" accessibilityRole="header">
        {title}
      </Text>
      {message ? (
        <Text variant="subheadline" tone="secondary" align="center">
          {message}
        </Text>
      ) : null}
      {action ? (
        <View style={{ marginTop: spacing.md }}>
          <Button label={action.label} onPress={action.onPress} variant="tinted" size="medium" />
        </View>
      ) : null}
    </View>
  );
}
