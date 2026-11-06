// Web-preview screenshots: node scripts/screens.cjs [outDir] [route,...]
// Serves dist/ (SPA fallback), enters demo mode, then visits each route on iPhone 15 Pro and Pixel 8 in light + dark.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const dist = path.resolve(process.env.DIST || path.join(__dirname, '..', 'dist'));
const out = path.resolve(process.argv[2] || 'screens-out');
const ALL = [
  '/login',
  '/dashboard',
  '/board',
  '/capture',
  '/ideas',
  '/more',
  '/analytics',
  '/wiki',
  '/knowledge',
  '/files',
  '/repos',
  '/quick-todo',
  '/quick-note',
  '/quick-log',
  '/quick-idea',
  '/quick-knowledge',
];
const routes = process.argv[3] ? process.argv[3].split(',') : ALL;
const types = {
  '.js': 'text/javascript',
  '.html': 'text/html',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ttf': 'font/ttf',
  '.svg': 'image/svg+xml',
};

const server = http.createServer((req, res) => {
  const p = path.join(dist, decodeURIComponent(req.url.split('?')[0]));
  const file = fs.existsSync(p) && fs.statSync(p).isFile() ? p : path.join(dist, 'index.html');
  res.writeHead(200, { 'content-type': types[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

const devices = [
  { name: 'iphone', viewport: { width: 393, height: 852 }, qs: '' },
  { name: 'pixel', viewport: { width: 412, height: 915 }, qs: '?platform=android' },
];

(async () => {
  await new Promise((r) => server.listen(0, r));
  const base = `http://127.0.0.1:${server.address().port}`;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch(
    fs.existsSync('/opt/pw-browsers/chromium')
      ? { executablePath: '/opt/pw-browsers/chromium' }
      : {},
  );
  const errors = [];
  for (const d of devices)
    for (const scheme of ['light', 'dark']) {
      const ctx = await browser.newContext({
        viewport: d.viewport,
        colorScheme: scheme,
        deviceScaleFactor: 1,
      });
      const page = await ctx.newPage();
      page.on('pageerror', (e) => errors.push(`${d.name}/${scheme}: ${e.message}`));
      for (const route of routes) {
        if (route === '/login') await page.goto(`${base}/login${d.qs}`);
        else {
          await page.goto(`${base}/demo${d.qs}`);
          await page.waitForTimeout(600);
          if (route !== '/dashboard') {
            await page.evaluate((r) => {
              history.pushState({}, '', r);
              dispatchEvent(new PopStateEvent('popstate'));
            }, route + d.qs);
          }
        }
        await page.waitForTimeout(900);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (sw) errors.push(`${d.name}/${scheme}${route}: horizontal scroll`);
        await page.screenshot({
          path: path.join(out, `${d.name}-${scheme}-${route.slice(1).replace(/\//g, '_')}.png`),
        });
      }
      await ctx.close();
    }
  await browser.close();
  server.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})();
