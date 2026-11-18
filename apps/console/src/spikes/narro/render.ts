import {
  addDays,
  type BaseDocument,
  computeTotals,
  createFormatter,
  DIN5008,
  labelsFor,
  type RenderContext,
  renderBody,
  resolveTemplate,
  validateDocument,
} from '@getnarro/pdf';

type Doc = Record<string, unknown>;
export type OfferInput = {
  /** Already merged data (company + offer). `extends:` merge is the caller's job in the browser. */
  data: Doc;
  /** Markdown body; may contain one `<!-- items -->` marker. */
  markdown: string;
  /** Logo as data: URI (the browser has no file paths). */
  logo?: string;
  /** Extra user CSS (replaces `css:` file). */
  css?: string;
  /** @font-face CSS for the chosen font (see fonts.ts / node base64 in the test). */
  fontCss: string;
};

const FONTS = ['Inter', 'Source Serif 4', 'IBM Plex Sans'] as const;
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Copies of narro's non-exported helpers (src/render-html.ts, src/layout): keep in sync.
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

/** fs-free equivalent of narro's renderHtml(file). `renderToMarkup` = react-dom/server shim. */
export async function renderOfferHtml(
  input: OfferInput,
  renderToMarkup: (vnode: unknown) => string,
  templateName = 'offer',
): Promise<{ html: string; title: string; paper: string }> {
  const template = await resolveTemplate(templateName);
  const result = validateDocument(
    { file: 'in-memory', data: input.data, sources: new Map(), chain: [], body: input.markdown },
    template.schema,
  );
  if (!result.ok) throw new Error(result.issues.map((i) => `${i.path}: ${i.message}`).join('; '));
  const data = result.data as any;
  const totals = computeTotals({
    items: data.items ?? [],
    discount: data.discount,
    zeroVat: Boolean(data.reverseCharge || data.smallBusiness),
  });
  const locale = data.locale ?? 'de-DE';
  const paper = data.paper ?? 'A4';
  const date = data.date;
  const font = FONTS.find((f) => f === data.theme?.font) ?? 'Inter';
  const accent = /^#[0-9a-f]{3,6}$/i.test(data.theme?.accent ?? '') ? data.theme.accent : '#4F46E5';
  const ctx = {
    data,
    totals,
    dates: {
      dueDate:
        data.dueDate ??
        (date && data.paymentTerms !== undefined ? addDays(date, data.paymentTerms) : undefined),
      validUntil:
        data.validUntil ?? (date && data.validDays ? addDays(date, data.validDays) : undefined),
    },
    body: renderBody(input.markdown),
    fmt: createFormatter(locale, data.currency ?? 'EUR'),
    labels: labelsFor(locale),
    logo: input.logo,
    theme: { font, accent },
  } as unknown as RenderContext<BaseDocument>;
  const title = template.title(ctx);
  const markup = renderToMarkup(template.render(ctx));
  const userCss = input.css ? `<style>\n${styleText(input.css)}\n</style>` : '';
  const html = `<!doctype html>
<html lang="${escapeHtml(locale)}">
<head>
<meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
${input.fontCss}
:root { --accent: ${accent}; --font: '${font}'; }
${pageCss(paper)}
${styleText(template.css)}
</style>
</head>
<body>${markup}${userCss}</body>
</html>
`;
  return { html, title, paper };
}
