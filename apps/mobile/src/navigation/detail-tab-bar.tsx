import { useRouter } from 'expo-router';
import { useSharedValue } from 'react-native-reanimated';
import { useTheme } from '../theme/theme.js';
import { useInsets } from '../ui/insets.js';
import { QuickMenu } from '../views/quick-menu.js';
import { useQuickMenu } from '../views/use-quick-menu.js';
import { AppTabBar, type AppTabBarProps, tabBarHeight } from './app-tab-bar.js';

/** Visible tabs and the route each one's root lives at. */
const TABS = [
  { name: 'dashboard', title: 'Today', href: '/dashboard' },
  { name: 'board', title: 'Board', href: '/board' },
  { name: 'tasks', title: 'Tasks', href: '/tasks' },
  { name: 'more', title: 'More', href: '/more' },
] as const;

/** Full-screen first-run flows and deep-link plumbing: no tab bar. */
const BARE_ROOTS = new Set(['login', 'onboarding', 'reminders', 'auth', 'demo']);
/** Cancel / Save form sheets that cover the whole screen. */
const BARE_FORMS = new Set(['time', 'payment']);

/**
 * Whether the root layout draws its own tab bar under `segments`. Screens inside `(tabs)` already
 * have the real one; the first-run flows and the business form sheets stay full-screen.
 */
export function showsDetailTabBar(segments: readonly string[]): boolean {
  const [root, child] = segments;
  if (root === undefined || root === '(tabs)' || root === 'index' || BARE_ROOTS.has(root)) {
    return false;
  }
  return !(root === 'business' && child !== undefined && BARE_FORMS.has(child));
}

/** `BottomTabBarProps` for a bar that sits outside the tab navigator: no tab is focused. */
export function detailBarProps(
  navigate: (href: string) => void,
  insets: AppTabBarProps['insets'],
): Pick<AppTabBarProps, 'state' | 'descriptors' | 'navigateToTab' | 'insets'> {
  const key = (name: string) => `${name}-detail`;
  return {
    state: { index: -1, routes: TABS.map((t) => ({ key: key(t.name), name: t.name })) },
    descriptors: Object.fromEntries(
      TABS.map((t) => [key(t.name), { options: { title: t.title } }]),
    ),
    // Tapping a tab from a detail view lands on that tab's root, not its last pushed screen.
    navigateToTab: (k: string) => {
      const tab = TABS.find((t) => key(t.name) === k);
      if (tab) navigate(tab.href);
    },
    insets,
  } as unknown as Pick<AppTabBarProps, 'state' | 'descriptors' | 'navigateToTab' | 'insets'>;
}

/** The tab bar and ＋ menu under every pushed screen of the root stack. */
export function DetailTabBar() {
  const { platform } = useTheme();
  const router = useRouter();
  const insets = useInsets();
  const quick = useQuickMenu((href) => router.push(href as never));
  const menuProgress = useSharedValue(0);
  const bar = detailBarProps((href) => router.navigate(href as never), insets);

  return (
    <>
      <AppTabBar
        {...(bar as unknown as AppTabBarProps)}
        menuOpen={quick.open}
        onToggleMenu={quick.toggle}
        onCloseMenu={quick.close}
        onRepeatLast={quick.repeatLast}
        menuProgress={menuProgress}
      />
      <QuickMenu
        {...quick.menu}
        progress={menuProgress}
        bottomOffset={tabBarHeight(platform, insets.bottom)}
      />
    </>
  );
}
