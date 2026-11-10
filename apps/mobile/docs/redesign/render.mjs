import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

// Playwright is preinstalled globally in the dev container, not a repo dependency.
const { chromium } = createRequire(`${execSync('npm root -g').toString().trim()}/`)('playwright');

import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const dir = fileURLToPath(new URL('.', import.meta.url));
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 }, deviceScaleFactor: 2 });
for (const f of readdirSync(dir).filter((n) => n.endsWith('.html'))) {
  await p.goto(`file://${dir}${f}`);
  await p.screenshot({ path: `${dir}${f.replace('.html', '.png')}`, fullPage: true });
  console.log(f);
}
await b.close();
