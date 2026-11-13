import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AppTabBar, type AppTabBarProps } from './app-tab-bar.js';

afterEach(cleanup);

const names = ['dashboard', 'board', 'capture', 'tasks', 'ideas', 'more'];
const titles: Record<string, string> = {
  dashboard: 'Today',
  board: 'Board',
  capture: 'Capture',
  tasks: 'Tasks',
  ideas: 'Ideas',
  more: 'More',
};

const renderBar = (over: Partial<AppTabBarProps> = {}) => {
  const props = {
    state: { index: 0, routes: names.map((name) => ({ key: `${name}-k`, name })) },
    descriptors: Object.fromEntries(
      names.map((n) => [`${n}-k`, { options: { title: titles[n] } }]),
    ),
    navigateToTab: vi.fn(),
    insets: { top: 0, right: 0, bottom: 0, left: 0 },
    menuOpen: false,
    onToggleMenu: vi.fn(),
    onCloseMenu: vi.fn(),
    onRepeatLast: vi.fn(),
    ...over,
  } as unknown as AppTabBarProps;
  render(<AppTabBar {...props} />);
  return props;
};

/** Holds the button long enough for react-native-web to fire onLongPress. */
const longPress = (el: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 5, clientY: 5 });
  vi.advanceTimersByTime(1000);
  fireEvent.mouseUp(el, { button: 0, clientX: 5, clientY: 5 });
  vi.useRealTimers();
};

describe('AppTabBar', () => {
  it('shows Today · Board · ＋ · Tasks · More and hides the capture and ideas routes', () => {
    renderBar();
    const slots = screen
      .getByRole('tablist')
      .querySelectorAll('[role="tab"], [data-testid="tab-plus"]');
    expect([...slots].map((s) => s.getAttribute('data-testid'))).toEqual([
      'tab-dashboard',
      'tab-board',
      'tab-plus',
      'tab-tasks',
      'tab-more',
    ]);
    expect(screen.queryByText('Capture')).toBeNull();
    expect(screen.queryByText('Ideas')).toBeNull();
  });

  it('navigates to a tab and closes an open menu first', () => {
    const p = renderBar({ menuOpen: true });
    fireEvent.click(screen.getByTestId('tab-tasks'));
    expect(p.onCloseMenu).toHaveBeenCalledOnce();
    expect(p.navigateToTab).toHaveBeenCalledWith('tasks-k');
  });

  it('opens the quick menu on tap and reads as a close control while open', () => {
    const p = renderBar();
    fireEvent.click(screen.getByTestId('tab-plus'));
    expect(p.onToggleMenu).toHaveBeenCalledOnce();
    cleanup();
    renderBar({ menuOpen: true });
    expect(screen.getByLabelText('Close quick menu')).toBeTruthy();
  });

  it('repeats the last action on long-press', () => {
    const p = renderBar();
    longPress(screen.getByTestId('tab-plus'));
    expect(p.onRepeatLast).toHaveBeenCalledOnce();
    expect(p.onToggleMenu).not.toHaveBeenCalled();
  });
});
