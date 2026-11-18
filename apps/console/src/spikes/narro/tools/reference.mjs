// Node-only: dumps what narro's own renderHtml(file) produces for examples/offer.md, plus the
// merged data/body/logo it started from. Used as the parity reference for the browser path.
// Usage: node tools/reference.mjs <out.json> [examples-dir]
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadDocument, renderHtml } from '@getnarro/pdf';

const out = process.argv[2];
const pkg = path.dirname(createRequire(import.meta.url).resolve('@getnarro/pdf/package.json'));
const file = path.join(process.argv[3] ?? path.join(pkg, 'examples'), 'offer.md');
const doc = await loadDocument(file);
const logo = `data:image/svg+xml;base64,${readFileSync(doc.data.logo).toString('base64')}`;
const { html } = await renderHtml(file);
writeFileSync(
  out,
  JSON.stringify({ html, data: doc.data, body: doc.body, logo, chain: doc.chain }),
);
