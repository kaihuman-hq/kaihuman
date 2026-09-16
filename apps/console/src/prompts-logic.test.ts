import { describe, expect, it } from 'vitest';
import {
  addPrompt,
  type Prompt,
  parsePrompts,
  serializePrompts,
} from '../../../packages/ui/src/LifeOS/Organisms/Widgets/PromptsLogic';

describe('parsePrompts', () => {
  it('returns an empty list for empty or heading-less content', () => {
    expect(parsePrompts('')).toEqual([]);
    expect(parsePrompts('# Prompts\n\nJust some prose.\n')).toEqual([]);
  });

  it('parses a single prompt with title, tags and body', () => {
    const md = '# Prompts\n\n## Refactor to hooks #react #refactor\n\nConvert the component.\n';

    expect(parsePrompts(md)).toEqual([
      { title: 'Refactor to hooks', tags: ['react', 'refactor'], body: 'Convert the component.' },
    ]);
  });

  it('parses a prompt with no tags', () => {
    expect(parsePrompts('## Plain title\n\nBody.\n')).toEqual([
      { title: 'Plain title', tags: [], body: 'Body.' },
    ]);
  });

  it('keeps multi-line bodies, including blank lines in the middle', () => {
    const md = '## Title #t\n\nline one\n\nline three\n';

    expect(parsePrompts(md)[0]?.body).toBe('line one\n\nline three');
  });

  it('preserves indentation and fenced code inside a body', () => {
    const md = '## Title\n\n```ts\n  const x = 1;\n```\n';

    expect(parsePrompts(md)[0]?.body).toBe('```ts\n  const x = 1;\n```');
  });

  it('separates consecutive prompts', () => {
    const md = '## First #a\n\nbody a\n\n## Second #b\n\nbody b\n';

    expect(parsePrompts(md).map((p) => p.title)).toEqual(['First', 'Second']);
    expect(parsePrompts(md).map((p) => p.body)).toEqual(['body a', 'body b']);
  });

  it('handles a prompt with an empty body', () => {
    expect(parsePrompts('## Empty #x\n\n## Next\n\nbody\n')).toEqual([
      { title: 'Empty', tags: ['x'], body: '' },
      { title: 'Next', tags: [], body: 'body' },
    ]);
  });

  it('unescapes a body line that starts with an escaped heading marker', () => {
    const md = '## Title\n\n\\## not a new prompt\n';

    expect(parsePrompts(md)).toEqual([{ title: 'Title', tags: [], body: '## not a new prompt' }]);
  });

  it('ignores headings that are not exactly level two at column zero', () => {
    const md = '## Real #t\n\n### Deeper heading\n# Top heading\n  ## Indented\n';

    const prompts = parsePrompts(md);
    expect(prompts).toHaveLength(1);
    expect(prompts[0]?.body).toBe('### Deeper heading\n# Top heading\n  ## Indented');
  });

  it('parses CRLF content', () => {
    const md = '# Prompts\r\n\r\n## Title #t\r\n\r\nbody line\r\n';

    expect(parsePrompts(md)).toEqual([{ title: 'Title', tags: ['t'], body: 'body line' }]);
  });

  it('keeps duplicate titles as separate prompts', () => {
    expect(parsePrompts('## Same\n\none\n\n## Same\n\ntwo\n')).toHaveLength(2);
  });
});

describe('serializePrompts', () => {
  it('writes a grep-able heading per prompt', () => {
    const md = serializePrompts([
      { title: 'Refactor to hooks', tags: ['react', 'refactor'], body: 'Convert it.' },
    ]);

    expect(md).toBe('# Prompts\n\n## Refactor to hooks #react #refactor\n\nConvert it.\n');
  });

  it('omits the tag suffix when there are no tags', () => {
    expect(serializePrompts([{ title: 'Plain', tags: [], body: 'Body.' }])).toBe(
      '# Prompts\n\n## Plain\n\nBody.\n',
    );
  });

  it('escapes a body line that would open a new prompt', () => {
    const md = serializePrompts([{ title: 'T', tags: [], body: '## looks like a heading' }]);

    expect(md).toContain('\\## looks like a heading');
    expect(parsePrompts(md)[0]?.body).toBe('## looks like a heading');
  });

  it('writes an empty file as just the document heading', () => {
    expect(serializePrompts([])).toBe('# Prompts\n');
  });
});

describe('round trip', () => {
  const cases: Prompt[][] = [
    [],
    [{ title: 'Only one', tags: [], body: 'body' }],
    [
      { title: 'First', tags: ['a', 'b'], body: 'line one\n\nline three' },
      { title: 'Second', tags: [], body: '' },
      { title: 'Third', tags: ['c'], body: '```ts\n  const x = 1;\n```' },
      { title: 'Escaped', tags: [], body: '## heading-ish\n\\## already escaped' },
    ],
  ];

  it('parse(serialize(x)) === x', () => {
    for (const prompts of cases) {
      expect(parsePrompts(serializePrompts(prompts))).toEqual(prompts);
    }
  });

  it('is idempotent across a second pass', () => {
    const once = serializePrompts(cases[2] as Prompt[]);

    expect(serializePrompts(parsePrompts(once))).toBe(once);
  });
});

describe('addPrompt', () => {
  it('appends a prompt without mutating the input', () => {
    const existing: Prompt[] = [{ title: 'Old', tags: [], body: 'old' }];
    const next = addPrompt(existing, 'New', ['git'], 'new body');

    expect(existing).toHaveLength(1);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({ title: 'New', tags: ['git'], body: 'new body' });
  });

  it('merges tags typed into the title with the selected tags, deduplicated', () => {
    const [prompt] = addPrompt([], 'Commit message #git #ai', ['git'], 'body');

    expect(prompt).toEqual({ title: 'Commit message', tags: ['git', 'ai'], body: 'body' });
  });

  it('trims blank lines around the body but keeps inner indentation', () => {
    const [prompt] = addPrompt([], 'T', [], '\n\n  indented\n\n');

    expect(prompt?.body).toBe('  indented');
  });
});
