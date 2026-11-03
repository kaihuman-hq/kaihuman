import { describe, expect, it } from 'vitest';
import { el, escapeXml, renderXml, txt } from './xml.js';

describe('xml builder', () => {
  it('escapes the five special characters in text and attributes', () => {
    expect(escapeXml(`a & b < c > "d" 'e'`)).toBe(
      'a &amp; b &lt; c &gt; &quot;d&quot; &apos;e&apos;',
    );
    const xml = renderXml(txt('a', 'x & y', { k: '"<&' }) ?? el('a', undefined));
    expect(xml).toContain('<a k="&quot;&lt;&amp;">x &amp; y</a>');
  });

  it('indents with two spaces, drops empty children and self-closes empty elements', () => {
    const xml = renderXml(
      el(
        'r',
        undefined,
        el('a', undefined, txt('b', '1'), null, undefined, false),
        el('c', undefined),
      ),
      { x: 'urn:x', '': 'urn:d' },
    );
    expect(xml).toBe(
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
        '<r xmlns:x="urn:x" xmlns="urn:d">\n  <a>\n    <b>1</b>\n  </a>\n  <c/>\n</r>\n',
    );
  });

  it('strips XML-illegal control characters but keeps tab, newline and astral characters', () => {
    expect(escapeXml('a\u0000b\u0008c\u000bd￾e\tf\ng\u{1F600}')).toBe('abcde\tf\ng\u{1F600}');
  });

  it('txt returns null without text', () => {
    expect(txt('a', undefined)).toBeNull();
    expect(txt('a', '')).toEqual({ name: 'a', text: '' });
  });
});
