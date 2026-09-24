import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickActions } from './QuickActions';

let host: HTMLDivElement;

const button = (label: string) => {
  const found = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`);
  if (!found) throw new Error(`No button labelled "${label}"`);
  return found;
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('QuickActions', () => {
  it('saves the page for later from its own button', () => {
    const onReadLater = vi.fn();
    const onPin = vi.fn();
    render(
      <QuickActions
        pageTitle="A page"
        onPin={onPin}
        onBookmark={() => {}}
        onReadLater={onReadLater}
        status="idle"
      />,
      host,
    );
    button('Read this page later').click();
    expect(onReadLater).toHaveBeenCalledOnce();
    expect(onPin).not.toHaveBeenCalled();
  });

  it('holds the button while something is saving', () => {
    render(
      <QuickActions
        pageTitle="A page"
        onPin={() => {}}
        onBookmark={() => {}}
        onReadLater={() => {}}
        status="saving"
      />,
      host,
    );
    expect(button('Read this page later').disabled).toBe(true);
  });
});
