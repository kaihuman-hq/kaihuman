import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TidyTabs } from './TidyTabs';

let sent: Record<string, any>[];
let remove: ReturnType<typeof vi.fn>;
let host: HTMLDivElement;

const RESPONSE = {
  success: true,
  tabs: [
    { id: 1, title: 'One', url: 'https://a.dev/1' },
    { id: 2, title: 'Two', url: 'https://a.dev/2' },
    { id: 3, title: 'Three', url: 'https://b.dev/3' },
    { id: 4, title: 'Four', url: 'https://b.dev/4' },
  ],
  proposals: [
    { name: 'A site', tabIds: [1, 2] },
    { name: 'B site', tabIds: [3, 4] },
  ],
  streams: [{ id: 'stream-1', name: 'Research' }],
};

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error('Timed out');
};

const labels = () => [...host.querySelectorAll('button')].map((b) => (b.textContent || '').trim());
const click = (label: string) => {
  const found = [...host.querySelectorAll('button')].find(
    (b) => (b.textContent || '').trim() === label,
  );
  if (!found) throw new Error(`No button labelled "${label}"`);
  found.click();
};

beforeEach(async () => {
  sent = [];
  remove = vi.fn();
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (message: Record<string, any>, respond: (response: unknown) => void) => {
        sent.push(message);
        if (message.type === 'TIDY_TABS') respond(RESPONSE);
        else if (message.type === 'SAVE_PINNED_TAB_GROUP')
          respond({ success: true, count: message.tabs.length, name: message.name });
        else respond({ success: true });
      },
    },
    tabs: { remove },
  };
  host = document.createElement('div');
  document.body.appendChild(host);
  render(<TidyTabs onClose={() => {}} />, host);
  await waitFor(() => labels().includes('Skip'));
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('TidyTabs', () => {
  it('shows one proposal at a time', () => {
    expect(host.textContent).toContain('A site');
    expect(host.textContent).not.toContain('B site');
    expect(labels()).toEqual(
      expect.arrayContaining([
        'Save as pinned-tab group',
        'Pin all to stream…',
        'Close these tabs',
        'Skip',
      ]),
    );
  });

  it('nothing closes without Close these tabs', async () => {
    click('Skip');
    await waitFor(() => host.textContent?.includes('B site') ?? false);
    click('Save as pinned-tab group');
    await waitFor(() => host.textContent?.includes('last group') ?? false);
    expect(remove).not.toHaveBeenCalled();
    expect(sent.some((m) => m.type === 'TIDY_CLOSE_TABS')).toBe(false);
  });

  it('Close these tabs closes only this proposal’s tabs', async () => {
    click('Close these tabs');
    await waitFor(() => host.textContent?.includes('B site') ?? false);
    expect(sent.filter((m) => m.type === 'TIDY_CLOSE_TABS')).toEqual([
      { type: 'TIDY_CLOSE_TABS', tabIds: [1, 2] },
    ]);
  });

  it('Save as pinned-tab group sends the proposal’s tabs under its name', async () => {
    click('Save as pinned-tab group');
    await waitFor(() => host.textContent?.includes('B site') ?? false);
    expect(sent.find((m) => m.type === 'SAVE_PINNED_TAB_GROUP')).toEqual({
      type: 'SAVE_PINNED_TAB_GROUP',
      name: 'A site',
      tabs: [
        { url: 'https://a.dev/1', title: 'One' },
        { url: 'https://a.dev/2', title: 'Two' },
      ],
    });
  });

  it('Pin all sends one WORK_OPS', async () => {
    click('Pin all to stream…');
    await waitFor(() => labels().includes('Research'));
    click('Research');
    await waitFor(() => host.textContent?.includes('B site') ?? false);
    const ops = sent.filter((m) => m.type === 'WORK_OPS');
    expect(ops).toHaveLength(1);
    expect(ops[0]?.ops).toHaveLength(2);
    expect(ops[0]?.ops[0]).toMatchObject({
      op: 'pin',
      streamId: 'stream-1',
      url: 'https://a.dev/1',
      title: 'One',
    });
    expect(remove).not.toHaveBeenCalled();
  });
});
