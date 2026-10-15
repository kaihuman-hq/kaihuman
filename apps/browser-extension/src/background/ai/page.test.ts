import { afterEach, describe, expect, it, vi } from 'vitest';
import { askPage, PAGE_TEXT_LIMIT, pageSummary } from './page';

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubSummarizer = (summary: string) => {
  const calls: { text: string; options: unknown }[] = [];
  vi.stubGlobal('Summarizer', {
    availability: async () => 'available',
    create: async (options: unknown) => ({
      summarize: async (text: string) => {
        calls.push({ text, options });
        return summary;
      },
      destroy: () => {},
    }),
  });
  return calls;
};

const stubModel = (answer: string) => {
  const prompts: { input: unknown; schema?: any }[] = [];
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => ({
      prompt: async (input: unknown, options?: { responseConstraint?: object }) => {
        prompts.push({ input, schema: options?.responseConstraint });
        return answer;
      },
      destroy: () => {},
    }),
  });
  return prompts;
};

describe('pageSummary', () => {
  it('text is cut to 12,000 characters', async () => {
    const calls = stubSummarizer('- one');
    await pageSummary('a'.repeat(PAGE_TEXT_LIMIT + 500));
    expect(PAGE_TEXT_LIMIT).toBe(12_000);
    expect(calls[0]?.text).toHaveLength(12_000);
  });

  it('summary lines come from key points', async () => {
    const calls = stubSummarizer('- First point\n* Second point\n\n• Third point\n');
    expect(await pageSummary('Some page')).toEqual(['First point', 'Second point', 'Third point']);
    expect(calls[0]?.options).toMatchObject({ type: 'key-points', length: 'medium' });
  });

  it('is null without the model', async () => {
    expect(await pageSummary('Some page')).toBeNull();
  });
});

describe('askPage', () => {
  it('ask answers from the page text', async () => {
    const prompts = stubModel(JSON.stringify({ answer: 'Two days.' }));
    expect(await askPage('Shipping takes two days.', 'How long?')).toBe('Two days.');
    expect(prompts[0]?.schema).toMatchObject({
      type: 'object',
      properties: { answer: { type: 'string', maxLength: 600 } },
      required: ['answer'],
    });
    expect(String(prompts[0]?.input)).toContain('Shipping takes two days.');
    expect(String(prompts[0]?.input)).toContain('How long?');
  });

  it('cuts the page text and refuses an invalid answer', async () => {
    const prompts = stubModel(JSON.stringify({ answer: 7 }));
    expect(await askPage('a'.repeat(PAGE_TEXT_LIMIT + 500), 'Q?')).toBeNull();
    expect(String(prompts[0]?.input)).not.toContain('a'.repeat(PAGE_TEXT_LIMIT + 1));
  });

  it('is null without the model', async () => {
    expect(await askPage('text', 'Q?')).toBeNull();
  });
});
