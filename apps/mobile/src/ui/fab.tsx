import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { haptics } from './haptics.js';
import { Icon, type IconName } from './icon.js';
import { useInsets } from './insets.js';
import { Animated, usePressScale } from './motion.js';
import { Text } from './text.js';

export interface FabProps {
  icon: IconName;
  label?: string;
  onPress: () => void;
  accessibilityLabel: string;
}

/** Material floating action button; iOS puts primary actions in the navigation bar instead. */
export function Fab({ icon, label, onPress, accessibilityLabel }: FabProps) {
  const theme = useTheme();
  const insets = useInsets();
  const press = usePressScale();
  if (theme.platform === 'ios') return null;
  const { colors, spacing } = theme;
  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', right: 16 + insets.right, bottom: 16 + insets.bottom }}
    >
      <Animated.View style={press.style}>
        <Pressable
          {...press.handlers}
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          onPress={() => {
            haptics.light();
            onPress();
          }}
          android_ripple={{ color: colors.pressed }}
          style={{
            height: 56,
            minWidth: 56,
            paddingHorizontal: label ? spacing.lg : 0,
            borderRadius: 16,
            backgroundColor: colors.accentFill,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: spacing.sm,
            elevation: 3,
            shadowColor: colors.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 6,
            shadowOffset: { width: 0, height: 3 },
          }}
        >
          <Icon name={icon} size={24} color={colors.onAccentFill} />
          {label ? (
            <Text variant="subheadline" weight="500" color={colors.onAccentFill}>
              {label}
            </Text>
          ) : null}
        </Pressable>
      </Animated.View>
    </View>
  );
}
