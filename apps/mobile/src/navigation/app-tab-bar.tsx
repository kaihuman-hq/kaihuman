import type { BottomTabBarProps } from 'expo-router/js-tabs';
import { Pressable, StyleSheet, View } from 'react-native';
import { type DesignPlatform, useTheme } from '../theme/theme.js';
import { haptics, Icon, type IconName, Text } from '../ui/index.js';

/** Tabs left and right of the raised ＋ (docs/redesign decision 6). `capture` stays a hidden route for /capture links. */
const LEFT = ['dashboard', 'board'] as const;
const RIGHT = ['ideas', 'more'] as const;

const ICONS: Record<(typeof LEFT)[number] | (typeof RIGHT)[number], IconName> = {
  dashboard: 'home',
  board: 'board',
  ideas: 'ideas',
  more: 'more',
};

const PLUS_SIZE = 56;

/** Height of the bar above the home indicator; the ＋ menu ends above it. */
export const tabBarHeight = (platform: DesignPlatform, bottomInset: number): number =>
  (platform === 'ios' ? 49 : 80) + bottomInset;

export interface AppTabBarProps extends BottomTabBarProps {
  menuOpen: boolean;
  onToggleMenu: () => void;
  onCloseMenu: () => void;
  /** Long-press ＋: run the last quick action without opening the menu. */
  onRepeatLast: () => void;
}

/**
 * The app's tab bar on every platform: Today · Board · ＋ · Ideas · More, drawn as a UITabBar on iOS
 * and an M3 NavigationBar on Android. `NativeTabs` cannot raise a centre button or report a long-press.
 */
export function AppTabBar({
  state,
  descriptors,
  navigateToTab,
  insets,
  menuOpen,
  onToggleMenu,
  onCloseMenu,
  onRepeatLast,
}: AppTabBarProps) {
  const { colors, platform } = useTheme();
  const ios = platform === 'ios';

  const tab = (name: keyof typeof ICONS) => {
    const index = state.routes.findIndex((r) => r.name === name);
    const route = state.routes[index];
    if (!route) return null;
    const focused = state.index === index && !menuOpen;
    const label = descriptors[route.key]?.options.title ?? route.name;
    const icon = ICONS[name];
    return (
      <Pressable
        key={route.key}
        testID={`tab-${name}`}
        accessibilityRole="tab"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          if (menuOpen) onCloseMenu();
          navigateToTab(route.key);
        }}
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
  };

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.surface,
        height: tabBarHeight(platform, insets.bottom),
        paddingBottom: insets.bottom,
        borderTopWidth: ios ? StyleSheet.hairlineWidth : 0,
        borderTopColor: colors.separator,
      }}
    >
      {LEFT.map(tab)}
      <PlusButton open={menuOpen} onPress={onToggleMenu} onLongPress={onRepeatLast} />
      {RIGHT.map(tab)}
    </View>
  );
}

function PlusButton({
  open,
  onPress,
  onLongPress,
}: {
  open: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <View style={{ flex: 1, alignItems: 'center' }}>
      <Pressable
        testID="tab-plus"
        accessibilityRole="button"
        accessibilityLabel={open ? 'Close quick menu' : 'Quick add'}
        accessibilityHint="Long-press repeats the last quick action"
        accessibilityState={{ expanded: open }}
        onPress={() => {
          haptics.light();
          onPress();
        }}
        onLongPress={() => {
          haptics.medium();
          onLongPress();
        }}
        style={{
          width: PLUS_SIZE,
          height: PLUS_SIZE,
          marginTop: -PLUS_SIZE / 3,
          borderRadius: PLUS_SIZE / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.accentFill,
          shadowColor: colors.shadow,
          shadowOpacity: 0.25,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
        }}
      >
        {/* Turned into an × while open, without animating the turn. */}
        <View style={{ transform: [{ rotate: open ? '45deg' : '0deg' }] }}>
          <Icon name="add" size={28} color={colors.onAccentFill} />
        </View>
      </Pressable>
    </View>
  );
}
