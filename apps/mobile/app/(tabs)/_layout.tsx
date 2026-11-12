import { useRouter } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';
import { View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { AppTabBar, tabBarHeight } from '../../src/navigation/app-tab-bar.js';
import { useTheme } from '../../src/theme/theme.js';
import { useInsets } from '../../src/ui/insets.js';
import { QuickMenu } from '../../src/views/quick-menu.js';
import { useQuickMenu } from '../../src/views/use-quick-menu.js';

/**
 * JS tabs with a custom bar on every platform: `NativeTabs` cannot draw the raised ＋ or report its
 * long-press (docs/redesign decision 6).
 */
export default function TabsLayout() {
  const { colors, platform } = useTheme();
  const router = useRouter();
  const insets = useInsets();
  const quick = useQuickMenu((href) => router.push(href as never));
  // One progress drives the sheet, the travelling ＋ and the tab bar ＋'s hand-over.
  const menuProgress = useSharedValue(0);

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
        tabBar={(props) => (
          <AppTabBar
            {...props}
            menuOpen={quick.open}
            onToggleMenu={quick.toggle}
            onCloseMenu={quick.close}
            onRepeatLast={quick.repeatLast}
            menuProgress={menuProgress}
          />
        )}
      >
        <Tabs.Screen name="dashboard" options={{ title: 'Today' }} />
        <Tabs.Screen name="board" options={{ title: 'Board' }} />
        {/* Kept as a route so /capture links still resolve; the ＋ menu replaced its tab. */}
        <Tabs.Screen name="capture" options={{ title: 'Capture', href: null }} />
        <Tabs.Screen name="ideas" options={{ title: 'Ideas' }} />
        <Tabs.Screen name="more" options={{ title: 'More' }} />
      </Tabs>
      <QuickMenu
        {...quick.menu}
        progress={menuProgress}
        bottomOffset={tabBarHeight(platform, insets.bottom)}
      />
    </View>
  );
}
