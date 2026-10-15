import type { StreamsFile } from '@kaihuman/formats';
import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { relatedTo } from '../background/ai/grow';
import type { InboxRow } from '../background/work/inbox';
import { RelatedPicker } from './RelatedPicker';

const NOW = '2026-10-15T10:00:00.000Z';
const file = (): StreamsFile => ({
  version: 1,
  updatedAt: NOW,
  invalidStreams: [],
  extra: {},
  streams: [
    {
      id: 'st_a' as never,
      name: 'Payments',
      createdAt: NOW,
      invalidItems: [],
      extra: {},
      items: [
        {
          id: 'it_1' as never,
          url: 'https://github.com/acme/payments/pull/1',
          title: 'Ledger backfill',
          addedAt: NOW,
          labels: [],
          extra: {},
        },
      ],
    },
  ],
});
const row: InboxRow = {
  key: 'acme/payments#5',
  url: 'https://github.com/acme/payments/issues/5',
  title: 'Refund bug',
  repo: 'acme/payments',
  number: 5,
  kind: 'issue',
  reasons: [],
  updatedAt: NOW,
};

let host: HTMLElement;
let sent: Record<string, unknown>[];
let tabs: { url?: string; title?: string }[];
let closed: number;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 100 && !condition(); i++) await tick();
  if (!condition()) throw new Error('timed out');
};
const boxes = () => [...host.querySelectorAll<HTMLInputElement>('input[type=checkbox]')];
const box = (title: string) =>
  boxes().find((b) => b.closest('label')?.textContent === title) as HTMLInputElement;
const button = (text: RegExp) =>
  [...host.querySelectorAll('button')].find((b) => text.test(b.textContent ?? '')) as HTMLElement;

const mount = async () => {
  const f = file();
  render(
    <RelatedPicker stream={f.streams[0] as never} file={f} rows={[row]} onClose={() => closed++} />,
    host,
  );
  // The suggestion has landed once the heading stops saying it is looking.
  await waitFor(() => !host.textContent?.includes('Looking for'));
};

beforeEach(() => {
  closed = 0;
  sent = [];
  tabs = [];
  host = document.createElement('div');
  document.body.append(host);
  (globalThis as unknown as { chrome: unknown }).chrome = {
    storage: { local: { get: async () => ({}) } },
    tabs: { query: async () => tabs },
    runtime: {
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        // The worker's side of "Find related", run here with no model: the rules answer.
        if (message.type === 'RELATED_TO') {
          void relatedTo(message.profile as never, message.candidates as never).then((related) =>
            respond?.({ ok: true, related }),
          );
          return;
        }
        respond?.({ ok: true });
      },
      lastError: undefined,
    },
  };
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('RelatedPicker', () => {
  it('adds the checked items to the stream in one message', async () => {
    tabs = [
      { url: 'https://example.com/a', title: 'Page A' },
      { url: 'https://github.com/acme/payments/pull/9', title: 'Payments PR' },
      { url: 'https://example.com/b', title: 'Page B' },
    ];
    await mount();
    // The same repository is ticked for the user; Page A is added by hand.
    expect(box('Payments PR').checked).toBe(true);
    expect(box('Refund bug').checked).toBe(true);
    expect(box('Page A').checked).toBe(false);
    box('Page A').click();
    box('Refund bug').click();
    await waitFor(() => /Add 2/.test(button(/^Add/).textContent ?? ''));
    button(/^Add 2$/).click();
    await waitFor(() => sent.some((m) => m.type === 'WORK_OPS'));
    expect(sent.map((m) => m.type)).toEqual(['RELATED_TO', 'WORK_OPS']);
    const message = sent[1] as { type: string; ops: Record<string, unknown>[] };
    expect(message.type).toBe('WORK_OPS');
    expect(message.ops).toHaveLength(2);
    expect(message.ops.map((op) => op.url).sort()).toEqual([
      'https://example.com/a',
      'https://github.com/acme/payments/pull/9',
    ]);
    expect(message.ops.every((op) => op.op === 'pin' && op.streamId === 'st_a')).toBe(true);
    await waitFor(() => closed === 1);
  });

  it('asks the worker, keeping inbox rows when there are 40 or more tabs', async () => {
    tabs = Array.from({ length: 45 }, (_, i) => ({
      url: `https://example.com/${i}`,
      title: `Tab ${i}`,
    }));
    await mount();
    const asked = sent.find((m) => m.type === 'RELATED_TO') as {
      profile: { name: string };
      candidates: { title: string }[];
    };
    expect(asked.profile.name).toBe('Payments');
    expect(asked.candidates).toHaveLength(31);
    expect(asked.candidates.at(-1)?.title).toBe('Refund bug');
    expect(box('Refund bug').checked).toBe(true);
  });

  it('excludes already pinned URLs', async () => {
    tabs = [
      { url: 'https://github.com/acme/payments/pull/1', title: 'Pinned already' },
      { url: 'https://example.com/a', title: 'Page A' },
      { url: 'chrome://extensions', title: 'Extensions' },
    ];
    await mount();
    expect(boxes().map((b) => b.closest('label')?.textContent)).toEqual(['Page A', 'Refund bug']);
  });
});
