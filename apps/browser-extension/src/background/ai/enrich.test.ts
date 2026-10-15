import { afterEach, describe, expect, it, vi } from 'vitest';
import { enrichCapture, enrichReadLater, readMinutes, withAltText } from './enrich';

afterEach(() => {
  vi.unstubAllGlobals();
});

const stubSummarizer = (summary: string) => {
  const calls: { text: string; context?: string }[] = [];
  vi.stubGlobal('Summarizer', {
    availability: async () => 'available',
    create: async () => ({
      summarize: async (text: string, options?: { context?: string }) => {
        calls.push({ text, context: options?.context });
        return summary;
      },
      destroy: () => {},
    }),
  });
  return calls;
};

/** A `LanguageModel` answering with `answer(input)`, recording every prompt and constraint. */
const stubModel = (answer: (input: unknown) => string) => {
  const prompts: { input: unknown; schema?: any }[] = [];
  const created: any[] = [];
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async (options: object) => {
      created.push(options);
      return {
        prompt: async (input: unknown, options?: { responseConstraint?: object }) => {
          prompts.push({ input, schema: options?.responseConstraint });
          return answer(input);
        },
        destroy: () => {},
      };
    },
  });
  return { prompts, created };
};

describe('readMinutes', () => {
  it('is ceil(words/230), at least 1', () => {
    expect(readMinutes('')).toBe(1);
    expect(readMinutes('word '.repeat(230))).toBe(1);
    expect(readMinutes('word '.repeat(231))).toBe(2);
    expect(readMinutes('word '.repeat(1000))).toBe(5);
  });
});

describe('enrichReadLater', () => {
  const page = { url: 'https://a.b/c', title: 'On rust', text: 'x'.repeat(20_000) };

  it('takes a tldr from the Summarizer and tags from the known ones only', async () => {
    const summarizer = stubSummarizer(' A short take. ');
    const { prompts } = stubModel(() => JSON.stringify({ tags: ['rust', 'perf'] }));
    const result = await enrichReadLater(page, ['rust', 'perf', 'news']);
    expect(result).toEqual({ summary: 'A short take.', tags: ['rust', 'perf'] });
    expect(summarizer[0]?.text).toHaveLength(12_000);
    expect(prompts[0]?.schema.properties.tags.items.enum).toEqual(['rust', 'perf', 'news']);
  });

  it('refuses a tag that is not known', async () => {
    stubSummarizer('S.');
    stubModel(() => JSON.stringify({ tags: ['invented'] }));
    expect(await enrichReadLater(page, ['rust'])).toEqual({ summary: 'S.', tags: [] });
  });

  it('is empty when the model is missing', async () => {
    expect(await enrichReadLater(page, ['rust'])).toEqual({ tags: [] });
  });
});

describe('enrichCapture', () => {
  const note = { title: 'Retries', text: 'Use backoff.', images: [] as Blob[] };

  it('holds the type and key points to the schema', async () => {
    const { prompts } = stubModel(() =>
      JSON.stringify({ type: 'how-to', keyPoints: ['Use backoff', ' Add jitter '], tags: ['ops'] }),
    );
    const result = await enrichCapture(note, ['ops', 'dev']);
    expect(result).toEqual({
      summary: ['Use backoff', 'Add jitter'],
      type: 'how-to',
      tags: ['ops'],
      alts: [],
    });
    const schema = prompts[0]?.schema;
    expect(schema.properties.type.enum).toEqual([
      'snippet',
      'decision',
      'how-to',
      'reference',
      'idea',
    ]);
    expect(schema.properties.tags.items.enum).toEqual(['ops', 'dev']);
  });

  it('refuses an answer outside the schema', async () => {
    stubModel(() => JSON.stringify({ type: 'poem', keyPoints: ['x'], tags: [] }));
    expect(await enrichCapture(note, [])).toEqual({ tags: [], alts: [] });
  });

  it('writes alt text for at most 3 images', async () => {
    const { prompts, created } = stubModel((input) =>
      Array.isArray(input)
        ? JSON.stringify({ alt: 'A chart' })
        : JSON.stringify({ type: 'idea', keyPoints: ['k'], tags: [] }),
    );
    const images = [1, 2, 3, 4, 5].map(() => new Blob(['x'], { type: 'image/png' }));
    const result = await enrichCapture({ ...note, images }, []);
    expect(result.alts).toEqual(['A chart', 'A chart', 'A chart']);
    expect(prompts.filter((p) => Array.isArray(p.input))).toHaveLength(3);
    expect(created.some((o) => o.expectedInputs?.some((i: any) => i.type === 'image'))).toBe(true);
  });

  it('is empty when the model is missing', async () => {
    const images = [new Blob(['x'], { type: 'image/png' })];
    expect(await enrichCapture({ ...note, images }, ['a'])).toEqual({ tags: [], alts: [''] });
  });
});

describe('withAltText', () => {
  it('fills empty alt text by image url and leaves written alt text alone', () => {
    const md = '![](https://a/1.png) ![kept](https://a/2.png) ![](https://a/3.png)';
    const srcs = ['https://a/1.png', 'https://a/2.png', 'https://a/3.png'];
    expect(withAltText(md, srcs, ['One [x]', 'Two', ''])).toBe(
      '![One x](https://a/1.png) ![kept](https://a/2.png) ![](https://a/3.png)',
    );
  });
});
