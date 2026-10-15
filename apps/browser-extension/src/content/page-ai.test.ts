import { describe, expect, it, vi } from 'vitest';
import { askPageAction, summarizePageAction } from './page-ai';

const article = { title: 'A Page', url: 'https://e.com/a', text: 'Body text' };

const setup = (response: object) => {
  const send = vi.fn(async (message: { type: string }) => {
    if (message.type === 'PAGE_SUMMARIZE' || message.type === 'PAGE_ASK') return response;
    return { success: true, url: 'https://app/x' };
  });
  const copy = vi.fn(async () => {});
  return { send, copy };
};

describe('summarize page action', () => {
  it('lists the lines as copyable actions plus Save to knowledge base', async () => {
    const { send, copy } = setup({ lines: ['One', 'Two'] });
    const action = summarizePageAction({ send, copy, article: () => article });
    expect(action.id).toBe('summarize-page');
    const children = await action.children?.();
    expect(send).toHaveBeenCalledWith({ type: 'PAGE_SUMMARIZE', ...article });
    expect(children?.map((c) => c.title)).toEqual(['One', 'Two', 'Save to knowledge base']);
    await children?.[0]?.run?.([]);
    expect(copy).toHaveBeenCalledWith('One');
  });

  it('Save to knowledge base sends CAPTURE_KNOWLEDGE with the summary', async () => {
    const { send, copy } = setup({ lines: ['One', 'Two'] });
    const action = summarizePageAction({ send, copy, article: () => article });
    const children = await action.children?.();
    await children?.at(-1)?.run?.([]);
    const call = send.mock.calls.find(([m]) => m.type === 'CAPTURE_KNOWLEDGE')?.[0] as any;
    expect(call.path).toMatch(/^\.kh\/raw\/\d+-[a-z0-9-]+\.md$/);
    expect(call.content).toContain('One');
    expect(call.content).toContain('Two');
    expect(call.content).toContain('https://e.com/a');
  });

  it('shows the worker’s refusal', async () => {
    const send = vi.fn(async () => {
      throw new Error('The on-device model is not available.');
    });
    const action = summarizePageAction({ send, copy: vi.fn(), article: () => article });
    await expect(action.children?.()).rejects.toThrow('The on-device model is not available.');
  });
});

describe('ask page action', () => {
  it('asks the Question, then lists the answer and Save to knowledge base', async () => {
    const { send, copy } = setup({ answer: 'Two days.' });
    const action = askPageAction({ send, copy, article: () => article });
    expect(action.prompts?.map((p) => p.label)).toEqual(['Question']);
    const [choice] = action.choices?.(['How long?']) ?? [];
    const children = await choice?.action?.children?.();
    expect(send).toHaveBeenCalledWith({ type: 'PAGE_ASK', ...article, question: 'How long?' });
    expect(children?.map((c) => c.title)).toEqual(['Two days.', 'Save to knowledge base']);
    await children?.at(-1)?.run?.([]);
    const call = send.mock.calls.find(([m]) => m.type === 'CAPTURE_KNOWLEDGE')?.[0] as any;
    expect(call.content).toContain('How long?');
    expect(call.content).toContain('Two days.');
  });
});
