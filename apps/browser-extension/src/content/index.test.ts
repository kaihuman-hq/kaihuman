import { PALETTE_HOST_ID } from '@kaihuman/palette';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('../palette/port', () => ({ send: sendMock, workerPort: { send: sendMock } }));

let listener: Listener;
let answerDuplicates: (response: unknown) => void;

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const toggle = async () => {
  listener({ type: 'TOGGLE_COMMAND_PALETTE' }, {}, () => {});
  await tick();
};
const sentOf = (type: string) => sendMock.mock.calls.filter(([m]) => m.type === type);
const subtitles = () =>
  Array.from(
    document.getElementById(PALETTE_HOST_ID)?.shadowRoot?.querySelectorAll('.row .subtitle') ?? [],
  ).map((element) => element.textContent);

beforeEach(async () => {
  vi.resetModules();
  document.body.replaceChildren();
  document.title = 'A page';
  sendMock.mockReset();
  sendMock.mockImplementation(async (message: { type: string }) => {
    if (message.type === 'BOOKMARK_DUPLICATES') {
      return new Promise((resolve) => {
        answerDuplicates = resolve;
      });
    }
    if (message.type === 'BOOKMARK_DRAFT') return { draft: { title: 'Draft', tags: ['x'] } };
    if (message.type === 'GET_BOOKMARKS') return { bookmarks: [] };
    if (message.type === 'GET_RECENTS') return { recents: [] };
    return {};
  });
  vi.stubGlobal('chrome', {
    runtime: {
      onMessage: {
        addListener: (l: Listener) => {
          listener = l;
        },
      },
    },
  });
  await import('./index');
});

describe('the bookmark draft', () => {
  it('is asked for when the palette opens, not when it closes, and once per page', async () => {
    await toggle();
    expect(sentOf('BOOKMARK_DRAFT')).toHaveLength(1);
    expect(sentOf('BOOKMARK_DUPLICATES')).toHaveLength(1);
    answerDuplicates({ duplicates: [] });
    await toggle();
    expect(document.getElementById(PALETTE_HOST_ID)).toBeNull();
    // Closing asks nothing; opening again on the same page reuses the answers.
    await toggle();
    expect(sentOf('BOOKMARK_DRAFT')).toHaveLength(1);
    expect(sentOf('BOOKMARK_DUPLICATES')).toHaveLength(1);
    // A new title (a single-page app moving on) is a new page to ask about.
    await toggle();
    document.title = 'Another page';
    await toggle();
    expect(sentOf('BOOKMARK_DRAFT')).toHaveLength(2);
  });

  it('shows "Already saved" as soon as the duplicate check answers', async () => {
    await toggle();
    expect(subtitles()).not.toContainEqual(expect.stringContaining('Already saved'));
    answerDuplicates({ duplicates: [{ exact: true, title: 'Saved page', url: location.href }] });
    await tick();
    expect(subtitles()).toContain('Already saved: Saved page');
  });
});
