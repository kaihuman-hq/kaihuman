import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WikiAnchor } from '../../../../packages/ui/src/LifeOS/Organisms/WikiAnchor';

const host = document.createElement('div');
document.body.append(host);
afterEach(() => act(() => render(null, host)));

const mount = (
  href: string,
  onClientLink?: (slug: string) => void,
  resolved: string | null = null,
) =>
  act(() =>
    render(
      <WikiAnchor
        href={href}
        resolve={() => resolved}
        onOpenPage={() => {}}
        onClientLink={onClientLink}
      >
        Acme
      </WikiAnchor>,
      host,
    ),
  );

describe('WikiAnchor client links', () => {
  it('renders an anchor to the client page and calls onClientLink on click', () => {
    const onClientLink = vi.fn();
    mount('wiki:client%3Aacme-gmbh', onClientLink);
    const a = host.querySelector('a');
    expect(a?.getAttribute('href')).toBe('/clients/acme-gmbh');
    expect(a?.textContent).toBe('Acme');
    const event = new MouseEvent('click', { bubbles: true, cancelable: true });
    act(() => {
      a?.dispatchEvent(event);
    });
    expect(onClientLink).toHaveBeenCalledWith('acme-gmbh');
    expect(event.defaultPrevented).toBe(true);
  });

  it('leaves the click to the browser without onClientLink', () => {
    mount('wiki:client%3Aacme-gmbh');
    // Record the flag, then stop jsdom from attempting a real navigation.
    let prevented: boolean | undefined;
    const spy = (e: Event) => {
      prevented = e.defaultPrevented;
      e.preventDefault();
    };
    document.addEventListener('click', spy);
    act(() => {
      host
        .querySelector('a')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });
    document.removeEventListener('click', spy);
    expect(prevented).toBe(false);
  });

  it('renders an invalid client slug as unresolved, not a link', () => {
    mount('wiki:client%3A..%2Fevil');
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('span')?.textContent).toBe('Acme');
  });
});
