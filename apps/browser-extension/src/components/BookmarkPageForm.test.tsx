import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookmarkPageForm } from './BookmarkPageForm';

let host: HTMLDivElement;
let sent: Record<string, unknown>[];

beforeEach(() => {
  sent = [];
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: {
      sendMessage: (message: Record<string, unknown>, respond?: (response: unknown) => void) => {
        sent.push(message);
        if (message.type === 'BOOKMARK_DRAFT') {
          respond?.({
            success: true,
            draft: { title: 'Deploy guide', tags: ['ops'], environment: null },
            duplicates: [
              {
                kind: 'bookmark',
                title: 'Deploy guide',
                url: 'https://example.com/a',
                exact: true,
              },
            ],
          });
        }
      },
      lastError: undefined,
    },
  };
  host = document.createElement('div');
  document.body.appendChild(host);
});

afterEach(() => {
  render(null, host);
  host.remove();
});

describe('BookmarkPageForm', () => {
  it('prefills the draft and shows Open existing', async () => {
    render(
      <BookmarkPageForm
        page={{ title: 'Deploy guide - Example', url: 'https://example.com/a' }}
        repo="o/r"
        onClose={() => {}}
      />,
      host,
    );
    await vi.waitFor(() => {
      expect((host.querySelector('#bookmark-title') as HTMLInputElement).value).toBe(
        'Deploy guide',
      );
    });
    expect((host.querySelector('#bookmark-tags') as HTMLInputElement).value).toBe('ops');
    const open = [...host.querySelectorAll('button')].find(
      (b) => b.textContent === 'Open existing',
    );
    expect(open).toBeTruthy();
    open?.click();
    expect(sent).toContainEqual({ type: 'OPEN_URL', url: 'https://example.com/a' });
  });
});
