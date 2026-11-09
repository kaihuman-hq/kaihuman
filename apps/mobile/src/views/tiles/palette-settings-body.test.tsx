import { readPaletteSettings } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Alert, type AlertButton } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { paletteSettingsView } from '../../components/widgets/tile-controllers.js';
import type { Ctx } from './bodies.js';
import { PaletteSettings } from './palette-settings-body.js';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const NOW = new Date(2026, 10, 8, 12, 0, 0);
const FILE = JSON.stringify({
  searchEngines: [
    { name: 'Alpha', url: 'https://a.test/?q={query}', params: [] },
    { name: 'Beta', url: 'https://b.test/?q={query}', params: [] },
  ],
  assistants: [],
  tools: [
    { prefix: 'l', name: 'Logs', description: 'Search logs', url: 'https://logs.test', params: [] },
    { prefix: 'zz', name: 'Broken', url: 'nope', params: [] },
  ],
});

const setup = (content = FILE) => {
  const apply = vi.fn(() => true);
  const ctx: Ctx = { content, now: NOW, apply, error: null };
  render(<PaletteSettings view={paletteSettingsView(content)} ctx={ctx} />);
  return apply;
};
const written = (apply: ReturnType<typeof vi.fn>) => {
  const arg = apply.mock.calls.at(-1)?.[0] as { content: string } | string;
  return readPaletteSettings(typeof arg === 'string' ? arg : arg.content).settings;
};
const type = (label: string, value: string, at = 0) =>
  fireEvent.change(screen.getAllByLabelText(label)[at] as HTMLElement, { target: { value } });
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));

/** Holds a row long enough for react-native-web to fire onLongPress. */
const longPress = (el: HTMLElement) => {
  vi.useFakeTimers();
  fireEvent.mouseDown(el, { button: 0, buttons: 1, clientX: 5, clientY: 5 });
  vi.advanceTimersByTime(1000);
  vi.useRealTimers();
};

describe('PaletteSettings view', () => {
  it('lists sections, problems in the danger tone and prefixes', () => {
    setup();
    expect(screen.getByText('Search engines')).toBeTruthy();
    expect(screen.getByText('Assistants')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getAllByRole('alert')[0]?.textContent).toContain('Broken');
    expect(screen.getByText('Search logs')).toBeTruthy();
    expect(screen.getAllByText('On').length).toBe(3);
    expect(screen.getByText('Problem')).toBeTruthy();
  });

  it('says so when nothing is configured', () => {
    setup(JSON.stringify({ searchEngines: [], assistants: [], tools: [] }));
    expect(screen.getByText('Nothing configured.')).toBeTruthy();
  });

  it('is read-only while the file is not valid JSON', () => {
    setup('{nope');
    expect(screen.getAllByRole('alert')[0]?.textContent).toContain('not valid JSON');
    expect(screen.queryByRole('button', { name: 'Add tool' })).toBeNull();
  });
});

describe('PaletteSettings editing', () => {
  it('edits an engine, including a parameter, with a live preview', () => {
    const apply = setup();
    fireEvent.click(screen.getByTestId('palette-searchEngines-0'));
    type('Name', 'Alpha 2');
    press('Add parameter');
    type('Parameter name', 'hl');
    type('Parameter value', 'en {query}');
    expect(screen.getByTestId('palette-preview').textContent).toContain('hl=en+example');
    fireEvent.click(screen.getByTestId('palette-save'));
    const [first, second] = written(apply).searchEngines;
    expect(first).toMatchObject({ name: 'Alpha 2', params: [{ key: 'hl', value: 'en {query}' }] });
    expect(second?.name).toBe('Beta');
    expect(screen.queryByTestId('palette-sheet')).toBeNull();
  });

  it('adds an assistant', () => {
    const apply = setup();
    press('Add assistant');
    type('Name', 'Claude');
    type('URL', 'https://claude.test/new?q={query}');
    fireEvent.click(screen.getByTestId('palette-save'));
    expect(written(apply).assistants).toEqual([
      { name: 'Claude', url: 'https://claude.test/new?q={query}', params: [] },
    ]);
  });

  it('adds a tool with a normalised prefix and optional description', () => {
    const apply = setup();
    press('Add tool');
    type('Prefix', ' G ');
    type('Name', 'Grafana');
    type('URL', 'https://g.test');
    type('Description (optional)', 'Dashboards');
    fireEvent.click(screen.getByTestId('palette-save'));
    expect(written(apply).tools.at(-1)).toEqual({
      prefix: 'g',
      name: 'Grafana',
      description: 'Dashboards',
      url: 'https://g.test',
      params: [],
    });
  });

  it('keeps an unusable entry but warns about it in the sheet', () => {
    const apply = setup();
    fireEvent.click(screen.getByTestId('palette-tools-1'));
    expect(screen.getAllByRole('alert').at(-1)?.textContent).toContain('Left out of the palette');
    type('URL', 'https://fixed.test');
    expect(screen.queryByText(/Left out of the palette/)).toBeNull();
    fireEvent.click(screen.getByTestId('palette-save'));
    expect(written(apply).tools[1]?.url).toBe('https://fixed.test');
  });

  it('save and move down reorders and keeps the edits', () => {
    const apply = setup();
    fireEvent.click(screen.getByTestId('palette-searchEngines-0'));
    type('Name', 'Alpha 2');
    press('Save and move down');
    expect(written(apply).searchEngines.map((e) => e.name)).toEqual(['Beta', 'Alpha 2']);
  });

  it('long press reorders and deletes with a confirmation', () => {
    const alert = vi.spyOn(Alert, 'alert').mockImplementation(() => {});
    const apply = setup();
    longPress(screen.getByTestId('palette-searchEngines-1'));
    const menu = alert.mock.calls[0]?.[2] as AlertButton[];
    expect(menu.map((b) => b.text)).toEqual(['Edit', 'Move up', 'Delete', 'Cancel']);
    menu.find((b) => b.text === 'Move up')?.onPress?.();
    expect(written(apply).searchEngines.map((e) => e.name)).toEqual(['Beta', 'Alpha']);

    menu.find((b) => b.text === 'Delete')?.onPress?.();
    const confirm = alert.mock.calls[1]?.[2] as AlertButton[];
    expect(apply).toHaveBeenCalledTimes(1);
    confirm.find((b) => b.text === 'Delete')?.onPress?.();
    expect(written(apply).searchEngines.map((e) => e.name)).toEqual(['Alpha']);
  });

  it('restores a removed default', () => {
    const apply = setup(JSON.stringify({ searchEngines: [], assistants: [], tools: [] }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Restore / })[0] as HTMLElement);
    expect(written(apply).searchEngines.length).toBe(1);
  });

  it('removes and reorders parameters in the sheet', () => {
    const content = JSON.stringify({
      searchEngines: [
        {
          name: 'P',
          url: 'https://p.test',
          params: [
            { key: 'a', value: '1' },
            { key: 'b', value: '2' },
          ],
        },
      ],
      assistants: [],
      tools: [],
    });
    const apply = setup(content);
    fireEvent.click(screen.getByTestId('palette-searchEngines-0'));
    press('Move parameter 1 down');
    press('Remove parameter 1');
    fireEvent.click(screen.getByTestId('palette-save'));
    expect(written(apply).searchEngines[0]?.params).toEqual([{ key: 'a', value: '1' }]);
  });
});
