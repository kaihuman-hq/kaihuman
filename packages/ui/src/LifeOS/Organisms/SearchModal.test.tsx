// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  return {
    githubFileStore: { tree: signal([]) },
    layoutStore: { activeWikiRoot: signal(''), view: signal('') },
    Logger: class {
      debug() {}
      warn() {}
      error() {}
    },
  };
});

const { SearchModal } = await import('./SearchModal');

let host: HTMLDivElement;
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

const show = (props: Record<string, unknown>) =>
  act(() => render(<SearchModal isOpen onClose={vi.fn()} onSelect={vi.fn()} {...props} />, host));
const type = (value: string) =>
  act(() => {
    const input = host.querySelector('input') as HTMLInputElement;
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

describe('SearchModal business capture', () => {
  it('shows the result once the clients arrive, without retyping, and runs the current handler', () => {
    host = document.createElement('div');
    document.body.appendChild(host);
    const first = vi.fn();
    const second = vi.fn();
    show({ businessClients: [], onBusinessCapture: first });
    type('todo acme: x');
    expect(host.textContent).not.toContain('Add todo for');

    show({ businessClients: ['acme-gmbh'], onBusinessCapture: second });
    expect(host.textContent).toContain('Add todo for acme-gmbh: x');

    act(() => {
      (host.querySelector('input') as HTMLInputElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith({ kind: 'todo', client: 'acme-gmbh', text: 'x' });
  });
});
