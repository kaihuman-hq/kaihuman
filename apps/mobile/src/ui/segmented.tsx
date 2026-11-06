import { Pressable, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { haptics } from './haptics.js';
import { Icon } from './icon.js';
import { Text } from './text.js';

export interface SegmentedControlProps<T extends string> {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  testID,
}: SegmentedControlProps<T>) {
  const theme = useTheme();
  const { colors, shape } = theme;
  const ios = theme.platform === 'ios';

  const select = (next: T) => {
    if (next === value) return;
    haptics.selection();
    onChange(next);
  };

  return (
    <View
      testID={testID}
      style={
        ios
          ? { flexDirection: 'row', backgroundColor: colors.fill, borderRadius: 9, padding: 2 }
          : {
              flexDirection: 'row',
              borderRadius: shape.pill,
              borderWidth: 1,
              borderColor: colors.separator,
              overflow: 'hidden',
            }
      }
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="button"
            accessibilityLabel={option.label}
            accessibilityState={{ selected }}
            aria-selected={selected}
            onPress={() => select(option.value)}
            // The 28pt iOS segment extends to the 44pt minimum target.
            hitSlop={ios ? { top: 8, bottom: 8 } : undefined}
            android_ripple={ios ? undefined : { color: colors.pressed }}
            style={[
              {
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: theme.spacing.xs,
                paddingHorizontal: theme.spacing.sm,
              },
              ios
                ? {
                    height: 28,
                    borderRadius: 7,
                    // UIKit lifts the dark-mode thumb to a light grey; the elevated surface vanishes on the track.
                    backgroundColor: selected
                      ? theme.scheme === 'dark'
                        ? colors.tertiaryLabel
                        : colors.surfaceElevated
                      : 'transparent',
                    ...(selected
                      ? {
                          shadowColor: colors.shadow,
                          shadowOpacity: theme.scheme === 'light' ? 0.12 : 0.4,
                          shadowRadius: 3,
                          shadowOffset: { width: 0, height: 1 },
                        }
                      : null),
                  }
                : {
                    height: 40,
                    backgroundColor: selected ? colors.accentSoft : 'transparent',
                    borderLeftWidth: index === 0 ? 0 : 1,
                    borderLeftColor: colors.separator,
                  },
            ]}
          >
            {!ios && selected ? <Icon name="check" size={16} color={colors.onAccentSoft} /> : null}
            <Text
              variant="footnote"
              weight={ios ? (selected ? '600' : '500') : '500'}
              color={!ios && selected ? colors.onAccentSoft : colors.label}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
