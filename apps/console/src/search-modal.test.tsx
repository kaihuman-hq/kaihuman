import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SearchModal } from '../../../packages/ui/src/LifeOS/Organisms/SearchModal';

let host: HTMLDivElement;

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ items: [] }) })),
  );
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const search = async (currentRepository?: string) => {
  act(() => {
    render(
      <SearchModal
        isOpen
        onClose={() => {}}
        onSelect={() => {}}
        currentRepository={currentRepository}
      />,
      host,
    );
  });
  const input = host.querySelector('input') as HTMLInputElement;
  act(() => {
    input.value = 'needle';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(600);
  });
};

describe('SearchModal content search', () => {
  it('searches the current repository', async () => {
    await search('o/r');
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining(encodeURIComponent('needle repo:o/r')),
      expect.anything(),
    );
  });

  it('searches no repository at all when none is picked, rather than a built-in one', async () => {
    await search(undefined);
    expect(fetch).not.toHaveBeenCalled();
    expect(host.querySelector('input')?.placeholder).toBe('Search files in your repository...');
  });
});
