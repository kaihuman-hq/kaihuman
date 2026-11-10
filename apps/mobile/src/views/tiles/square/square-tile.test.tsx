import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentTile } from '../../../components/widgets/tile-controllers.js';
import { glanceOf, tileTitle } from '../glance/index.js';
import type { Glance } from '../glance/types.js';
import { sparkPath } from './mini-viz.js';
import { quickEntryRoute, SquareTile, tileSide } from './square-tile.js';

afterEach(cleanup);

const base: Glance = {
  title: 'Coffee',
  icon: 'gauge',
  tint: 'yellow',
  hero: '3',
  label: 'cups today',
};
const renderTile = (glance: Glance, extra: Partial<Parameters<typeof SquareTile>[0]> = {}) => {
  const onNavigate = vi.fn();
  const onWrite = vi.fn();
  render(
    <SquareTile
      path=".kh/coffee.consumption.csv"
      glance={glance}
      content="old"
      size={174}
      href="/dashboard/tile?path=x"
      onNavigate={onNavigate}
      onWrite={onWrite}
      {...extra}
    />,
  );
  return { onNavigate, onWrite };
};

describe('square tile geometry', () => {
  it('fits two 174 pt tiles with a 13 pt gutter on a 393 pt screen', () => {
    expect(tileSide(393, 16)).toBe(174);
  });
  it('draws a sparkline across the width, lowest value at the bottom', () => {
    expect(sparkPath([0, 10], 100, 40)).toBe('M3.0 37.0 L97.0 3.0');
    expect(sparkPath([], 100, 40)).toBe('');
  });
  it('names tiles after their file', () => {
    expect(tileTitle('.kh/deep-work.timetracking.csv', 'Time')).toBe('Deep work');
    expect(tileTitle('.kh/x/.habit.csv', 'Habit')).toBe('Habit');
  });
  it('leaves palette settings off the grid', () => {
    const tile = presentTile('command-palette.settings.json', '{}', new Date());
    expect(
      tile &&
        glanceOf({ path: 'command-palette.settings.json', content: '{}', now: new Date() }, tile),
    ).toBeNull();
  });
});

describe('SquareTile', () => {
  it('shows header, hero and label and opens the deep dive on press', () => {
    const { onNavigate } = renderTile(base);
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.getByTestId('tile-hero').textContent).toBe('3');
    fireEvent.click(screen.getByRole('button', { name: /^Coffee, 3/ }));
    expect(onNavigate).toHaveBeenCalledWith('/dashboard/tile?path=x');
  });

  it('runs a tap action and writes its result', () => {
    const run = vi.fn(() => 'new');
    const { onWrite, onNavigate } = renderTile({
      ...base,
      action: { kind: 'tap', icon: 'add', label: 'Coffee +1', run },
    });
    fireEvent.click(screen.getByTestId('tile-quick-action'));
    expect(run).toHaveBeenCalledWith('old', expect.any(Date));
    expect(onWrite).toHaveBeenCalledWith('.kh/coffee.consumption.csv', 'new');
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it('shows the error of a failed tap action instead of writing', () => {
    const { onWrite } = renderTile({
      ...base,
      action: { kind: 'tap', icon: 'add', label: 'x', run: () => ({ ok: false, error: 'Nope' }) },
    });
    fireEvent.click(screen.getByTestId('tile-quick-action'));
    expect(onWrite).not.toHaveBeenCalled();
    expect(screen.getByText('Nope')).toBeTruthy();
  });

  it('opens the one-field sheet for field actions and the href for open actions', () => {
    const { onNavigate } = renderTile({
      ...base,
      action: {
        kind: 'field',
        icon: 'add',
        label: 'Add',
        placeholder: 'n',
        submit: () => ({ ok: true, content: '' }),
      },
    });
    fireEvent.click(screen.getByTestId('tile-quick-action'));
    expect(onNavigate).toHaveBeenCalledWith(quickEntryRoute('.kh/coffee.consumption.csv'));
    cleanup();
    const second = renderTile({
      ...base,
      action: { kind: 'open', icon: 'add', label: 'New', href: '/h' },
    });
    fireEvent.click(screen.getByTestId('tile-quick-action'));
    expect(second.onNavigate).toHaveBeenCalledWith('/h');
  });

  it('renders counts in place of the hero, with a live dot when recording', () => {
    renderTile({
      ...base,
      hero: '',
      counts: [
        { value: 7, label: 'open', tone: 'label' },
        { value: 2, label: 'doing', tone: 'info' },
      ],
    });
    expect(screen.getByTestId('tile-counts').textContent).toContain('7open');
    cleanup();
    renderTile({ ...base, eyebrow: 'Deep work', live: true });
    expect(screen.getByTestId('tile-live-dot')).toBeTruthy();
  });
});
