// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WikiAnchor } from './WikiAnchor';

let host: HTMLDivElement | null = null;
afterEach(() => {
  if (host) {
    act(() => render(null, host as HTMLDivElement));
    host.remove();
    host = null;
  }
});

function click(init: MouseEventInit) {
  const onClientLink = vi.fn();
  host = document.createElement('div');
  document.body.appendChild(host);
  const el = host;
  act(() =>
    render(
      <WikiAnchor
        href="wiki:client%3Aacme"
        resolve={() => null}
        onOpenPage={vi.fn()}
        onClientLink={onClientLink}
      >
        Acme
      </WikiAnchor>,
      el,
    ),
  );
  const event = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ...init });
  host.querySelector('a')?.dispatchEvent(event);
  return { onClientLink, prevented: event.defaultPrevented };
}

describe('WikiAnchor client links', () => {
  it('routes a plain left click', () => {
    const { onClientLink, prevented } = click({});
    expect(onClientLink).toHaveBeenCalledWith('acme');
    expect(prevented).toBe(true);
  });

  it.each([
    ['meta', { metaKey: true }],
    ['ctrl', { ctrlKey: true }],
    ['shift', { shiftKey: true }],
    ['alt', { altKey: true }],
    ['middle button', { button: 1 }],
  ])('leaves a %s click to the browser', (_name, init) => {
    const { onClientLink, prevented } = click(init);
    expect(onClientLink).not.toHaveBeenCalled();
    expect(prevented).toBe(false);
  });
});
