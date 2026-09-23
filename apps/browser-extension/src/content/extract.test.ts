// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { extractArticle, htmlToMarkdown } from './extract';

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

function htmlDoc(body: string, url = 'https://example.com/posts/one'): Document {
  const doc = document.implementation.createHTMLDocument('Post');
  const base = doc.createElement('base');
  base.href = url;
  doc.head.appendChild(base);
  doc.body.innerHTML = body;
  return doc;
}

describe('htmlToMarkdown', () => {
  it('keeps the article and drops navigation, footers and boilerplate', () => {
    const doc = htmlDoc(`
      <nav><a href="/">Home</a></nav>
      <article>
        <h1>Title</h1>
        <p>Hello <strong>bold</strong> and <em>soft</em> <a href="/x">link</a>.</p>
        <div class="share-buttons">Share me</div>
      </article>
      <footer>Copyright</footer>`);
    expect(htmlToMarkdown(doc).markdown).toBe(
      '# Title\n\nHello **bold** and _soft_ [link](https://example.com/x).',
    );
  });

  it('picks the longest article when a page has several', () => {
    const doc = htmlDoc('<article>short</article><article><p>the real long article</p></article>');
    expect(htmlToMarkdown(doc).markdown).toBe('the real long article');
  });

  it('converts lists, nested lists, quotes and tables', () => {
    const doc = htmlDoc(`
      <main>
        <ul><li>one<ul><li>inner</li></ul></li><li>two</li></ul>
        <ol><li>first</li><li>second</li></ol>
        <blockquote><p>quoted</p><p>twice</p></blockquote>
        <table><tr><th>a</th><th>b</th></tr><tr><td>1</td><td>x|y</td></tr></table>
      </main>`);
    expect(htmlToMarkdown(doc).markdown).toBe(
      [
        '- one\n\n  - inner',
        '- two',
        '',
        '1. first',
        '2. second',
        '',
        '> quoted\n>\n> twice',
        '',
        '| a | b |\n| --- | --- |\n| 1 | x\\|y |',
      ].join('\n'),
    );
  });

  it('keeps code blocks verbatim, blank lines and language included', () => {
    const doc = htmlDoc(
      '<main><p>Use <code>npm i</code></p><pre><code class="language-ts">const a = 1;\n\n\nconst b = 2;\n</code></pre></main>',
    );
    expect(htmlToMarkdown(doc).markdown).toBe(
      'Use `npm i`\n\n```ts\nconst a = 1;\n\n\nconst b = 2;\n```',
    );
  });

  it('resolves images to absolute urls, lists them, and skips data: uris', () => {
    const doc = htmlDoc(
      '<main><img src="/a.png" alt="A [chart]"><img src="data:image/png;base64,xx"><img data-src="b.jpg"></main>',
    );
    const { markdown, images } = htmlToMarkdown(doc);
    expect(markdown).toBe(
      '![A chart](https://example.com/a.png)![](https://example.com/posts/b.jpg)',
    );
    expect(images).toEqual(['https://example.com/a.png', 'https://example.com/posts/b.jpg']);
  });

  it('keeps link text but drops javascript: and in-page anchors', () => {
    const doc = htmlDoc(
      '<main><p><a href="javascript:void(0)">js</a> <a href="#top">top</a></p></main>',
    );
    expect(htmlToMarkdown(doc).markdown).toBe('js top');
  });
});
