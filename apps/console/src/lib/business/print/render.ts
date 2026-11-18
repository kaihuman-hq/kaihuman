import {
  addDays,
  addressLines,
  type BaseDocument,
  computeTotals,
  createFormatter,
  DIN5008,
  labelsFor,
  type PdfTemplate,
  type RenderContext,
  renderBody,
  resolveTemplate,
  type Totals,
  validateDocument,
} from '@getnarro/pdf';
import {
  DOCUMENTS_DIR,
  type DocumentTemplate,
  type Issue,
  type ResolvedDocument,
  resolveRepoPath,
} from '@kaihuman/formats/business';
import { offerWholeProduct } from './offer-whole-product';
import { renderToStaticMarkup } from './react-dom-server';

/** Reads a repo file as bytes; null when it is not in the repository. */
export type ReadBytes = (repoPath: string) => Promise<Uint8Array | null>;

export type RenderInput = {
  doc: ResolvedDocument;
  readBytes: ReadBytes;
  /** Repo path of the profile's logo; a document's own `logo:` (relative to it) wins. */
  logoPath?: string;
  /** @font-face CSS for the chosen font (see fonts.ts); tests pass `() => ''`. */
  fontCss: (font: string) => string;
};

export type Rendered = { html: string; title: string; paper: 'A4' | 'Letter'; totals: Totals };

type Data = BaseDocument & Record<string, unknown>;

const FONTS = ['Inter', 'Source Serif 4', 'IBM Plex Sans'] as const;
const ADDRESS_WINDOW_LINES = 6;
const MIME: Record<string, string> = {
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const IMG_SRC = /(<img\b[^>]*?\bsrc=")([^"]*)(")/gi;

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const unescapeAttr = (s: string) =>
  s
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');

// Copies of narro 0.0.0 helpers it does not export (src/render-html.ts, src/layout); keep in sync
// when the pinned version changes. The parity test fails when they drift.
const styleText = (css: string) => css.replace(/<\/(style)/gi, '<\\/$1');
const PAGE_MARGIN = { top: 24, right: DIN5008.marginRight, bottom: 30, left: DIN5008.marginLeft };
const SHEET = { A4: { width: 210, height: 297 }, Letter: { width: 215.9, height: 279.4 } } as const;
const pageCss = (paper: keyof typeof SHEET) => {
  const m = PAGE_MARGIN;
  const sh = SHEET[paper];
  return `@page { size: ${paper}; margin: ${m.top}mm ${m.right}mm ${m.bottom}mm ${m.left}mm; }
@media screen {
  html { background: #e8eaee; }
  body { width: ${sh.width}mm; min-height: ${sh.height}mm; margin: 8mm auto; padding: 0 ${m.right}mm ${m.bottom}mm ${m.left}mm; background: #fff; box-shadow: 0 1px 4px rgb(0 0 0 / 0.15); }
}`;
};

const base64 = (bytes: Uint8Array): string => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
};

/** A repo image as a data: URI, or the reason it cannot be one. */
async function dataUri(
  repoPath: string,
  readBytes: ReadBytes,
): Promise<{ ok: true; uri: string } | { ok: false; message: string }> {
  const ext = repoPath.slice(repoPath.lastIndexOf('.') + 1).toLowerCase();
  const mime = MIME[ext];
  if (!mime) return { ok: false, message: `use an SVG, PNG, JPEG or WebP image, not .${ext}` };
  const bytes = await readBytes(repoPath);
  if (!bytes) return { ok: false, message: `${repoPath} is not in the repository` };
  return { ok: true, uri: `data:${mime};base64,${base64(bytes)}` };
}

/** Replaces every relative `<img src>` with the repo file as a data: URI, as narro does with files. */
async function inlineImages(html: string, readBytes: ReadBytes, issues: Issue[]): Promise<string> {
  const inlined = new Map<string, string>();
  for (const raw of new Set([...html.matchAll(IMG_SRC)].map((m) => m[2] ?? ''))) {
    const src = unescapeAttr(raw);
    if (src.startsWith('data:image/')) continue;
    const fail = (message: string) =>
      issues.push({ path: 'body', message: `body: image ${src}: ${message}` });
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(src)) {
      fail('not a repository file; put the image in the business folder and link it relatively');
      continue;
    }
    const repoPath = resolveRepoPath(src, DOCUMENTS_DIR);
    if (!repoPath) {
      fail('points outside the repository');
      continue;
    }
    const r = await dataUri(repoPath, readBytes);
    if (r.ok) inlined.set(raw, r.uri);
    else fail(r.message);
  }
  return html.replace(IMG_SRC, (whole, start, raw, end) => {
    const uri = inlined.get(raw);
    return uri ? `${start}${uri}${end}` : whole;
  });
}

const templates: Record<DocumentTemplate, () => Promise<PdfTemplate>> = {
  offer: () => resolveTemplate('offer'),
  invoice: () => resolveTemplate('invoice'),
  'offer-whole-product': async () => offerWholeProduct as unknown as PdfTemplate,
};

/** Checks narro's renderHtml makes after validation (it does not export them). */
function renderRules(template: string, data: Data, totals: Totals): Issue[] {
  const issues: Issue[] = [];
  if (template === 'invoice' && totals.grossCents < 0) {
    issues.push({
      path: 'items',
      message: 'items: the grand total may not be negative on an invoice',
    });
  }
  if (totals.netCents > 0 && totals.discountCents > totals.netCents) {
    issues.push({
      path: 'discount',
      message: 'discount: is larger than the net total of the items',
    });
  }
  const lines = 1 + addressLines(data.client, data.locale, data.sender?.country).length;
  if (lines > ADDRESS_WINDOW_LINES) {
    issues.push({
      path: 'client.address',
      message: `client.address: ${lines} lines with name, contact and country do not fit the address window; at most ${ADDRESS_WINDOW_LINES}`,
    });
  }
  return issues;
}

/**
 * narro's `renderHtml(file)` without a file system: the document is already merged, images come
 * from the repository. Every problem is returned at once, each with its field.
 */
export async function renderDocumentHtml(
  input: RenderInput,
): Promise<{ ok: true; value: Rendered } | { ok: false; issues: Issue[] }> {
  const { doc, readBytes } = input;
  const issues: Issue[] = [];
  const template = await templates[doc.template]();

  let body = { before: '', after: '' };
  try {
    const html = renderBody(doc.body);
    body = {
      before: await inlineImages(html.before, readBytes, issues),
      after: await inlineImages(html.after, readBytes, issues),
    };
  } catch (e) {
    issues.push({ path: 'body', message: `body: ${e instanceof Error ? e.message : String(e)}` });
  }

  let logo: string | undefined;
  const ownLogo = typeof doc.data.logo === 'string' ? resolveRepoPath(doc.data.logo) : undefined;
  const logoPath = ownLogo ?? input.logoPath;
  if (ownLogo === null)
    issues.push({ path: 'logo', message: 'logo: points outside the repository' });
  else if (logoPath) {
    const r = await dataUri(logoPath, readBytes);
    if (r.ok) logo = r.uri;
    else issues.push({ path: 'logo', message: `logo: ${r.message}` });
  }

  const result = validateDocument(
    { file: 'document', data: doc.data, sources: new Map(), chain: [], body: doc.body },
    template.schema,
  );
  if (!result.ok) {
    return {
      ok: false,
      issues: [
        ...issues,
        ...result.issues.map((i) => ({ path: i.path, message: `${i.path}: ${i.message}` })),
      ],
    };
  }
  const data = result.data as Data;
  const totals = computeTotals({
    items: data.items ?? [],
    discount: data.discount,
    zeroVat: Boolean(data.reverseCharge || data.smallBusiness),
  });
  issues.push(...renderRules(doc.template, data, totals));
  if (issues.length > 0) return { ok: false, issues };

  const locale = data.locale ?? 'de-DE';
  const paper = data.paper ?? 'A4';
  const font = FONTS.find((f) => f === data.theme?.font) ?? 'Inter';
  const accent = /^#[0-9a-f]{3,6}$/i.test(data.theme?.accent ?? '') ? data.theme.accent : '#4F46E5';
  const extra = data as Record<string, unknown>;
  const ctx: RenderContext<BaseDocument> = {
    data,
    totals,
    dates: {
      dueDate:
        (extra.dueDate as string | undefined) ??
        (typeof extra.paymentTerms === 'number'
          ? addDays(data.date, extra.paymentTerms)
          : undefined),
      validUntil:
        (extra.validUntil as string | undefined) ??
        (typeof extra.validDays === 'number' ? addDays(data.date, extra.validDays) : undefined),
    },
    body,
    fmt: createFormatter(locale, data.currency ?? 'EUR'),
    labels: labelsFor(locale),
    logo,
    theme: { font, accent },
  };
  const title = template.title(ctx);
  const markup = renderToStaticMarkup(template.render(ctx) as never);
  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${input.fontCss(font)}
:root { --accent: ${accent}; --font: '${font}'; }
${pageCss(paper)}
${styleText(template.css)}
</style>
</head>
<body>${markup}</body>
</html>
`;
  return { ok: true, value: { html, title, paper, totals } };
}
