// Web-preview screenshots: node scripts/screens.cjs [outDir] [route,...]
// Serves dist/ (SPA fallback), enters demo mode, then visits each route on iPhone 15 Pro and Pixel 8 in light + dark.
// `route@Text` clicks the first element showing Text after load (detail views that live inside one route);
// `route@A@B` clicks A, then B (e.g. the dashboard menu, then a dashboard).
// Steps may also be `fill:Label=value` (type into the field with that aria-label) `testid:id` (click by testID) or `label:Text` (click by aria-label; the dashboard picker's title changes with the last page).
// FULLPAGE=1 captures the whole scrollable content instead of one viewport.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const dist = path.resolve(process.env.DIST || path.join(__dirname, '..', 'dist'));
const out = path.resolve(process.argv[2] || 'screens-out');
const ALL = [
  '/login',
  '/dashboard',
  '/dashboard@Overview@Finance',
  '/dashboard@See all',
  '/board',
  '/capture',
  '/ideas',
  '/more',
  '/analytics',
  '/wiki',
  '/knowledge',
  '/files',
  '/files/notes/welcome.md',
  '/repos',
  '/ideas@Weekly review template',
  '/wiki@clients',
  '/quick-todo',
  '/quick-note',
  '/quick-log',
  '/quick-idea',
  '/quick-knowledge',
  '/search?q=review',
  '/dashboard@label:Choose dashboard@Tools',
  '/dashboard@label:Choose dashboard@Reading',
  '/files/.kh/news.rss.json',
  '/files/.kh/news.rss.json@testid:toggle-source',
  ...[
    '.kh/projects.todos.md',
    '.kh/health.habit.csv',
    '.kh/work.timetracking.csv',
    '.kh/personal.events.csv',
    '.kh/daily.actionlog.md',
    '.kh/world.timezones.json',
    '.kh/reading.readitlater.json',
    '.kh/browser.bookmarks.json',
    '.kh/monthly.budget.csv',
    '.kh/portfolio.stocks.csv',
    '.kh/utilities.consumption.csv',
    '.kh/metrics.data-collection.csv',
    '.kh/ai.prompts.md',
    '.kh/shell.commands.md',
    '.kh/trips.travel.json',
    '.kh/board.board-overview.json',
    '.kh/command-palette.settings.json',
    'data/reading-list.csv',
    'data/app-settings.json',
    '.kh/business/business.yaml',
    'images/logo.svg',
    'notes/plain.txt',
    'notes/secret.md.enc',
    'notes/diagram.drawio',
  ].map((f) => `/files/${f}`),
  '/files/notes/secret.md.enc@fill:Passphrase=demo@Unlock',
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
      for (const entry of routes) {
        const [route, ...clicks] = entry.split('@');
        const clickText = clicks.at(-1);
        if (route === '/login') await page.goto(`${base}/login${d.qs}`);
        else {
          await page.goto(`${base}/demo${d.qs}`);
          await page.waitForTimeout(1500); // demo seeding and the first dashboard load settle
          await page.evaluate(
            (r) => {
              history.pushState({}, '', r);
              dispatchEvent(new PopStateEvent('popstate'));
            },
            route + (route.includes('?') && d.qs ? `&${d.qs.slice(1)}` : d.qs),
          );
        }
        await page.waitForTimeout(900);
        for (const text of clicks) {
          const fill = /^fill:([^=]+)=(.*)$/.exec(text);
          const lab = /^label:(.+)$/.exec(text);
          const tid = /^testid:(.+)$/.exec(text);
          const step = fill
            ? page.getByLabel(fill[1]).first().fill(fill[2], { timeout: 5000 })
            : lab
              ? page.getByLabel(lab[1]).first().click({ timeout: 5000 })
              : tid
                ? page.getByTestId(tid[1]).first().click({ timeout: 5000 })
                : page.getByText(text, { exact: true }).first().click({ timeout: 5000 });
          await step.catch(() => errors.push(`${d.name}/${scheme}${entry}: nothing to click`));
          await page.waitForTimeout(600);
        }
        if (process.env.FULLPAGE) {
          await page.waitForTimeout(1500); // let async content (tiles) finish before measuring
          // RN-web scrolls inside a ScrollView, not the document: grow the viewport to fit it.
          const h = await page.evaluate(() =>
            Math.max(
              innerHeight,
              ...[...document.querySelectorAll('div')]
                .filter(
                  (el) =>
                    el.scrollHeight > el.clientHeight + 4 &&
                    getComputedStyle(el).overflowY !== 'visible',
                )
                .map((el) => el.scrollHeight + (innerHeight - el.clientHeight)),
            ),
          );
          await page.setViewportSize({ width: d.viewport.width, height: Math.min(h, 6000) });
          await page.waitForTimeout(300);
        }
        const sw = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (sw) errors.push(`${d.name}/${scheme}${entry}: horizontal scroll`);
        const name = (
          route.slice(1) +
          (clicks.length > 1 || clickText?.startsWith('testid:')
            ? `-${clickText.replace(/^testid:/, '').toLowerCase()}`
            : clickText
              ? '-detail'
              : '')
        ).replace(/[/. ?=&]/g, '_');
        await page.screenshot({ path: path.join(out, `${d.name}-${scheme}-${name}.png`) });
        if (process.env.FULLPAGE) await page.setViewportSize(d.viewport);
      }
      await ctx.close();
    }
  await browser.close();
  server.close();
  console.log(errors.length ? errors.join('\n') : 'no page errors');
})();
