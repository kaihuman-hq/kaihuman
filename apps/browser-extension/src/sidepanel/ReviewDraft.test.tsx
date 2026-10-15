import { render } from 'preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReviewDraft } from './ReviewDraft';

let host: HTMLDivElement;
let sent: Record<string, unknown>[];

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const waitFor = async (condition: () => boolean) => {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await tick();
  }
  throw new Error(`Timed out; shows: ${host.textContent}`);
};
const button = (text: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === text) as HTMLButtonElement;

beforeEach(() => {
  sent = [];
  host = document.createElement('div');
  document.body.appendChild(host);
  vi.stubGlobal('chrome', {
    runtime: {
      sendMessage: (message: Record<string, unknown>, respond: (r: unknown) => void) => {
        sent.push(message);
        respond(message.type === 'REVIEW_DRAFT' ? { text: '- Fixed login' } : { success: true });
      },
      lastError: undefined,
    },
  });
});

afterEach(() => {
  render(null, host);
  host.remove();
  vi.unstubAllGlobals();
});

describe('ReviewDraft', () => {
  it('saves the edited text with #standup', async () => {
    render(<ReviewDraft range="standup" onClose={() => {}} />, host);
    await waitFor(() => host.querySelector('textarea') !== null);
    expect(sent[0]).toEqual({ type: 'REVIEW_DRAFT', range: 'standup' });
    const area = host.querySelector('textarea') as HTMLTextAreaElement;
    expect(area.value).toBe('- Fixed login');
    area.value = '- Fixed login\n- Wrote the spec';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    button('Save to action log').click();
    await waitFor(() => sent.length === 2);
    expect(sent[1]).toEqual({
      type: 'ADD_ACTION_LOG',
      description: 'Fixed login; Wrote the spec',
      tags: ['standup'],
    });
    await waitFor(() => host.textContent?.includes('Saved') ?? false);
  });

  it('tags a week review as #review', async () => {
    render(<ReviewDraft range="week" onClose={() => {}} />, host);
    await waitFor(() => host.querySelector('textarea') !== null);
    button('Save to action log').click();
    await waitFor(() => sent.length === 2);
    expect(sent[1]?.tags).toEqual(['review']);
  });
});
