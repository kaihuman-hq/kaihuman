import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, test } from 'vitest';
import { offerData, offerMarkdown } from './fixture';
import { renderOfferHtml } from './render';
import { renderToStaticMarkup } from './shim-react-dom-server';

const render = renderToStaticMarkup as (v: unknown) => string;
const dir = mkdtempSync(path.join(tmpdir(), 'narro-'));
const here = path.dirname(new URL(import.meta.url).pathname);
// Font CSS differs by design (base64 in narro, URLs in the browser): compare without it.
const noFonts = (h: string) => h.replace(/^@font-face .*$/gm, '');

test('narro bundles + renders on preact/compat with fs stubs (no fs touched)', async () => {
  const { html, title } = await renderOfferHtml(
    { data: offerData, markdown: offerMarkdown, fontCss: '' },
    render,
  );
  expect(title).toBe('Angebot AN-2026-0017');
  expect(html).toContain('ACME GmbH');
  expect(html).toContain('DE02 1203 0000 0000 2020 51'); // bank in footer
  expect(html).toContain('Zusatzleistung 26');
  expect(html).toMatch(/@page \{ size: A4; margin: 24mm 20mm 30mm 25mm; \}/);
});

test('invalid data yields schema issues, not a crash', async () => {
  await expect(
    renderOfferHtml(
      { data: { ...offerData, number: undefined }, markdown: '', fontCss: '' },
      render,
    ),
  ).rejects.toThrow(/number/);
});

test('parity: same HTML as narro renderHtml(file) for examples/offer.md (modulo fonts)', async () => {
  const ref = path.join(dir, 'ref.json');
  execFileSync('node', [path.join(here, 'tools/reference.mjs'), ref], {
    cwd: path.join(here, '../../..'),
  });
  const r = JSON.parse(readFileSync(ref, 'utf8'));
  const { html } = await renderOfferHtml(
    { data: r.data, markdown: r.body, logo: r.logo, fontCss: '' },
    render,
  );
  writeFileSync(path.join(dir, 'ours.html'), html);
  writeFileSync(path.join(dir, 'theirs.html'), r.html);
  // jsdom innerHTML serialises void tags/attrs slightly differently from react-dom/server.
  const norm = (h: string) =>
    noFonts(h)
      .replace(/&nbsp;/g, '\u00a0')
      .replace(/colspan=/g, 'colSpan=')
      .replace(
        /style="([^"]*)"/g,
        (_m, css: string) => `style="${css.replace(/:\s+/g, ':').replace(/;$/, '')}"`,
      )
      .replace(/\s+/g, ' ')
      .replace(/ ?\/>/g, '>')
      .trim();
  const a = norm(html);
  const b = norm(r.html);
  if (a !== b) {
    let i = 0;
    while (a[i] === b[i]) i++;
    console.log(
      `first diff @${i}\nours  : ${a.slice(i - 60, i + 100)}\ntheirs: ${b.slice(i - 60, i + 100)}`,
    );
  }
  expect(a === b).toBe(true);
});

// Writes the long (multi-page) offer as standalone HTML, fonts inlined, for tools/pdf.mjs.
test.skipIf(!process.env.NARRO_DUMP)('dump long offer html for the PDF proxy check', async () => {
  const { fontsourceDir } = await import('./alias');
  const dirInter = path.join(fontsourceDir('inter'), 'files');
  const fontCss = ['latin', 'latin-ext']
    .flatMap((subset) =>
      [400, 600].map((w) => {
        const b64 = readFileSync(path.join(dirInter, `inter-${subset}-${w}-normal.woff2`)).toString(
          'base64',
        );
        return `@font-face { font-family: 'Inter'; font-style: normal; font-weight: ${w}; font-display: block; src: url(data:font/woff2;base64,${b64}) format('woff2'); }`;
      }),
    )
    .join('\n');
  const logo = JSON.parse(
    readFileSync(process.env.NARRO_DUMP_REF ?? path.join(dir, 'ref.json'), 'utf8'),
  ).logo as string;
  const { html } = await renderOfferHtml(
    { data: offerData, markdown: offerMarkdown, logo, fontCss },
    render,
  );
  writeFileSync(process.env.NARRO_DUMP as string, html);
});
