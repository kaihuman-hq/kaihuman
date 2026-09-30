import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { PinnedTabsPanel } from './PinnedTabsPanel';

let GROUPS: {
  id: string;
  name: string;
  createdAt: string;
  tabCount: number;
  favorite: boolean;
}[];
let sent: Record<string, unknown>[];

let host: HTMLDivElement;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

// preact runs effects off requestAnimationFrame, so the mount's group fetch lands a few ticks
// after render; polling keeps that independent of jsdom's timer resolution.
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error('Timed out waiting for the panel to settle');
};

const buttonLabels = () =>
  [...host.querySelectorAll('button')].map((b) => (b.textContent || '').trim());

const click = (label: string) => {
  const button = [...host.querySelectorAll('button')].find(
    (b) => (b.textContent || '').trim() === label,
  );
  if (!button) throw new Error(`No button labelled "${label}"`);
  button.click();
};

beforeEach(async () => {
  GROUPS = [
    { id: 'a', name: 'Work', createdAt: '2026-09-01T10:00:00.000Z', tabCount: 3, favorite: false },
    {
      id: 'b',
      name: 'Reading',
      createdAt: '2026-09-02T10:00:00.000Z',
      tabCount: 1,
      favorite: false,
    },
  ];
  sent = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      connect: () => ({ disconnect: () => {} }),
      sendMessage: (message: Record<string, unknown>, respond: (response: unknown) => void) => {
        sent.push(message);
        if (message.type === 'FAVORITE_PINNED_TAB_GROUP') {
          GROUPS = GROUPS.map((g) =>
            g.id === message.groupId ? { ...g, favorite: message.favorite === true } : g,
          );
        }
        respond({ groups: GROUPS, activeId: 'a' });
      },
      lastError: undefined,
    },
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<PinnedTabsPanel repo="owner/repo" />, host);
  await waitFor(() => buttonLabels().includes('Load'));
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('PinnedTabsPanel', () => {
  it('shows only the name and the load/update button by default', () => {
    expect(host.textContent).toContain('Work');
    expect(host.textContent).toContain('Reading');
    expect(buttonLabels()).toContain('Load');
    expect(buttonLabels()).toContain('Update');
    expect(buttonLabels()).not.toContain('Rename');
    expect(buttonLabels()).not.toContain('Delete');
    expect(buttonLabels()).not.toContain('↑');
    expect(host.textContent).not.toContain('3 tabs');
  });

  it('swaps the load button for the management controls in edit mode', async () => {
    click('Edit');
    await tick();

    expect(buttonLabels()).not.toContain('Load');
    expect(buttonLabels()).not.toContain('Update');
    expect(buttonLabels()).toContain('Rename');
    expect(buttonLabels()).toContain('Delete');
    expect(buttonLabels()).toContain('↑');
    expect(buttonLabels()).toContain('↓');
    expect(host.textContent).toContain('3 tabs');
  });

  it('returns to the load view when edit mode is left', async () => {
    click('Edit');
    await tick();
    click('Done');
    await tick();

    expect(buttonLabels()).toContain('Load');
    expect(buttonLabels()).not.toContain('Rename');
    expect(host.textContent).not.toContain('3 tabs');
  });

  it('marks a group as a favourite and highlights it, keeping the file order', async () => {
    const star = (name: string) =>
      host.querySelector<HTMLButtonElement>(
        `button[aria-label="Add ${name} to favourites"], button[aria-label="Remove ${name} from favourites"]`,
      ) as HTMLButtonElement;

    star('Reading').click();
    await waitFor(() => star('Reading').getAttribute('aria-pressed') === 'true');

    expect(sent.find((message) => message.type === 'FAVORITE_PINNED_TAB_GROUP')).toEqual({
      type: 'FAVORITE_PINNED_TAB_GROUP',
      groupId: 'b',
      favorite: true,
    });
    expect(star('Reading').textContent).toBe('★');
    expect(host.textContent).toContain('Added Reading to favourites');
    const names = [...host.querySelectorAll('div.truncate')].map((div) => div.textContent);
    expect(names).toEqual(['● Work', 'Reading']);
    expect(star('Reading').nextElementSibling?.firstElementChild?.className).toContain('font-bold');

    star('Reading').click();
    await waitFor(() => star('Reading').getAttribute('aria-pressed') === 'false');
    expect(
      sent.filter((message) => message.type === 'FAVORITE_PINNED_TAB_GROUP').at(-1),
    ).toMatchObject({ favorite: false });
  });

  it('drops a pending delete confirmation when edit mode is left', async () => {
    click('Edit');
    await tick();
    click('Delete');
    await tick();
    expect(host.textContent).toContain('Delete Work?');

    click('Done');
    await tick();
    click('Edit');
    await tick();

    expect(host.textContent).not.toContain('Delete Work?');
  });
});
