import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CAPTURE_ACTIONS, type QuickMenuAction } from '../screens/quick-menu.js';
import { QuickMenu, type QuickMenuProps } from './quick-menu.js';

afterEach(cleanup);

const coffee: QuickMenuAction = {
  kind: 'tap',
  id: 'tap:c.consumption.csv',
  path: 'c.consumption.csv',
  label: 'Coffee +1',
  icon: 'gauge',
  tint: 'orange',
};
const expense: QuickMenuAction = {
  kind: 'field',
  id: 'field:b.budget.csv',
  path: 'b.budget.csv',
  href: '/quick-entry?path=b.budget.csv',
  label: 'Expense',
  icon: 'wallet',
  tint: 'green',
};

const renderMenu = (over: Partial<QuickMenuProps> = {}) => {
  const props: QuickMenuProps = {
    open: true,
    capture: CAPTURE_ACTIONS,
    track: [coffee, expense],
    last: { action: coffee, caption: 'used 4× today' },
    onRun: vi.fn(),
    onClose: vi.fn(),
    bottomOffset: 49,
    ...over,
  };
  const r = render(<QuickMenu {...props} />);
  return { props, ...r };
};

describe('QuickMenu', () => {
  it('lists Capture and Track groups and the last action row', () => {
    renderMenu();
    expect(screen.getByText('CAPTURE')).toBeTruthy();
    expect(screen.getByText('TRACK')).toBeTruthy();
    for (const l of ['Todo', 'Note', 'Log', 'Idea', 'Knowledge', 'Expense']) {
      expect(screen.getByText(l)).toBeTruthy();
    }
    expect(screen.getAllByText('Coffee +1')).toHaveLength(2);
    expect(screen.getByText('used 4× today')).toBeTruthy();
  });

  it('runs the pressed entry and the last action', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByTestId('quick-capture:note'));
    expect(props.onRun).toHaveBeenLastCalledWith(CAPTURE_ACTIONS[1]);
    fireEvent.click(screen.getByTestId('quick-field:b.budget.csv'));
    expect(props.onRun).toHaveBeenLastCalledWith(expense);
    fireEvent.click(screen.getByTestId('quick-menu-last'));
    expect(props.onRun).toHaveBeenLastCalledWith(coffee);
  });

  it('closes on a scrim tap', () => {
    const { props } = renderMenu();
    fireEvent.click(screen.getByTestId('quick-menu-scrim'));
    expect(props.onClose).toHaveBeenCalledOnce();
  });

  it('hides the Track group without tiles and the bottom row without a last action', () => {
    renderMenu({ track: [], last: null });
    expect(screen.queryByText('TRACK')).toBeNull();
    expect(screen.queryByTestId('quick-menu-last')).toBeNull();
  });

  it('renders nothing while closed and unmounts after closing', () => {
    const { rerender, props } = renderMenu({ open: false });
    expect(screen.queryByTestId('quick-menu')).toBeNull();
    rerender(<QuickMenu {...props} open />);
    expect(screen.getByTestId('quick-menu')).toBeTruthy();
    rerender(<QuickMenu {...props} open={false} />);
    expect(screen.queryByTestId('quick-menu')).toBeNull();
  });
});
