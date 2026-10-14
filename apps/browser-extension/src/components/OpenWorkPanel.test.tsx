import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenWorkPanel } from './OpenWorkPanel';

let host: HTMLDivElement;
let opened: unknown[];
let closed: number;
let getCurrent: ReturnType<typeof vi.fn>;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  opened = [];
  closed = 0;
  getCurrent = vi.fn(async () => ({ id: 4 }));
  (globalThis as unknown as { chrome: unknown }).chrome = {
    windows: { getCurrent },
    sidePanel: {
      open: async (options: unknown) => {
        opened.push(options);
      },
    },
  };
  vi.spyOn(window, 'close').mockImplementation(() => {
    closed++;
  });
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.restoreAllMocks();
});

describe('OpenWorkPanel', () => {
  it('opens the side panel inside the click, then closes the popup', async () => {
    render(<OpenWorkPanel />, host);
    // Effects run after paint; then the window id lands and the button re-renders with it.
    await vi.waitFor(() => expect(getCurrent).toHaveBeenCalled());
    await tick();
    await tick();
    const button = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open work panel',
    );
    button?.click();
    expect(opened).toEqual([{ windowId: 4 }]);
    await tick();
    expect(closed).toBe(1);
  });
});
