import type { DashboardConfig } from '../models/types.js';
import type { GithubProfile } from '../stores/auth.store.js';
import type { GithubRepo } from '../stores/github-profile.store.js';

/**
 * Generates a self-contained set of demo data: a virtual filesystem (path →
 * content), a fake repository, and a fake user profile. All content is dated
 * relative to "now" so widgets (streaks, upcoming events, forecasts) look
 * current whenever the demo is launched.
 *
 * The file formats here mirror the widget parsers in `@lifosy/ui`
 * (`*Logic.ts`); keep them in sync if a format changes.
 */

export interface DemoSeed {
  files: Record<string, string>;
  repos: GithubRepo[];
  user: GithubProfile;
}

// ─── Date helpers ────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, '0');
const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isoDateTime = (d: Date) =>
  `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
const addMonths = (d: Date, n: number) => {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
};
const isWeekend = (d: Date) => d.getDay() === 0 || d.getDay() === 6;

// A small inline avatar so demo mode needs no network.
const AVATAR =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="#10b981"/><text x="50%" y="54%" font-family="monospace" font-size="34" fill="#000" text-anchor="middle" dominant-baseline="middle">KH</text></svg>',
  );

// ─── Widget content generators ───────────────────────────────────────────────

function timeTracking(now: Date): string {
  let csv = 'iso date;time\n';
  for (let i = 30; i >= 0; i--) {
    const d = addDays(now, -i);
    if (isWeekend(d)) continue;
    if (i === 0) {
      // Today: a single open interval → widget shows the timer running.
      csv += `${isoDate(d)};08:45\n`;
      continue;
    }
    const startM = 8 * 60 + 25 + ((i * 7) % 20);
    const lunchM = 12 * 60 + ((i * 3) % 30);
    const endM = 17 * 60 + ((i * 5) % 50);
    const hm = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    csv += `${isoDate(d)};${hm(startM)},${hm(lunchM)},${hm(lunchM + 45)},${hm(endM)}\n`;
  }
  return csv;
}

function habit(now: Date): string {
  const lines = ['iso date;goal reached'];
  for (let i = 45; i >= 0; i--) {
    const d = addDays(now, -i);
    // Strong recent streak; a few misses further back.
    const reached = i <= 12 ? true : (i * 7) % 5 !== 0;
    lines.push(`${isoDate(d)};${reached ? 'x' : ''}`);
  }
  return lines.join('\n');
}

function events(now: Date): string {
  let csv = 'name;type;start iso date;end iso date\n';
  const upcoming: [string, number, number][] = [
    ['Team Offsite', 4, 6],
    ['Dentist Appointment', 9, 9],
    ['Conference: WebDev Summit', 18, 20],
    ['Flight to Lisbon', 27, 27],
  ];
  for (const [name, startOff, endOff] of upcoming) {
    csv += `${name};general;${isoDate(addDays(now, startOff))};${isoDate(addDays(now, endOff))}\n`;
  }
  const birthdays: [string, string][] = [
    ['Anna Schmidt', '1990-07-12'],
    ['Marcus Lee', '1988-09-03'],
    ['Mum', '1962-11-21'],
  ];
  for (const [name, date] of birthdays) {
    csv += `${name};birthday;${date};${date}\n`;
  }
  return csv;
}

function actionLog(now: Date): string {
  const entries: [number, string][] = [
    [-5, 'Shipped the analytics dashboard #work #milestone'],
    [-90, 'Reviewed pull requests #work #dev'],
    [-180, 'Morning run, 5k #health'],
    [-26 * 60, 'Wrote design doc for demo mode #work #writing'],
    [-50 * 60, 'Read two chapters of Designing Data-Intensive Apps #reading'],
  ];
  const lines = ['---', 'title: Daily Log', '---', '', '# Action Log', ''];
  for (const [minOff, desc] of entries) {
    const d = new Date(now.getTime() + minOff * 60 * 1000);
    lines.push(`- ${isoDateTime(d)} ${desc}`);
  }
  return lines.join('\n');
}

function timezones(now: Date): string {
  const ts = now.getTime();
  return `${JSON.stringify(
    {
      timezones: [
        {
          id: 'tz-1',
          name: 'Europe/Berlin',
          offset: '+01:00',
          cities: ['Berlin', 'Munich'],
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: 'tz-2',
          name: 'America/New_York',
          offset: '-05:00',
          cities: ['New York', 'Boston'],
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: 'tz-3',
          name: 'America/Los_Angeles',
          offset: '-08:00',
          cities: ['San Francisco', 'Seattle'],
          createdAt: ts,
          updatedAt: ts,
        },
        {
          id: 'tz-4',
          name: 'Asia/Tokyo',
          offset: '+09:00',
          cities: ['Tokyo', 'Osaka'],
          createdAt: ts,
          updatedAt: ts,
        },
      ],
    },
    null,
    2,
  )}\n`;
}

function boardOverview(): string {
  return `${JSON.stringify(
    {
      showBacklog: true,
      showInProgress: true,
      showDone: false,
      showRejected: false,
      showOverdue: true,
      overdueDays: 7,
      minAgeDays: 0,
    },
    null,
    2,
  )}\n`;
}

function budget(now: Date): string {
  const lines = ['name;account;category;date;value'];
  // 3 months of recurring entries. Distinct names so the dedup-by-name keeps them all.
  for (let m = 2; m >= 0; m--) {
    const month = addMonths(now, -m);
    const tag = `${month.getFullYear()}-${pad(month.getMonth() + 1)}`;
    const day = (n: number) => isoDate(new Date(month.getFullYear(), month.getMonth(), n));
    lines.push(`Salary ${tag};checking;earnings;${day(1)};4200`);
    lines.push(`Freelance ${tag};checking;other-income;${day(14)};650`);
    lines.push(`Rent ${tag};checking;running-costs;${day(1)};1350`);
    lines.push(`Groceries ${tag};checking;food;${day(8)};410`);
    lines.push(`Restaurants ${tag};credit;food;${day(19)};180`);
    lines.push(`Transit pass ${tag};checking;transport;${day(2)};89`);
    lines.push(`Electricity ${tag};checking;running-costs;${day(5)};95`);
    lines.push(`Streaming ${tag};credit;entertainment;${day(6)};34`);
    lines.push(`Gym ${tag};checking;hobby;${day(3)};45`);
    lines.push(`Savings ${tag};savings;savings;${day(2)};500`);
  }
  return `${lines.join('\n')}\n`;
}

function stocks(now: Date): string {
  const lines = ['timestamp,current value,invest'];
  let value = 5200;
  for (let m = 23; m >= 0; m--) {
    const d = addMonths(now, -m);
    const snap = new Date(d.getFullYear(), d.getMonth(), 1, 9, 0, 0);
    // Drift upward with some variation.
    value = Math.round(value * (1 + 0.018 + (((m * 13) % 9) - 4) / 100) + 500);
    const invest = m === 23 ? 5000 : 500;
    lines.push(`${isoDateTime(snap)},${value},${invest}`);
  }
  return `${lines.join('\n')}\n`;
}

function consumption(now: Date): string {
  const header =
    'created,Electricity[title:Electricity;unit:kWh;yearlyTarget:3500],Gas[title:Gas;unit:m³;yearlyTarget:1200],Water[title:Water;unit:m³]';
  const lines = [header];
  let elec = 24500;
  let gas = 8200;
  let water = 410;
  for (let m = 12; m >= 0; m--) {
    const d = new Date(now.getFullYear(), now.getMonth() - m, 1);
    elec += 270 + ((m * 17) % 60);
    gas += 90 + ((m * 11) % 40);
    water += 11 + ((m * 3) % 6);
    lines.push(`${isoDate(d)},${elec},${gas},${water}`);
  }
  return `${lines.join('\n')}\n`;
}

function dataCollection(now: Date): string {
  const header =
    'name::created,type::auto:date;name::Weight,type::number,unit::kg;name::Mood,type::number,unit::/5';
  const lines = [header];
  let weight = 79.4;
  for (let i = 21; i >= 0; i--) {
    const d = addDays(now, -i);
    weight += (((i * 7) % 5) - 2) / 10;
    const mood = 3 + ((i * 5) % 3);
    lines.push(`${isoDate(d)};${weight.toFixed(1)};${mood}`);
  }
  return `${lines.join('\n')}\n`;
}

function bookmarks(now: Date): string {
  const bookmark = (id: number, url: string, title: string, tags: string[], dayOff: number) => {
    const createdAt = addDays(now, dayOff).toISOString();
    return { id: `bm-${id}`, title, url, tags, createdAt, updatedAt: createdAt };
  };
  return `${JSON.stringify(
    {
      bookmarks: [
        bookmark(1, 'https://vitest.dev/guide/', 'Vitest Guide', ['testing', 'dev'], -1),
        bookmark(2, 'https://biomejs.dev/linter/rules/', 'Biome lint rules', ['dev'], -4),
        bookmark(3, 'https://turborepo.dev/docs', 'Turborepo docs', ['dev', 'monorepo'], -9),
        bookmark(4, 'https://news.ycombinator.com/', 'Hacker News', ['reading'], -20),
      ],
      updatedAt: now.toISOString(),
    },
    null,
    2,
  )}\n`;
}

function readItLater(now: Date): string {
  const ts = now.getTime();
  const item = (
    id: number,
    url: string,
    name: string,
    status: 'new' | 'read',
    tags: string[],
    dayOff: number,
  ) => ({
    id: `ril-${id}`,
    url,
    name,
    status,
    tags,
    createdAt: addDays(now, dayOff).getTime(),
    updatedAt: ts,
  });
  return `${JSON.stringify(
    {
      items: [
        item(
          1,
          'https://www.joelonsoftware.com/2000/04/06/things-you-should-never-do-part-i/',
          'Things You Should Never Do, Part I',
          'new',
          ['engineering'],
          -2,
        ),
        item(
          2,
          'https://martinfowler.com/articles/microservices.html',
          'Microservices',
          'new',
          ['architecture'],
          -5,
        ),
        item(
          3,
          'https://overreacted.io/a-complete-guide-to-useeffect/',
          'A Complete Guide to useEffect',
          'read',
          ['react'],
          -12,
        ),
        item(
          4,
          'https://www.nngroup.com/articles/ten-usability-heuristics/',
          '10 Usability Heuristics',
          'new',
          ['design', 'ux'],
          -1,
        ),
      ],
    },
    null,
    2,
  )}\n`;
}

function rss(): string {
  return `${JSON.stringify(
    {
      feedOptions: [
        { id: 'feed-1', url: 'https://hnrss.org/frontpage', read: [], xml: '' },
        { id: 'feed-2', url: 'https://www.smashingmagazine.com/feed/', read: [], xml: '' },
        { id: 'feed-3', url: 'https://overreacted.io/rss.xml', read: [], xml: '' },
      ],
      readLater: [],
    },
    null,
    2,
  )}\n`;
}

function projectsTodos(now: Date): string {
  const m1 = isoDate(addDays(now, 21));
  const m2 = isoDate(addDays(now, 60));
  const created = (dayOff: number) => addDays(now, dayOff).toISOString();
  return [
    '---',
    'milestones:',
    '  - id: v1',
    '    name: Demo Launch',
    `    dueDate: ${m1}`,
    '  - id: v2',
    '    name: Public Beta',
    `    dueDate: ${m2}`,
    '---',
    '',
    `- [x] Set up the project repository #setup`,
    `::created:: ${created(-30)}`,
    `- [x] Design the dashboard layout #design !v1`,
    `::created:: ${created(-21)}`,
    `- [>] Implement demo mode #dev !v1`,
    `::created:: ${created(-4)}`,
    `- [>] Record the product video #marketing`,
    `::created:: ${created(-2)}`,
    `- [ ] Write launch announcement #marketing !v2`,
    `::created:: ${created(-1)}`,
    `- [ ] Set up analytics tracking #dev !v2`,
    `::created:: ${created(-1)}`,
    `- [ ] Gather beta tester feedback #research !v2`,
    `::created:: ${created(0)}`,
    `- [-] Migrate to a custom backend #dev`,
    '  > Decided against — GitHub-as-backend is the core value prop.',
    '',
  ].join('\n');
}

function inboxTodos(now: Date): string {
  const created = (dayOff: number) => addDays(now, dayOff).toISOString();
  return [
    `- [ ] Reply to investor email #inbox`,
    `::created:: ${created(0)}`,
    `- [ ] Book flights for the conference #travel`,
    `::created:: ${created(-1)}`,
    `- [ ] Renew domain name #admin`,
    `::created:: ${created(-3)}`,
    '',
  ].join('\n');
}

// ─── Dashboard config ────────────────────────────────────────────────────────

function dashboardConfig(): DashboardConfig {
  const entries = [
    { path: '.kh/projects.todos.md', dashboard: 'overview' },
    { path: '.kh/work.timetracking.csv', dashboard: 'overview' },
    { path: '.kh/health.habit.csv', dashboard: 'overview' },
    { path: '.kh/personal.events.csv', dashboard: 'overview' },
    { path: '.kh/board.board-overview.json', dashboard: 'overview' },
    { path: '.kh/daily.actionlog.md', dashboard: 'overview' },
    { path: '.kh/world.timezones.json', dashboard: 'overview' },
    { path: '.kh/monthly.budget.csv', dashboard: 'finance' },
    { path: '.kh/portfolio.stocks.csv', dashboard: 'finance' },
    { path: '.kh/utilities.consumption.csv', dashboard: 'finance' },
    { path: '.kh/metrics.data-collection.csv', dashboard: 'finance' },
    { path: '.kh/reading.readitlater.json', dashboard: 'reading' },
    { path: '.kh/browser.bookmarks.json', dashboard: 'reading' },
    { path: '.kh/news.rss.json', dashboard: 'reading' },
  ];
  return {
    version: 1,
    dashboards: [
      { id: 'overview', name: 'Overview' },
      { id: 'finance', name: 'Finance' },
      { id: 'reading', name: 'Reading' },
    ],
    entries,
    theme: 'nexus',
    files: {
      recentlyOpened: ['.kh/projects.todos.md', '.kh/monthly.budget.csv', 'notes/welcome.md'],
      quickNotes: ['.kh/daily.actionlog.md'],
    },
  };
}

// ─── Notes (plain markdown for the file browser) ─────────────────────────────

const README = `# Demo Workspace

This is a **demo** of kaihuman — a personal life-OS built on top of your own
GitHub repositories. Everything you see here is generated sample data living
only in memory. Edits won't be saved anywhere and disappear on refresh.

## Try it

- Browse the **Overview**, **Finance**, and **Reading** dashboards.
- Open the Kanban board and drag a card.
- Edit a note — it updates instantly (in memory).
`;

const WELCOME = `# Welcome 👋

Use the dashboard switcher to move between workspaces. Tiles are just files in
this repo:

- \`.kh/projects.todos.md\` → the Kanban / todo widget
- \`.kh/monthly.budget.csv\` → the budget charts
- \`.kh/portfolio.stocks.csv\` → the investment tracker

Open the file browser to see them all.
`;

const IDEAS = `# Ideas

- Weekly review template
- Habit: read 20 pages a day
- Automate the monthly budget import
- Add a "books finished" tracker
`;

// ─── Assembly ────────────────────────────────────────────────────────────────

export function buildDemoSeed(now: Date = new Date()): DemoSeed {
  const files: Record<string, string> = {
    '.kh/.dashboard.config.json': `${JSON.stringify(dashboardConfig(), null, 2)}\n`,
    '.kh/projects.todos.md': projectsTodos(now),
    '.kh/inbox.todos.md': inboxTodos(now),
    '.kh/work.timetracking.csv': timeTracking(now),
    '.kh/health.habit.csv': habit(now),
    '.kh/personal.events.csv': events(now),
    '.kh/daily.actionlog.md': actionLog(now),
    '.kh/world.timezones.json': timezones(now),
    '.kh/board.board-overview.json': boardOverview(),
    '.kh/monthly.budget.csv': budget(now),
    '.kh/portfolio.stocks.csv': stocks(now),
    '.kh/utilities.consumption.csv': consumption(now),
    '.kh/metrics.data-collection.csv': dataCollection(now),
    '.kh/reading.readitlater.json': readItLater(now),
    '.kh/browser.bookmarks.json': bookmarks(now),
    '.kh/news.rss.json': rss(),
    'README.md': README,
    'notes/welcome.md': WELCOME,
    'notes/ideas.md': IDEAS,
  };

  const repos: GithubRepo[] = [
    {
      id: 1,
      name: 'life-os-demo',
      full_name: 'demo-user/life-os-demo',
      private: true,
      owner: { login: 'demo-user', avatar_url: AVATAR },
      default_branch: 'main',
      updated_at: now.toISOString(),
    },
  ];

  const user: GithubProfile = {
    id: 1,
    login: 'demo-user',
    name: 'Demo User',
    avatar_url: AVATAR,
  };

  return { files, repos, user };
}
