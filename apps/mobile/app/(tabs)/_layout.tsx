import { Tabs } from 'expo-router/js-tabs';
import { NativeTabs } from 'expo-router/native-tabs';
import { Platform } from 'react-native';
import { WebTabBar } from '../../src/navigation/web-tab-bar.js';
import { useTheme } from '../../src/theme/theme.js';

export default function TabsLayout() {
  const { colors } = useTheme();

  if (Platform.OS === 'web') {
    return (
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
        tabBar={(props) => <WebTabBar {...props} />}
      >
        <Tabs.Screen name="dashboard" options={{ title: 'Today' }} />
        <Tabs.Screen name="board" options={{ title: 'Board' }} />
        <Tabs.Screen name="capture" options={{ title: 'Capture' }} />
        <Tabs.Screen name="ideas" options={{ title: 'Ideas' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
    );
  }

  // Background is Android-only on purpose: iOS keeps the system material (liquid glass).
  return (
    <NativeTabs
      tintColor={colors.accent}
      iconColor={colors.secondaryLabel}
      indicatorColor={colors.accentSoft}
      backgroundColor={Platform.OS === 'android' ? colors.background : undefined}
    >
      <NativeTabs.Trigger name="dashboard">
        <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} md="home" />
        <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="board">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'square.grid.2x2', selected: 'square.grid.2x2.fill' }}
          md="view_kanban"
        />
        <NativeTabs.Trigger.Label>Board</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="capture">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'plus.circle', selected: 'plus.circle.fill' }}
          md="add_circle"
        />
        <NativeTabs.Trigger.Label>Capture</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="ideas">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'lightbulb', selected: 'lightbulb.fill' }}
          md="lightbulb"
        />
        <NativeTabs.Trigger.Label>Ideas</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="more">
        <NativeTabs.Trigger.Icon
          sf={{ default: 'ellipsis.circle', selected: 'ellipsis.circle.fill' }}
          md="more_horiz"
        />
        <NativeTabs.Trigger.Label>More</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
