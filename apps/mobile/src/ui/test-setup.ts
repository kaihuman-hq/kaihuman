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

// react-native-svg ships untranspiled native code that jsdom cannot load.
vi.mock('react-native-svg', () => {
  const el =
    (tag: string) =>
    ({ testID, fill, children }: Record<string, any>) =>
      createElement(tag, { 'data-testid': testID, fill }, children);
  return { Svg: el('svg'), Path: el('path') };
});
