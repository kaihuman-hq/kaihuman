// Node-only (fs): what narro's own renderHtml(file) makes of its examples/offer.md, plus the
// merged data and body it started from. The parity test compares the browser path with it.
// Usage: node narro-reference.test-helper.mjs <out.json>
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { loadDocument, renderHtml } from '@getnarro/pdf';

const pkg = path.dirname(createRequire(import.meta.url).resolve('@getnarro/pdf/package.json'));
const file = path.join(pkg, 'examples', 'offer.md');
const doc = await loadDocument(file);
const logo = readFileSync(doc.data.logo).toString('base64');
const { html } = await renderHtml(file);
writeFileSync(process.argv[2], JSON.stringify({ html, data: doc.data, body: doc.body, logo }));
