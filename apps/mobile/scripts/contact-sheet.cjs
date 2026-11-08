// Contact sheet: node scripts/contact-sheet.cjs [shotsDir] [out.png]
// Takes the PNGs written by screens.cjs and lays them out as one labelled section per screen:
// iPhone light, iPhone dark, Pixel light, Pixel dark. Scaled down to keep the PNG small.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const shots = path.resolve(process.argv[2] || 'screens-out');
const out = path.resolve(process.argv[3] || path.join(__dirname, '..', 'docs', 'screens.png'));
const THUMB = Number(process.env.THUMB || 170); // thumbnail width in px
const COLUMNS = Number(process.env.COLUMNS || 3);

// [heading, screens.cjs output name]; the file-kind sections come first.
const file = (kind, p) => [kind, `files_${p.replace(/[/. ]/g, '_')}`];
const SECTIONS = [
  file('Todos (markdown)', '.kh/projects.todos.md'),
  file('Habits (CSV)', '.kh/health.habit.csv'),
  file('Time tracking (CSV)', '.kh/work.timetracking.csv'),
  file('Events (CSV)', '.kh/personal.events.csv'),
  file('Action log (markdown)', '.kh/daily.actionlog.md'),
  file('Timezones (JSON)', '.kh/world.timezones.json'),
  file('Read it later (JSON)', '.kh/reading.readitlater.json'),
  file('Bookmarks (JSON)', '.kh/browser.bookmarks.json'),
  file('Budget (CSV)', '.kh/monthly.budget.csv'),
  file('Stocks (CSV)', '.kh/portfolio.stocks.csv'),
  file('Consumption (CSV)', '.kh/utilities.consumption.csv'),
  file('Data collection (CSV)', '.kh/metrics.data-collection.csv'),
  file('Prompts (markdown)', '.kh/ai.prompts.md'),
  file('Shell commands (markdown)', '.kh/shell.commands.md'),
  file('RSS feeds (JSON)', '.kh/news.rss.json'),
  ['RSS feeds, view source', `files_${'.kh/news.rss.json'.replace(/[/. ]/g, '_')}-toggle-source`],
  file('Travel (JSON)', '.kh/trips.travel.json'),
  file('Board overview (JSON)', '.kh/board.board-overview.json'),
  file('Command palette settings (JSON)', '.kh/command-palette.settings.json'),
  file('Generic CSV table', 'data/reading-list.csv'),
  file('Generic JSON', 'data/app-settings.json'),
  file('Business (YAML)', '.kh/business/business.yaml'),
  file('Image (SVG)', 'images/logo.svg'),
  file('Plain text', 'notes/plain.txt'),
  file('Markdown note', 'notes/welcome.md'),
  file('Encrypted, locked', 'notes/secret.md.enc'),
  ['Encrypted, unlocked', 'files_notes_secret_md_enc-unlock'],
  file('No viewer (.drawio)', 'notes/diagram.drawio'),
  ['Files browser', 'files'],
  ['Dashboard: Tools', 'dashboard-tools'],
  ['Dashboard: Reading (RSS tile)', 'dashboard-reading'],
  ['Dashboard: Overview', 'dashboard'],
  ['Dashboard: Finance', 'dashboard-finance'],
  ['Dashboard: See all', 'dashboard-detail'],
  ['Login', 'login'],
  ['Board', 'board'],
  ['Capture', 'capture'],
  ['Ideas', 'ideas'],
  ['Idea detail', 'ideas-detail'],
  ['More', 'more'],
  ['Analytics', 'analytics'],
  ['Wiki', 'wiki'],
  ['Wiki detail', 'wiki-detail'],
  ['Knowledge', 'knowledge'],
  ['Repos', 'repos'],
  ['Quick todo', 'quick-todo'],
  ['Quick note', 'quick-note'],
  ['Quick log', 'quick-log'],
  ['Quick idea', 'quick-idea'],
  ['Quick knowledge', 'quick-knowledge'],
];
const COLS = [
  ['iphone', 'light', 'iPhone 15 Pro, light'],
  ['iphone', 'dark', 'iPhone 15 Pro, dark'],
  ['pixel', 'light', 'Pixel 8, light'],
  ['pixel', 'dark', 'Pixel 8, dark'],
];

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const sections = SECTIONS.filter(([, name]) =>
  COLS.every(([d, s]) => fs.existsSync(path.join(shots, `${d}-${s}-${name}.png`))),
);
const missing = SECTIONS.length - sections.length;
if (missing) console.warn(`${missing} section(s) skipped: shots missing`);

const html = `<!doctype html><meta charset="utf-8"><style>
body{margin:0;padding:24px;background:#fff;color:#111;font:14px system-ui,sans-serif}
h1{margin:0 0 16px;font-size:22px}
.grid{display:grid;grid-template-columns:repeat(${COLUMNS},max-content);gap:24px 32px}
section{border:1px solid #ddd;border-radius:8px;padding:10px}
h2{margin:0 0 8px;font-size:15px}
.row{display:flex;gap:8px}
figure{margin:0}
img{display:block;width:${THUMB}px;border:1px solid #ccc;border-radius:6px}
figcaption{font-size:10px;color:#666;margin-top:3px}
</style><h1>Kaihuman mobile: screens</h1><div class="grid">${sections
  .map(
    ([title, name]) =>
      `<section><h2>${esc(title)}</h2><div class="row">${COLS.map(
        ([d, s, label]) =>
          `<figure><img src="file://${path.join(shots, `${d}-${s}-${name}.png`)}"><figcaption>${label}</figcaption></figure>`,
      ).join('')}</div></section>`,
  )
  .join('')}</div>`;

(async () => {
  const browser = await chromium.launch(
    fs.existsSync('/opt/pw-browsers/chromium')
      ? { executablePath: '/opt/pw-browsers/chromium' }
      : {},
  );
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  const tmp = path.join(shots, 'contact-sheet.html'); // file:// images need a file:// page
  fs.writeFileSync(tmp, html);
  await page.goto(`file://${tmp}`);
  await page.waitForLoadState('load');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
  fs.rmSync(tmp);
  await browser.close();
  console.log(
    `${sections.length} sections, ${(fs.statSync(out).size / 1e6).toFixed(2)} MB -> ${out}`,
  );
})();
