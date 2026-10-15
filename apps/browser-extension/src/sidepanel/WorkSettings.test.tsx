import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkUi } from '../background/work/types';
import { WorkSettings } from './WorkSettings';

let host: HTMLDivElement;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error(`Timed out; shows: ${host.textContent}`);
};
const packsButton = () =>
  [...host.querySelectorAll('button')].find((b) => /English ↔ German/.test(b.textContent ?? ''));

const stubTranslator = (states: Record<string, string>) =>
  vi.stubGlobal('Translator', {
    availability: async (o: { sourceLanguage: string; targetLanguage: string }) =>
      states[`${o.sourceLanguage}>${o.targetLanguage}`],
    create: vi.fn(),
  });

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: { sendMessage: vi.fn(), lastError: undefined },
  });
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

describe('translation packs button', () => {
  it('shows when only the de to en pack is missing', async () => {
    stubTranslator({ 'en>de': 'available', 'de>en': 'downloadable' });
    render(<WorkSettings ui={{} as WorkUi} />, host);
    await waitFor(() => packsButton() !== undefined);
    expect(packsButton()?.textContent).toBe('Download English ↔ German');
    expect(packsButton()?.disabled).toBe(false);
  });

  it('shows a busy label and is disabled while a pack downloads', async () => {
    stubTranslator({ 'en>de': 'available', 'de>en': 'downloading' });
    render(<WorkSettings ui={{} as WorkUi} />, host);
    await waitFor(() => packsButton() !== undefined);
    expect(packsButton()?.textContent).toBe('Downloading English ↔ German…');
    expect(packsButton()?.disabled).toBe(true);
  });

  it('is hidden when both packs are available', async () => {
    stubTranslator({ 'en>de': 'available', 'de>en': 'available' });
    render(<WorkSettings ui={{} as WorkUi} />, host);
    await tick();
    await tick();
    expect(packsButton()).toBeUndefined();
  });
});
