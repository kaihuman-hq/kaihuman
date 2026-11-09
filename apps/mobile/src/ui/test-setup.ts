import { createContext, createElement } from 'react';
import { vi } from 'vitest';

// Native modules cannot load in jsdom; these stand-ins keep the markup observable.
vi.mock('expo-symbols', () => ({
  SymbolView: ({ name, accessibilityLabel, accessible }: Record<string, any>) =>
    createElement('span', {
      'data-testid': `icon-${name.web}`,
      'aria-label': accessible ? accessibilityLabel : undefined,
      'aria-hidden': accessible ? undefined : true,
    }),
}));

// The sync runtime talks to GitHub and native modules; Screen's status banner only needs its types.
vi.mock('../sync/runtime.js', () => ({
  refreshAll: vi.fn(async () => {}),
  requestFocusRefresh: vi.fn(),
  resolveConflict: vi.fn(),
}));

// Real expo-router needs the native navigation stack; views only use the focus hook here.
// Tests that need routing mock the module themselves.
vi.mock('expo-router', () => ({ useFocusEffect: () => {} }));

// The native date picker is Flow source with no web build; render a marker the tests can find.
vi.mock('@react-native-community/datetimepicker', () => ({
  default: ({ mode, testID }: Record<string, any>) =>
    createElement('div', { 'data-testid': testID, 'data-mode': mode }),
}));

vi.mock('expo-haptics', () => ({
  selectionAsync: vi.fn(async () => {}),
  impactAsync: vi.fn(async () => {}),
  notificationAsync: vi.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

vi.mock('react-native-safe-area-context', () => ({
  SafeAreaInsetsContext: createContext(null),
}));

vi.mock('expo-router/react-navigation', () => ({
  HeaderShownContext: createContext(false),
}));

// The native gesture stack needs a worklet runtime. This stand-in renders both action sets
// inline so tests can press the revealed buttons.
vi.mock('react-native-gesture-handler/ReanimatedSwipeable', () => {
  const methods = { close: vi.fn(), openLeft: vi.fn(), openRight: vi.fn(), reset: vi.fn() };
  return {
    default: ({ children, renderLeftActions, renderRightActions, testID }: Record<string, any>) =>
      createElement(
        'div',
        { 'data-testid': testID },
        renderLeftActions?.({ value: 0 }, { value: 0 }, methods),
        children,
        renderRightActions?.({ value: 0 }, { value: 0 }, methods),
      ),
  };
});

vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children, style }: Record<string, any>) =>
    createElement('div', { style }, children),
}));

// react-native-svg ships untranspiled native code that jsdom cannot load.
vi.mock('react-native-svg', () => {
  const el =
    (tag: string) =>
    ({ testID, fill, children }: Record<string, any>) =>
      createElement(tag, { 'data-testid': testID, fill }, children);
  const SvgXml = ({ xml, testID }: Record<string, any>) =>
    createElement('div', { 'data-testid': testID ?? 'svg-xml', 'data-xml': xml });
  const Svg = el('svg');
  return {
    Svg,
    Path: el('path'),
    G: el('g'),
    Line: el('line'),
    Rect: el('rect'),
    Circle: el('circle'),
    Text: el('text'),
    SvgXml,
  };
});

// The in-app browser is a native sheet; tests assert the URL it was asked to open.
vi.mock('expo-web-browser', () => ({ openBrowserAsync: vi.fn(async () => ({ type: 'opened' })) }));

// expo-crypto pulls in the Expo runtime, which needs a native host.
vi.mock('expo-crypto', async () => ({ randomUUID: (await import('node:crypto')).randomUUID }));
