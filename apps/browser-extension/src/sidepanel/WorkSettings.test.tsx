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

/** What the worker reports it can use; the panel's own globals do not count. */
let workerSees: Record<string, string>;
/** The translator's state in the worker: the least ready of en->de and de->en. */
const stubTranslator = (states: Record<string, string>) => {
  const order = ['unavailable', 'downloading', 'downloadable', 'available'];
  const values = Object.values(states);
  workerSees.translator = order.find((state) => values.includes(state)) ?? 'unavailable';
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  workerSees = {
    prompt: 'available',
    summarizer: 'available',
    translator: 'available',
    detector: 'available',
  };
  vi.stubGlobal('chrome', {
    storage: { local: { get: async () => ({}), set: async () => {} } },
    runtime: {
      sendMessage: vi.fn((message: { type: string }, respond?: (r: unknown) => void) => {
        if (message.type === 'AI_AVAILABILITY') {
          respond?.({ ok: true, availability: { ...workerSees } });
        } else respond?.({ ok: true });
      }),
      lastError: undefined,
    },
  });
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

describe('model status', () => {
  it('reports what the worker can use, not what the panel can', async () => {
    // The panel has every API; the worker, where the model runs, has none of them ready.
    vi.stubGlobal('LanguageModel', { availability: async () => 'available' });
    vi.stubGlobal('Summarizer', { availability: async () => 'available' });
    workerSees = {
      prompt: 'unavailable',
      summarizer: 'unavailable',
      translator: 'downloadable',
      detector: 'unavailable',
    };
    render(<WorkSettings ui={{} as WorkUi} />, host);
    await waitFor(() => host.textContent?.includes('not available on this device') ?? false);
    expect(host.textContent).toContain('summarizer is not available');
    expect(packsButton()?.textContent).toBe('Download English ↔ German');
  });
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
