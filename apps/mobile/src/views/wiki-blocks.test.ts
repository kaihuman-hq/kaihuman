import { describe, expect, it } from 'vitest';
import { tokenizeWikiLinks } from '../screens/wiki-screen.js';
import { wikiBlocks, withoutTitleHeading } from './wiki-blocks.js';

const blocks = (md: string) => wikiBlocks(tokenizeWikiLinks(md));

describe('wikiBlocks', () => {
  it('parses headings, bullets, quotes, code and paragraphs', () => {
    const out = blocks(
      [
        '---',
        'title: x',
        '---',
        '# Clients',
        '',
        'Active work:',
        'more text.',
        '## Northwind',
        '### Notes',
        '- one',
        '  - nested',
        '1. first',
        '> quoted',
        '```',
        '# not a heading',
        '```',
      ].join('\n'),
    );
    expect(out.map((b) => b.kind)).toEqual([
      'heading',
      'paragraph',
      'heading',
      'heading',
      'bullet',
      'bullet',
      'bullet',
      'quote',
      'code',
    ]);
    expect(out[0]).toMatchObject({ level: 1, inlines: [{ type: 'text', text: 'Clients' }] });
    expect(out[1]).toMatchObject({
      inlines: [
        { type: 'text', text: 'Active work:' },
        { type: 'text', text: ' ' },
        { type: 'text', text: 'more text.' },
      ],
    });
    expect(out[3]).toMatchObject({ level: 3 });
    expect(out[5]).toMatchObject({ marker: '•', depth: 1 });
    expect(out[6]).toMatchObject({ marker: '1.' });
    expect(out[8]).toEqual({ kind: 'code', text: '# not a heading' });
  });

  it('keeps wikilinks inside headings and list items', () => {
    const out = blocks('## See [[Other]]\n- [[Home]] page');
    expect(out[0]).toMatchObject({
      kind: 'heading',
      inlines: [
        { type: 'text', text: 'See ' },
        { type: 'link', label: 'Other' },
      ],
    });
    expect(out[1]).toMatchObject({
      kind: 'bullet',
      inlines: [
        { type: 'link', label: 'Home' },
        { type: 'text', text: ' page' },
      ],
    });
  });

  it('lets a leading H1 that repeats the title replace it', () => {
    const parsed = blocks('# Clients\n\nBody');
    expect(withoutTitleHeading('clients', parsed)).toMatchObject({
      title: 'Clients',
      blocks: [{ kind: 'paragraph' }],
    });
    expect(withoutTitleHeading('Other', parsed).blocks).toHaveLength(2);
  });
});
