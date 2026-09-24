export type ArticleData = { title: string; url: string; text: string; images: string[] };

// Page chrome that never belongs in a knowledge-base source.
const DROPPED_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'TEMPLATE',
  'NAV',
  'HEADER',
  'FOOTER',
  'ASIDE',
  'FORM',
  'BUTTON',
  'INPUT',
  'SELECT',
  'TEXTAREA',
  'IFRAME',
  'SVG',
  'CANVAS',
  'DIALOG',
]);
const DROPPED_ROLES = new Set([
  'navigation',
  'banner',
  'contentinfo',
  'complementary',
  'search',
  'dialog',
]);
const BOILERPLATE =
  /\b(comments?|share|sharing|social|related|promo|advert|ads?|cookie|newsletter|subscribe|sidebar|breadcrumbs?)\b/i;

// Code blocks are swapped for placeholders while whitespace is normalised, so blank lines
// inside them survive.
const PRE_TOKEN = '\u0000PRE';

type Ctx = { base: string; pre: string[]; images: Set<string> };

function textLength(el: Element): number {
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length;
}

/** The element most likely to hold the article, the way Readability looks first. */
function pickRoot(doc: Document): Element | null {
  const articles = Array.from(doc.querySelectorAll('article'));
  if (articles.length > 0) {
    return articles.reduce((best, el) => (textLength(el) > textLength(best) ? el : best));
  }
  return doc.querySelector('main, [role="main"]') ?? doc.body;
}

function isDropped(el: Element, root: Element): boolean {
  if (el === root) return false;
  if (DROPPED_TAGS.has(el.tagName)) return true;
  if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return true;
  const role = el.getAttribute('role');
  if (role && DROPPED_ROLES.has(role)) return true;
  const hint = `${el.id} ${typeof el.className === 'string' ? el.className : ''}`;
  return BOILERPLATE.test(hint);
}

function absolute(href: string | null, base: string): string | null {
  if (!href) return null;
  try {
    return new URL(href, base || undefined).href;
  } catch {
    return null;
  }
}

function block(content: string): string {
  const trimmed = content.trim();
  return trimmed ? `\n\n${trimmed}\n\n` : '';
}

function prefixLines(content: string, first: string, rest: string): string {
  return content
    .split('\n')
    .map((line, i) => (i === 0 ? first : line ? rest : '') + line)
    .join('\n');
}

function convertChildren(el: Element, root: Element, ctx: Ctx): string {
  let out = '';
  for (const child of Array.from(el.childNodes)) {
    if (child.nodeType === 3) out += (child.textContent ?? '').replace(/\s+/g, ' ');
    else if (child.nodeType === 1) out += convert(child as Element, root, ctx);
  }
  return out;
}

function convertList(el: Element, root: Element, ctx: Ctx): string {
  const ordered = el.tagName === 'OL';
  const items = Array.from(el.children).filter((c) => c.tagName === 'LI');
  const lines = items.map((li, i) => {
    const marker = ordered ? `${i + 1}. ` : '- ';
    const body = convertChildren(li, root, ctx)
      .trim()
      .replace(/\n{3,}/g, '\n\n');
    return prefixLines(body, marker, ' '.repeat(marker.length));
  });
  return block(lines.join('\n'));
}

function convertTable(el: Element, root: Element, ctx: Ctx): string {
  const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
    Array.from(tr.children).map((cell) =>
      convertChildren(cell, root, ctx).replace(/\s+/g, ' ').trim().replace(/\|/g, '\\|'),
    ),
  );
  if (rows.length === 0) return '';
  const width = Math.max(...rows.map((r) => r.length));
  const line = (cells: string[]) =>
    `| ${Array.from({ length: width }, (_, i) => cells[i] ?? '').join(' | ')} |`;
  const [head, ...body] = rows;
  return block([line(head), line(Array(width).fill('---')), ...body.map(line)].join('\n'));
}

function convert(el: Element, root: Element, ctx: Ctx): string {
  if (isDropped(el, root)) return '';
  const tag = el.tagName;
  const inner = () => convertChildren(el, root, ctx);

  switch (tag) {
    case 'H1':
    case 'H2':
    case 'H3':
    case 'H4':
    case 'H5':
    case 'H6': {
      const text = inner().replace(/\s+/g, ' ').trim();
      return text ? block(`${'#'.repeat(Number(tag[1]))} ${text}`) : '';
    }
    case 'BR':
      return '\n';
    case 'HR':
      return '\n\n---\n\n';
    case 'STRONG':
    case 'B': {
      const text = inner().trim();
      return text ? `**${text}**` : '';
    }
    case 'EM':
    case 'I': {
      const text = inner().trim();
      return text ? `_${text}_` : '';
    }
    case 'CODE':
      return `\`${el.textContent ?? ''}\``;
    case 'PRE': {
      const lang = /language-([\w+-]+)/.exec(el.querySelector('code')?.className ?? '')?.[1];
      const code = (el.textContent ?? '').replace(/\n+$/, '');
      ctx.pre.push(`\`\`\`${lang ?? ''}\n${code}\n\`\`\``);
      return `\n\n${PRE_TOKEN}${ctx.pre.length - 1}\u0000\n\n`;
    }
    case 'A': {
      const text = inner().trim();
      const href = el.getAttribute('href') ?? '';
      const target = absolute(href, ctx.base);
      if (!text) return '';
      if (!target || href.startsWith('#') || !/^https?:/.test(target)) return text;
      return `[${text}](${target})`;
    }
    case 'IMG': {
      const src = absolute(el.getAttribute('src') ?? el.getAttribute('data-src'), ctx.base);
      // Inline data: URIs can run to megabytes; only fetchable images are kept.
      if (!src || !/^https?:/.test(src)) return '';
      ctx.images.add(src);
      const alt = (el.getAttribute('alt') ?? '').replace(/[[\]]/g, '');
      return `![${alt}](${src})`;
    }
    case 'UL':
    case 'OL':
      return convertList(el, root, ctx);
    case 'BLOCKQUOTE': {
      const body = inner()
        .trim()
        .replace(/\n{3,}/g, '\n\n');
      const quoted = body
        .split('\n')
        .map((line) => (line ? `> ${line}` : '>'))
        .join('\n');
      return block(quoted);
    }
    case 'TABLE':
      return convertTable(el, root, ctx);
    case 'P':
    case 'DIV':
    case 'SECTION':
    case 'ARTICLE':
    case 'MAIN':
    case 'FIGURE':
    case 'FIGCAPTION':
    case 'DL':
    case 'DT':
    case 'DD':
      return block(inner());
    default:
      return inner();
  }
}

/** Converts the main content of a page to Markdown, dropping navigation and other chrome. */
export function htmlToMarkdown(
  doc: Document,
  base = doc.baseURI,
): { markdown: string; images: string[] } {
  const root = pickRoot(doc);
  if (!root) return { markdown: '', images: [] };
  const ctx: Ctx = { base, pre: [], images: new Set() };
  const markdown = convert(root, root, ctx)
    .split('\n')
    .map((line) => line.replace(/^ (?=\S)/, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(new RegExp(`${PRE_TOKEN}(\\d+)\\u0000`, 'g'), (_, i) => ctx.pre[Number(i)]);
  return { markdown, images: [...ctx.images] };
}

export function extractArticle(doc: Document = document): ArticleData {
  const title = doc.title;
  const canonical = (doc.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href;
  const url = canonical ?? '';
  const { markdown, images } = htmlToMarkdown(doc);
  // Some pages render everything through elements the converter skips; plain text beats nothing.
  const text = markdown || (doc.body?.innerText?.trim() ?? '');
  return { title, url, text, images };
}
