import { Pressable } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { haptics } from './haptics.js';
import { Icon } from './icon.js';
import { Text } from './text.js';

export interface BackButtonProps {
  /** Where the button goes, e.g. "Ideas". Read as "Back to <label>". */
  label: string;
  onPress: () => void;
}

/**
 * In-content back control for list → detail views that live inside one route. It mirrors the
 * native header: chevron and title in accent on iOS, arrow and label on Android.
 */
export function BackButton({ label, onPress }: BackButtonProps) {
  const theme = useTheme();
  const { colors, metrics, spacing } = theme;
  const ios = theme.platform === 'ios';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Back to ${label.toLowerCase()}`}
      onPress={() => {
        haptics.selection();
        onPress();
      }}
      android_ripple={ios ? undefined : { color: colors.pressed, borderless: true }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'flex-start',
        gap: ios ? spacing.xxs : spacing.sm,
        minHeight: metrics.hitTarget,
        paddingRight: spacing.sm,
        // Pull the glyph to the screen edge like a navigation bar back button.
        marginLeft: ios ? -spacing.xs : 0,
        opacity: pressed && ios ? 0.5 : 1,
      })}
    >
      <Icon
        name={ios ? 'chevronLeft' : 'arrowBack'}
        size={22}
        color={colors.accent}
        weight="semibold"
      />
      <Text variant={ios ? 'body' : 'subheadline'} weight={ios ? '400' : '500'} tone="accent">
        {label}
      </Text>
    </Pressable>
  );
}
