import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/theme.js';
import { Icon, type IconName, Text } from '../ui/index.js';

const ICONS: Record<string, IconName> = {
  dashboard: 'home',
  board: 'board',
  capture: 'capture',
  ideas: 'ideas',
  more: 'more',
};

/**
 * Web-only design preview of the native tab bar (UITabBar / M3 NavigationBar); iOS and
 * Android use `NativeTabs`, so this never ships on a device.
 */
export function WebTabBar({ state, descriptors, navigateToTab, insets }: BottomTabBarProps) {
  const { colors, platform } = useTheme();
  const ios = platform === 'ios';
  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        height: (ios ? 49 : 80) + insets.bottom,
        paddingBottom: insets.bottom,
        borderTopWidth: ios ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.separator,
      }}
    >
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const label = descriptors[route.key]?.options.title ?? route.name;
        const icon = ICONS[route.name] ?? 'more';
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={label}
            onPress={() => navigateToTab(route.key)}
            style={{
              flex: 1,
              alignItems: 'center',
              justifyContent: ios ? 'center' : 'flex-start',
              paddingTop: ios ? 0 : 12,
              gap: ios ? 2 : 4,
            }}
          >
            {ios ? (
              <Icon name={icon} size={25} color={focused ? colors.accent : colors.secondaryLabel} />
            ) : (
              <View
                style={{
                  width: 64,
                  height: 32,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: focused ? colors.accentSoft : 'transparent',
                }}
              >
                <Icon
                  name={icon}
                  size={24}
                  color={focused ? colors.onAccentSoft : colors.secondaryLabel}
                />
              </View>
            )}
            <Text
              style={{
                fontSize: ios ? 10 : 12,
                lineHeight: ios ? 12 : 16,
                fontWeight: '500',
                color: ios
                  ? focused
                    ? colors.accent
                    : colors.secondaryLabel
                  : focused
                    ? colors.label
                    : colors.secondaryLabel,
              }}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
