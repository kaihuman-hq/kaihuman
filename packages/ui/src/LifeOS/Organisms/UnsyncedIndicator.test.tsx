// @vitest-environment jsdom
import type { signal } from '@preact/signals';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

const unsyncedCount = vi.hoisted(() => ({ current: null as null | { value: number } }));
vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  unsyncedCount.current = signal(0);
  return { githubFileStore: { unsyncedCount: unsyncedCount.current } };
});

const { UnsyncedIndicator } = await import('./UnsyncedIndicator');

const host = document.createElement('div');
document.body.appendChild(host);
const count = unsyncedCount.current as ReturnType<typeof signal<number>>;

afterEach(() => {
  act(() => render(null, host));
  count.value = 0;
});

describe('UnsyncedIndicator', () => {
  it('renders nothing at zero', () => {
    act(() => render(<UnsyncedIndicator />, host));
    expect(host.innerHTML).toBe('');
  });

  it('shows the count with an explanatory tooltip, and follows the signal', () => {
    act(() => render(<UnsyncedIndicator />, host));
    act(() => {
      count.value = 3;
    });
    expect(host.textContent).toContain('3');
    expect(host.querySelector('[title]')?.getAttribute('title')).toContain(
      'waiting to reach GitHub',
    );
    act(() => {
      count.value = 0;
    });
    expect(host.innerHTML).toBe('');
  });
});
