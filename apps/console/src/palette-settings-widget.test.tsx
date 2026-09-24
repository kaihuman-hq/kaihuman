import {
  DEFAULT_PALETTE_SETTINGS,
  readPaletteSettings,
  serializePaletteSettings,
} from '@lifosy/formats';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommandPaletteSettingsWidget } from '../../../packages/ui/src/LifeOS/Organisms/Widgets/CommandPaletteSettingsWidget';

let host: HTMLDivElement;

const DEFAULTS = serializePaletteSettings(DEFAULT_PALETTE_SETTINGS);

const mount = (content: string, mode: 'SMALL' | 'FOCUS', onChange = vi.fn()) => {
  act(() => {
    render(
      <CommandPaletteSettingsWidget content={content} mode={mode} onChange={onChange} />,
      host,
    );
  });
  return onChange;
};

const button = (label: string) => {
  const found = [...host.querySelectorAll('button')].find(
    (candidate) =>
      candidate.getAttribute('aria-label') === label || candidate.textContent?.trim() === label,
  );
  if (!found) throw new Error(`No button "${label}"`);
  return found;
};

const click = (label: string) => act(() => button(label).click());

const inputs = (label: string) => [
  ...host.querySelectorAll<HTMLInputElement>(`input[aria-label="${label}"]`),
];

const typeInto = (field: HTMLInputElement | undefined, value: string) => {
  if (!field) throw new Error('No such field');
  act(() => {
    field.value = value;
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

/** What the last save wrote, as the palettes will read it. */
const saved = (onChange: ReturnType<typeof vi.fn>) =>
  readPaletteSettings(onChange.mock.calls.at(-1)?.[0]).settings;

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('CommandPaletteSettingsWidget', () => {
  it('sums the engines and tools up on the dashboard', () => {
    mount(DEFAULTS, 'SMALL');
    expect(host.textContent).toContain(
      'Google · DuckDuckGo · Ecosia · Amazon · Amazon.de · Reddit',
    );
    expect(host.textContent).toContain('>l Tsuga logs');
  });

  it('reorders and removes engines, and writes only on Save', () => {
    const onChange = mount(DEFAULTS, 'FOCUS');
    click('Move Amazon.de up');
    click('Move Amazon.de up');
    click('Remove Reddit');
    expect(onChange).not.toHaveBeenCalled();

    click('Save');
    expect(saved(onChange).searchEngines.map((engine) => engine.name)).toEqual([
      'Google',
      'DuckDuckGo',
      'Amazon.de',
      'Ecosia',
      'Amazon',
    ]);
  });

  it('forgets the edits on Revert', () => {
    const onChange = mount(DEFAULTS, 'FOCUS');
    click('Remove Google');
    click('Revert');
    expect(inputs('Search engine name')[0]?.value).toBe('Google');
    expect(button('Save').disabled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('adds a tool with extra parameters', () => {
    const onChange = mount(DEFAULTS, 'FOCUS');
    click('Tool');
    typeInto(inputs('Tool prefix')[1], 'K');
    typeInto(inputs('Tool name')[1], 'Kibana');
    typeInto(inputs('Tool URL')[1], 'https://kibana.example/app');
    const addParameter = [...host.querySelectorAll('button')].filter(
      (candidate) => candidate.textContent?.trim() === 'Parameter',
    )[1];
    act(() => addParameter?.click());
    typeInto(inputs('Parameter name').at(-1), 'q');
    typeInto(inputs('Parameter value').at(-1), 'level:error AND {query}');
    typeInto(inputs('Parameter value with nothing typed').at(-1), 'level:error');
    expect(host.textContent).toContain(
      '“example” → https://kibana.example/app?q=level%3Aerror+AND+example',
    );

    click('Save');
    expect(saved(onChange).tools[1]).toEqual({
      prefix: 'k',
      name: 'Kibana',
      url: 'https://kibana.example/app',
      params: [{ key: 'q', value: 'level:error AND {query}', empty: 'level:error' }],
    });
  });

  it('says which entries the palette will leave out', () => {
    mount(DEFAULTS, 'FOCUS');
    typeInto(inputs('Tool prefix')[0], 'p');
    expect(host.textContent).toContain('Tsuga logs: >p is one of the palette’s own prefixes');
  });

  it('offers the default engines the file no longer has', () => {
    const onChange = mount(
      serializePaletteSettings({ ...DEFAULT_PALETTE_SETTINGS, searchEngines: [] }),
      'FOCUS',
    );
    click('Amazon.de');
    click('Save');
    expect(saved(onChange).searchEngines.map((engine) => engine.name)).toEqual(['Amazon.de']);
  });

  it('refuses to edit a file it cannot read', () => {
    mount('{nope', 'FOCUS');
    expect(host.textContent).toContain('The settings file is not valid JSON');
    expect([...host.querySelectorAll('button')]).toHaveLength(0);
  });
});
