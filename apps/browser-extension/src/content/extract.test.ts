// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractArticle } from './extract';

function makeDoc(title: string, canonical: string | null, bodyText: string): Document {
  const doc = document.implementation.createHTMLDocument(title);
  if (canonical) {
    const link = doc.createElement('link');
    link.rel = 'canonical';
    link.href = canonical;
    doc.head.appendChild(link);
  }
  doc.body.innerText = bodyText;
  return doc;
}

describe('extractArticle', () => {
  it('returns title, canonical url, and trimmed body text', () => {
    const doc = makeDoc('My Article', 'https://example.com/article', '  Article body  ');
    const result = extractArticle(doc);
    expect(result.title).toBe('My Article');
    expect(result.url).toBe('https://example.com/article');
    expect(result.text).toBe('Article body');
  });

  it('falls back to empty string when no canonical link', () => {
    const doc = makeDoc('No Canonical', null, 'Some text');
    const result = extractArticle(doc);
    expect(result.url).toBe('');
  });

  it('returns empty string for missing body', () => {
    const doc = document.implementation.createHTMLDocument('Empty');
    doc.body.remove();
    expect(extractArticle(doc).text).toBe('');
  });
});
