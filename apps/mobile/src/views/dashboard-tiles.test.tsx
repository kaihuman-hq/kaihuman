import { buildDemoSeed } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentTile } from '../components/widgets/tile-controllers.js';
import type { DashboardPage } from '../screens/dashboards.js';
import { DashboardPager } from './dashboard-pager.js';
import { Tile } from './tile-view.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = new Date(2026, 10, 5, 10, 0, 0);
const seed = buildDemoSeed(NOW).files;
const file = (suffix: string) => {
  const path = Object.keys(seed).find((p) => p.endsWith(suffix)) as string;
  return { path, content: seed[path] as string };
};

const renderTile = (suffix: string, onWrite = vi.fn()) => {
  const f = file(suffix);
  const tile = presentTile(f.path, f.content, NOW);
  if (!tile) throw new Error(`no tile for ${suffix}`);
  render(<Tile path={f.path} tile={tile} content={f.content} now={NOW} onWrite={onWrite} />);
  return { onWrite, f };
};

/** Holds a row long enough for react-native-web to fire onLongPress. */
const longPress = (el: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 5, clientY: 5 });
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
};

describe('tile headings', () => {
  it('shows a friendly name with the file name as a caption', () => {
    const { f } = renderTile('.bookmarks.json');
    expect(screen.getByRole('heading', { name: 'Bookmarks' })).toBeTruthy();
    expect(screen.getByText(f.path.slice(f.path.lastIndexOf('/') + 1))).toBeTruthy();
    expect(screen.queryByTestId('tile-file-link')).toBeNull();
  });

  it('links the file name to the editor when the host can open files', () => {
    const f = file('.bookmarks.json');
    const tile = presentTile(f.path, f.content, NOW);
    if (!tile) throw new Error('no tile');
    const onOpenFile = vi.fn();
    render(
      <Tile
        path={f.path}
        tile={tile}
        content={f.content}
        now={NOW}
        onWrite={vi.fn()}
        onOpenFile={onOpenFile}
      />,
    );
    fireEvent.click(screen.getByTestId('tile-file-link'));
    expect(onOpenFile).toHaveBeenCalledWith(f.path);
  });
});

describe('bookmark context menu', () => {
  it('long press offers a destructive delete, which writes', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { onWrite, f } = renderTile('.bookmarks.json');
    expect(screen.queryByRole('button', { name: 'Delete' })).toBeNull();
    longPress(screen.getAllByTestId(/^bookmark-/)[0] as HTMLElement);
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]?.[2] as AlertButton[];
    const del = buttons.find((b) => b.text === 'Delete bookmark');
    expect(del?.style).toBe('destructive');
    del?.onPress?.();
    expect(onWrite).toHaveBeenCalledTimes(1);
    expect(onWrite.mock.calls[0]?.[0]).toBe(f.path);
    expect(onWrite.mock.calls[0]?.[1]).not.toBe(f.content);
  });

  it('collapses long lists behind Show all', () => {
    renderTile('.bookmarks.json');
    const all = screen.queryByRole('button', { name: /^Show all \d+ bookmarks$/ });
    if (all) {
      const before = screen.getAllByTestId(/^bookmark-/).length;
      fireEvent.click(all);
      expect(screen.getAllByTestId(/^bookmark-/).length).toBeGreaterThan(before);
    }
  });
});

describe('todo rows', () => {
  it('are checkboxes that expose their state', () => {
    renderTile('projects.todos.md');
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBeGreaterThan(0);
    expect(boxes.some((b) => b.getAttribute('aria-checked') === 'false')).toBe(true);
  });

  it('submits a new task from the keyboard', () => {
    const { onWrite } = renderTile('projects.todos.md');
    const input = screen.getByLabelText('New task');
    fireEvent.change(input, { target: { value: 'Call mum' } });
    fireEvent.keyDown(input, { key: 'Enter', keyCode: 13 });
    expect(onWrite.mock.calls.some((c) => String(c[1]).includes('Call mum'))).toBe(true);
  });
});

describe('DashboardPager states', () => {
  const props = { now: NOW, onWrite: vi.fn(), onNavigate: vi.fn() };
  const today = (files: DashboardPage['files'] = []): DashboardPage[] => [
    { id: 'today', name: 'Today', files },
  ];

  it('shows a skeleton while loading', () => {
    render(<DashboardPager pages={[]} loading {...props} />);
    expect(screen.getByLabelText('Loading tiles')).toBeTruthy();
    expect(screen.queryByText('No dashboard files in this repository')).toBeNull();
  });

  it('shows the error with a retry that refreshes', () => {
    const onRefresh = vi.fn();
    render(<DashboardPager pages={today()} error="Offline" onRefresh={onRefresh} {...props} />);
    expect(screen.getByText("Couldn't load your tiles")).toBeTruthy();
    expect(screen.getByText('Offline')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });

  it('keeps showing tiles when a refresh fails', () => {
    const f = file('projects.todos.md');
    render(<DashboardPager pages={today([f])} error="Offline" {...props} />);
    expect(screen.getByTestId(`square-${f.path}`)).toBeTruthy();
    expect(screen.queryByText("Couldn't load your tiles")).toBeNull();
  });

  it('titles the screen and shows today', () => {
    render(<DashboardPager pages={today()} {...props} />);
    expect(screen.getByRole('heading', { name: 'Today' })).toBeTruthy();
    expect(screen.getByText(/November/)).toBeTruthy();
  });
});
