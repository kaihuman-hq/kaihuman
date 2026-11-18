// Node-only: print HTML to PDF with Chromium (same engine as window.print for @page/CSS purposes).
// Usage: [NARRO_CHROMIUM=/path/to/chrome] node tools/pdf.mjs <in.html> <out.pdf>
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const browser = await chromium.launch(
  process.env.NARRO_CHROMIUM ? { executablePath: process.env.NARRO_CHROMIUM } : {},
);
const page = await browser.newPage();
await page.setContent(readFileSync(process.argv[2], 'utf8'), { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
writeFileSync(process.argv[3], await page.pdf({ preferCSSPageSize: true, printBackground: true }));
await browser.close();
