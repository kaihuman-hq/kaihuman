import type { DashboardConfig } from '../models/types.js';
import type { GithubProfile } from '../stores/auth.store.js';
import type { GithubRepo } from '../stores/github-profile.store.js';

/**
 * Generates a self-contained set of demo data: a virtual filesystem (path →
 * content), a fake repository, and a fake user profile. All content is dated
 * relative to "now" so widgets (streaks, upcoming events, forecasts) look
 * current whenever the demo is launched.
 *
 * The file formats here mirror the widget parsers in `@kaihuman/ui`
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
  // useCount is what the browser extension syncs back, and what makes "least used" worth sorting
  // by — one never-opened entry so the demo shows what a candidate for deletion looks like.
  const bookmark = (
    id: number,
    url: string,
    title: string,
    tags: string[],
    dayOff: number,
    useCount: number,
  ) => {
    const createdAt = addDays(now, dayOff).toISOString();
    return {
      id: `bm-${id}`,
      title,
      url,
      tags,
      createdAt,
      updatedAt: createdAt,
      useCount,
      lastUsedAt: useCount > 0 ? addDays(now, Math.max(dayOff, -2)).toISOString() : '',
    };
  };
  return `${JSON.stringify(
    {
      bookmarks: [
        bookmark(1, 'https://vitest.dev/guide/', 'Vitest Guide', ['testing', 'dev'], -1, 12),
        bookmark(2, 'https://biomejs.dev/linter/rules/', 'Biome lint rules', ['dev'], -4, 3),
        bookmark(3, 'https://turborepo.dev/docs', 'Turborepo docs', ['dev', 'monorepo'], -9, 1),
        bookmark(4, 'https://news.ycombinator.com/', 'Hacker News', ['reading'], -20, 0),
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

// Done items carry `::updated::` (Unix ms), which the analytics velocity chart buckets by week.
// Day offsets are spread over ~7 weeks with uneven counts so the chart looks lived-in.
const doneItem = (now: Date, text: string, doneOff: number, createdOff: number): string[] => {
  const done = addDays(now, doneOff);
  done.setHours(10 + (Math.abs(doneOff) % 7), (Math.abs(doneOff) * 13) % 60, 0, 0);
  return [
    `- [x] ${text}`,
    `::updated:: ${done.getTime()} ::created:: ${addDays(now, createdOff).toISOString()}`,
  ];
};

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
    ...doneItem(now, 'Set up the project repository #setup', -48, -52),
    ...doneItem(now, 'Design the dashboard layout #design !v1', -41, -50),
    ...doneItem(now, 'Pick a colour palette #design !v1', -40, -45),
    ...doneItem(now, 'Wire up GitHub sign-in #dev !v1', -33, -40),
    ...doneItem(now, 'Build the todo board #dev !v1', -26, -35),
    ...doneItem(now, 'Add tag filters to the board #dev !v1', -25, -30),
    ...doneItem(now, 'Write the onboarding copy #marketing', -24, -28),
    ...doneItem(now, 'Import sample data #dev !v1', -18, -22),
    ...doneItem(now, 'Add dark mode #design !v1', -12, -20),
    ...doneItem(now, 'Set up error reporting #dev', -11, -15),
    ...doneItem(now, 'Create the landing page #marketing !v1', -5, -14),
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
    { path: '.kh/trips.travel.json', dashboard: 'tools' },
    { path: '.kh/ai.prompts.md', dashboard: 'tools' },
    { path: '.kh/shell.commands.md', dashboard: 'tools' },
    { path: '.kh/command-palette.settings.json', dashboard: 'tools' },
  ];
  return {
    version: 1,
    dashboards: [
      { id: 'overview', name: 'Overview' },
      { id: 'finance', name: 'Finance' },
      { id: 'reading', name: 'Reading' },
      { id: 'tools', name: 'Tools' },
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

- Browse the **Overview**, **Finance**, **Reading**, and **Tools** dashboards.
- Open the Kanban board and drag a card.
- Edit a note — it updates instantly (in memory).
- Open \`notes/secret.md.enc\` and enter the passphrase \`demo\` to decrypt it.
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

// ─── Ideas (.kh/ideas/<slug>.md, the format of `@kaihuman/formats` ideas.ts) ──

/** `YYYY-MM-DD HH:MM`, local time: how idea log entries are dated. */
const ideaLogTime = (d: Date) => `${isoDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
/** `YYYY-MM-DDTHH:MM+hh:mm`: the `created` / `updated` frontmatter. */
const ideaStamp = (d: Date) => {
  const offset = -d.getTimezoneOffset();
  const abs = Math.abs(offset);
  return `${ideaLogTime(d).replace(' ', 'T')}${offset < 0 ? '-' : '+'}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};
const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3_600_000);

interface DemoIdea {
  title: string;
  status: string;
  product?: string;
  tags?: string[];
  createdDaysAgo: number;
  summary: string;
  /** [hours ago, author, text], newest first. */
  log: [number, string, string][];
  challenges?: string[];
  braindump?: string;
}

function idea(now: Date, i: DemoIdea): string {
  const updated = i.log[0] ? hoursAgo(now, i.log[0][0]) : addDays(now, -i.createdDaysAgo);
  return [
    '---',
    `title: ${JSON.stringify(i.title)}`,
    `status: ${i.status}`,
    ...(i.product ? [`product: ${i.product}`] : []),
    ...(i.tags ? [`tags: [${i.tags.join(', ')}]`] : []),
    `created: ${ideaStamp(addDays(now, -i.createdDaysAgo))}`,
    `updated: ${ideaStamp(updated)}`,
    '---',
    '',
    `# ${i.title}`,
    '',
    i.summary,
    '',
    ...(i.log.length
      ? [
          '## Log',
          '',
          ...i.log.map(([h, who, text]) => `- ${ideaLogTime(hoursAgo(now, h))} · ${who} · ${text}`),
          '',
        ]
      : []),
    ...(i.challenges ? ['## Challenges', '', ...i.challenges, ''] : []),
    ...(i.braindump ? ['## Braindump', '', i.braindump, ''] : []),
  ].join('\n');
}

function ideas(now: Date): Record<string, string> {
  return {
    '.kh/ideas/palette-sync.md': idea(now, {
      title: 'Offline sync for the desktop palette',
      status: 'exploring',
      product: 'kaihuman',
      tags: ['sync', 'desktop'],
      createdDaysAgo: 40,
      summary:
        'Let the desktop palette capture while offline and push when the network is back, without a server of its own.',
      log: [
        [2, 'claude', 'Spiked a file-based queue; replays cleanly after a restart.'],
        [26, 'human', 'Decided: single-user data, so a queue beats a CRDT.'],
        [4 * 24, 'claude.ai', 'Compared CRDT vs queue; queue wins for single-user data.'],
        [11 * 24, 'human', 'Status seed → exploring. Lost two notes on a train this week.'],
        [18 * 24, 'gemini', 'Listed how other palettes handle offline capture.'],
        [40 * 24, 'human', 'Created.'],
      ],
      challenges: [
        '- [ ] Conflicts when two devices edit the same file offline',
        '- [x] Where the queue lives on disk',
      ],
    }),
    '.kh/ideas/weekly-review.md': idea(now, {
      title: 'Weekly review template',
      status: 'committed',
      tags: ['habits'],
      createdDaysAgo: 75,
      summary: 'A Sunday checklist that pulls last week’s todos, habits and notes into one page.',
      log: [
        [9 * 24, 'human', 'Status exploring → committed. Doing it before the next quarter.'],
        [24 * 24, 'claude', 'Drafted the sections from the digest skill.'],
        [45 * 24, 'human', 'Tried it by hand twice; 20 minutes is the limit.'],
        [75 * 24, 'human', 'Created.'],
      ],
      challenges: ['- [ ] Keep it under 20 minutes'],
    }),
    '.kh/ideas/voice-capture.md': idea(now, {
      title: 'Voice capture on Android',
      status: 'seed',
      product: 'kaihuman',
      tags: ['android', 'capture'],
      createdDaysAgo: 3,
      summary: '',
      log: [],
      braindump: 'Hold the home-screen icon, talk, and it lands in the inbox as text.',
    }),
    '.kh/ideas/budget-import.md': idea(now, {
      title: 'Automate the monthly budget import',
      status: 'parked',
      tags: ['finance'],
      createdDaysAgo: 120,
      summary: 'Import the bank CSV into the budget file every month.',
      log: [
        [
          70 * 24,
          'human',
          'Status exploring → parked. The bank changes its export format too often.',
        ],
        [100 * 24, 'claude', 'Wrote a parser for the current export.'],
        [120 * 24, 'human', 'Created.'],
      ],
    }),
    '.kh/ideas/books-tracker.md': idea(now, {
      title: 'Books finished tracker',
      status: 'shipped',
      tags: ['reading'],
      createdDaysAgo: 200,
      summary: 'A consumption widget that counts finished books per month.',
      log: [
        [130 * 24, 'human', 'Status committed → shipped. Live on the Reading dashboard.'],
        [160 * 24, 'claude', 'Built it on the consumption widget.'],
        [200 * 24, 'human', 'Created.'],
      ],
    }),
  };
}

// ─── Business (.kh/business/, the formats of `@kaihuman/formats/business`) ───
// Inline strings: core must not import formats. `demo.test.ts` validates the
// result with the real repo check, so format drift fails there.

const BIZ = '.kh/business';
const ULID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
/** Distinct, valid-looking ULIDs from a small counter (the check only validates the alphabet and length). */
const ulid = (n: number) =>
  `01M5${'0'.repeat(10)}${ULID_ALPHABET[n % 32]}${'ABCDEFGHJKMNPQRS'.slice(0, 11)}`;

const SELLER = [
  'seller:',
  '  name: Demo Studio',
  '  address: { street: Beispielstrasse 12, postcode: "10115", city: Berlin, country: DE }',
  '  vat_id: DE000000000',
  '  contact: { name: Demo Owner, email: hello@demo-studio.example }',
];

function party(
  key: string,
  name: string,
  street: string,
  postcode: string,
  city: string,
): string[] {
  return [
    `${key}:`,
    `  name: ${name}`,
    `  address: { street: ${street}, postcode: "${postcode}", city: ${city}, country: DE }`,
  ];
}

interface DemoDoc {
  kind: 'invoice' | 'offer';
  issued: Date;
  client: string;
  buyer: string[];
  /** Hours (invoice) or 1 (offer) at `unitPrice` minor units. */
  quantity: number;
  unit: 'HUR' | 'C62';
  unitPrice: number;
  description: string;
  serviceDays?: [number, number];
  now: Date;
  dueDays?: number;
  validDays?: number;
  timeEntries?: string[];
}

function issuedDoc(d: DemoDoc, number: string, draftId: string): string {
  const net = d.quantity * d.unitPrice;
  const vat = Math.round((net * 19) / 100);
  const year = d.issued.getFullYear();
  const lines = [
    `number: ${number}`,
    `draft_id: ${draftId}`,
    `type_code: ${d.kind === 'invoice' ? '380' : 'null'}`,
    `issue_date: "${isoDate(d.issued)}"`,
  ];
  if (d.kind === 'invoice') {
    lines.push(`due_date: "${isoDate(addDays(d.issued, d.dueDays ?? 14))}"`);
  }
  lines.push('jurisdiction: de', `kind: ${d.kind}`, `client: ${d.client}`);
  if (d.kind === 'invoice') {
    lines.push('project: website');
    const [from, to] = d.serviceDays ?? [0, 0];
    lines.push(
      'service_period:',
      `  start: "${isoDate(addDays(d.now, from))}"`,
      `  end: "${isoDate(addDays(d.now, to))}"`,
    );
  } else {
    lines.push(`valid_until: "${isoDate(addDays(d.issued, d.validDays ?? 30))}"`);
  }
  lines.push(
    'lines:',
    `  - { description: ${d.description}, quantity: "${d.quantity}", unit: ${d.unit}, unit_price: ${d.unitPrice}, vat_category: S, vat_rate: "19" }`,
  );
  if (d.timeEntries?.length) {
    lines.push('time_entries:', ...d.timeEntries.map((id) => `  - ${id}`));
  }
  lines.push(...SELLER, ...d.buyer);
  if (d.kind === 'invoice') {
    lines.push(
      'payment:',
      '  means_code: "58"',
      '  iban: DE89370400440532013000',
      '  bic: COBADEFFXXX',
      `  reference: ${number}`,
    );
  }
  lines.push(
    'totals:',
    `  net: ${net}`,
    `  vat: ${vat}`,
    `  gross: ${net + vat}`,
    '  breakdown:',
    `    - { category: S, rate: "19", taxable: ${net}, tax: ${vat} }`,
    'legal_notes: []',
    `retain_until: "${year + 8}-12-31"`,
    '',
  );
  return lines.join('\n');
}

function business(now: Date): Record<string, string> {
  const files: Record<string, string> = {};
  const put = (path: string, lines: string[]) => {
    files[`${BIZ}/${path}`] = `${lines.join('\n')}\n`;
  };

  put('business.yaml', [
    'name: Demo Studio',
    'address: { street: Beispielstrasse 12, postcode: "10115", city: Berlin, country: DE }',
    'vat_id: DE000000000',
    'contact: { name: Demo Owner, email: hello@demo-studio.example }',
    'bank: { iban: DE89370400440532013000, bic: COBADEFFXXX, account_holder: Demo Studio }',
    'jurisdiction: de',
    'vat_regime: regular',
    'currency: EUR',
    'language: en',
    'payment_terms_days: 14',
    'default_vat_rate: "19"',
  ]);

  const northwind = [
    'northwind-labs',
    'Northwind Labs GmbH',
    'Hafenstrasse 3',
    '20457',
    'Hamburg',
  ] as const;
  const harbor = ['harbor-coffee', 'Harbor Coffee UG', 'Kaffeeweg 8', '50667', 'Koeln'] as const;
  put(`clients/${northwind[0]}/client.yaml`, [
    `name: ${northwind[1]}`,
    `address: { street: ${northwind[2]}, postcode: "${northwind[3]}", city: ${northwind[4]}, country: DE }`,
    'contacts: [{ name: Nora Wind, email: nora@northwind.example, role: Product }]',
    'payment_terms_days: 14',
    'stage: active',
    'tags: [web]',
  ]);
  put(`clients/${harbor[0]}/client.yaml`, [
    `name: ${harbor[1]}`,
    `address: { street: ${harbor[2]}, postcode: "${harbor[3]}", city: ${harbor[4]}, country: DE }`,
    'contacts: [{ name: Hans Hafen, email: hans@harbor.example }]',
    'stage: offer-sent',
  ]);
  put('clients/tidepool-studio/client.yaml', [
    'name: Tidepool Studio',
    'address: { street: Gezeitenallee 2, postcode: "24103", city: Kiel, country: DE }',
    'contacts: [{ name: Tia Pool, email: tia@tidepool.example }]',
    'stage: lead',
  ]);

  put(`clients/${northwind[0]}/projects/website.yaml`, [
    `client: ${northwind[0]}`,
    'name: Website relaunch',
    'status: active',
    'rate: { per: hour, amount: 10000 }',
    'budget_minutes: 6000',
  ]);
  put(`clients/${northwind[0]}/contracts/${ulid(1)}.yaml`, [
    `id: ${ulid(1)}`,
    `client: ${northwind[0]}`,
    'kind: service-agreement',
    'title: Web development framework agreement',
    `start: "${isoDate(addDays(now, -320))}"`,
    `end: "${isoDate(addDays(now, 40))}"`,
    'notice_period_days: 30',
  ]);

  const stamp = (d: number, h: number, m: number) =>
    `${isoDate(addDays(now, d))} ${pad(h)}:${pad(m)}:00`;
  put(`clients/${northwind[0]}/todos.todos.md`, [
    `- [>] Plan the launch checklist with Nora #website`,
    `::created:: ${addDays(now, -6).toISOString()}`,
    `- [ ] Send the updated sitemap #website`,
    `::created:: ${addDays(now, -2).toISOString()}`,
    `- [ ] Remind about the overdue invoice #billing`,
    `::created:: ${addDays(now, -1).toISOString()}`,
    ...doneItem(now, 'Collect brand assets #website', -16, -30),
  ]);
  put(`clients/${northwind[0]}/log.actionlog.md`, [
    '# Action Log',
    '',
    `- ${stamp(-1, 16, 40)} Call with Nora about launch date #website`,
    `- ${stamp(-4, 11, 5)} Sent invoice reminder #billing`,
    `- ${stamp(-12, 9, 30)} Kick-off for the next sprint #website`,
    `- ${stamp(-33, 14, 0)} Agreed scope for phase two #contract`,
  ]);

  // Issue dates relative to now; numbering restarts at 1 for each year (also across a year boundary).
  const buyer = party('buyer', northwind[1], northwind[2], northwind[3], northwind[4]);
  const paidIds = [ulid(2), ulid(3)];
  const overdueIds = [ulid(4)];
  const docs: { path: string; doc: DemoDoc }[] = [
    {
      path: 'paid',
      doc: {
        kind: 'invoice',
        issued: addDays(now, -40),
        client: northwind[0],
        buyer,
        quantity: 10,
        unit: 'HUR',
        unitPrice: 10000,
        description: 'Frontend development',
        serviceDays: [-70, -41],
        now,
        timeEntries: paidIds,
      },
    },
    {
      path: 'overdue',
      doc: {
        kind: 'invoice',
        issued: addDays(now, -30),
        client: northwind[0],
        buyer,
        quantity: 8,
        unit: 'HUR',
        unitPrice: 10000,
        description: 'Backend development',
        serviceDays: [-40, -31],
        now,
        timeEntries: overdueIds,
      },
    },
    {
      path: 'offer',
      doc: {
        kind: 'offer',
        issued: addDays(now, -5),
        client: harbor[0],
        buyer: party('buyer', harbor[1], harbor[2], harbor[3], harbor[4]),
        quantity: 1,
        unit: 'C62',
        unitPrice: 400000,
        description: 'Online shop setup',
        now,
        validDays: 30,
      },
    },
  ];
  const counters = new Map<string, number>();
  const numbers: Record<string, string> = {};
  let draft = 10;
  for (const entry of docs) {
    const { kind, issued } = entry.doc;
    const year = issued.getFullYear();
    const key = `${kind}-${year}`;
    const n = (counters.get(key) ?? 0) + 1;
    counters.set(key, n);
    const number =
      kind === 'invoice'
        ? `RE-${year}-${String(n).padStart(4, '0')}`
        : `AN-${year}-${String(n).padStart(3, '0')}`;
    numbers[entry.path] = number;
    const dir = kind === 'invoice' ? 'invoices' : 'offers';
    files[`${BIZ}/${dir}/${year}/${number}.yaml`] = issuedDoc(entry.doc, number, ulid(draft++));
  }

  const entries = [
    { id: paidIds[0], d: -50, minutes: 360, note: 'Landing page', invoice: numbers.paid },
    { id: paidIds[1], d: -49, minutes: 240, note: 'Navigation and footer', invoice: numbers.paid },
    { id: overdueIds[0], d: -35, minutes: 480, note: 'Contact form API', invoice: numbers.overdue },
    { id: ulid(5), d: -1, minutes: 180, note: 'Launch checklist' },
    { id: ulid(6), d: 0, minutes: 240, note: 'Sitemap and redirects' },
  ];
  const byMonth = new Map<string, string[]>();
  for (const e of entries) {
    const date = addDays(now, e.d);
    const line = JSON.stringify({
      id: e.id,
      date: isoDate(date),
      minutes: e.minutes,
      client: northwind[0],
      project: 'website',
      note: e.note,
      ...(e.invoice ? { invoice: e.invoice } : {}),
    });
    const month = isoDate(date).slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), line]);
  }
  for (const [month, lines] of byMonth)
    files[`${BIZ}/time/${month}.jsonl`] = `${lines.join('\n')}\n`;

  const payDate = addDays(now, -25);
  files[`${BIZ}/payments/${payDate.getFullYear()}.jsonl`] =
    `${JSON.stringify({ id: ulid(7), date: isoDate(payDate), invoice: numbers.paid, amount: 119000, method: 'transfer' })}\n`;
  files[`${BIZ}/events.jsonl`] =
    `${JSON.stringify({ id: ulid(8), at: `${isoDate(addDays(now, -30))}T09:30:00Z`, doc: numbers.overdue, type: 'sent' })}\n`;

  return files;
}

const CLIENTS_WIKI = [
  '# Clients',
  '',
  'Active work: [[client:northwind-labs]] (website relaunch, launch checklist in progress).',
  '',
].join('\n');

// ─── Travel, prompts, commands, palette, misc file kinds ─────────────────────

function travel(now: Date): string {
  const d = (n: number) => isoDate(addDays(now, n));
  const dt = (n: number, h: number) => `${d(n)}T${pad(h)}:00`;
  const base = { custom: [] as { key: string; value: string }[] };
  return `${JSON.stringify(
    {
      version: 1,
      currency: 'EUR',
      trips: [
        {
          id: 'trip-lisbon',
          title: 'Lisbon long weekend',
          start: d(21),
          end: d(25),
          destination: 'Lisbon, Portugal',
          notes: 'Book the Sintra day trip once the flights are confirmed.',
          custom: [],
          steps: [
            {
              ...base,
              id: 'lis-flight',
              type: 'flight',
              from: 'Berlin BER',
              to: 'Lisbon LIS',
              start: dt(21, 7),
              end: dt(21, 10),
              ref: 'TP1234',
              cost: 189.9,
            },
            {
              ...base,
              id: 'lis-hotel',
              type: 'hotel',
              from: d(21),
              to: d(25),
              ref: 'HTL-55821',
              cost: 412,
              address: 'Rua Augusta 100, Lisbon',
            },
            {
              ...base,
              id: 'lis-train',
              type: 'train',
              from: 'Lisbon Rossio',
              to: 'Sintra',
              start: dt(23, 9),
              end: dt(23, 10),
              ref: 'CP-7781',
              cost: 9.2,
            },
            {
              ...base,
              id: 'lis-note',
              type: 'general',
              title: 'Pastéis de Belém',
              description: 'Go early to skip the queue.',
            },
          ],
        },
        {
          id: 'trip-alps',
          title: 'Alps road trip',
          start: d(-45),
          end: d(-40),
          destination: 'Innsbruck, Austria',
          custom: [],
          steps: [
            {
              ...base,
              id: 'alp-rental',
              type: 'rental',
              from: 'Munich',
              to: 'Munich',
              start: dt(-45, 9),
              end: dt(-40, 18),
              ref: 'RENT-9921',
              cost: 245,
            },
            {
              ...base,
              id: 'alp-car',
              type: 'car',
              tollStart: 'Munich',
              tollEnd: 'Innsbruck',
              tollRef: 'VIG-2026',
              cost: 12.5,
            },
            {
              ...base,
              id: 'alp-hotel',
              type: 'hotel',
              from: d(-45),
              to: d(-40),
              ref: 'ALP-3310',
              cost: 530,
            },
          ],
        },
      ],
    },
    null,
    2,
  )}\n`;
}

const PROMPTS = `# Prompts

## Summarize an article #writing #summary

Summarize the article below in five bullet points, then list any claims that need a source.

## Refactor to hooks #react #refactor

Convert the class component below into a function component using hooks.
Keep the public props identical.

## Commit message #git

Write a conventional-commit message for the staged diff.
`;

const COMMANDS = `# Commands

## Free a port #shell #network

Find and kill whatever listens on a port.

\`\`\`sh
lsof -ti :{{port}} | xargs kill
\`\`\`

## Git branches by recency #git

\`\`\`sh
git branch --sort=-committerdate | head -10
\`\`\`

## Disk usage #shell

\`\`\`sh
du -sh * | sort -h
\`\`\`
`;

const PALETTE_SETTINGS = `${JSON.stringify(
  {
    searchEngines: [
      { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q={query}', params: [] },
      { name: 'Wikipedia', url: 'https://en.wikipedia.org/w/index.php?search={query}', params: [] },
    ],
    assistants: [{ name: 'Claude', url: 'https://claude.ai/new?q={query}', params: [] }],
    tools: [
      {
        prefix: 'npm',
        name: 'npm packages',
        description: 'Search the npm registry for what is typed',
        url: 'https://www.npmjs.com/search',
        params: [{ key: 'q', value: '{query}' }],
      },
    ],
  },
  null,
  2,
)}\n`;

const READING_LIST_CSV = `title,author,year,status
Deep Work,Cal Newport,2016,finished
"Thinking, Fast and Slow",Daniel Kahneman,2011,reading
The Pragmatic Programmer,Hunt & Thomas,1999,finished
Atomic Habits,James Clear,2018,finished
Designing Data-Intensive Applications,Martin Kleppmann,2017,reading
The Mom Test,Rob Fitzpatrick,2013,queued
Essentialism,Greg McKeown,2014,queued
Four Thousand Weeks,Oliver Burkeman,2021,queued
`;

const APP_SETTINGS_JSON = `${JSON.stringify(
  {
    app: { name: 'Life OS', version: '1.0.0', locale: 'en' },
    ui: { theme: 'nexus', density: 'comfortable', sidebar: { collapsed: false, width: 260 } },
    sync: { enabled: true, intervalMinutes: 15, targets: ['github', 'local'] },
    features: { beta: false, shortcuts: { palette: 'Mod+K', capture: 'Mod+Shift+N' } },
  },
  null,
  2,
)}\n`;

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <rect width="64" height="64" rx="14" fill="#4f46e5"/>
  <path d="M20 16v32M20 34l22-18M26 30l18 18" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>
`;

const PLAIN_TXT = `Plain text note

Just some unformatted text with no markup at all.
Line two of the note.
`;

// A .drawio file has no viewer yet, so this exercises the fallback.
const DIAGRAM_DRAWIO = `<mxfile host="app.diagrams.net">
  <diagram name="Page-1" id="demo">
    <mxGraphModel dx="800" dy="600" grid="1" gridSize="10">
      <root>
        <mxCell id="0"/>
        <mxCell id="1" parent="0"/>
        <mxCell id="2" value="Capture" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="40" y="40" width="100" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="3" value="Review" style="rounded=1;" vertex="1" parent="1">
          <mxGeometry x="220" y="40" width="100" height="40" as="geometry"/>
        </mxCell>
        <mxCell id="4" edge="1" parent="1" source="2" target="3">
          <mxGeometry relative="1" as="geometry"/>
        </mxCell>
      </root>
    </mxGraphModel>
  </diagram>
</mxfile>
`;

// Encrypted with core's \`encrypt\` (passphrase "demo"); precomputed because the seed is synchronous.
export const DEMO_PASSPHRASE = 'demo';
export const SECRET_NOTE_PLAINTEXT =
  '# Secret note\n\nThis note is encrypted with the passphrase `demo`.\n\n- Treasure map: under the old oak\n';
const SECRET_NOTE_ENC =
  'MDcwMDE5YzY2OWEyOGZkYzI2ZTg0MjMzYTkyNjhiOGE6OThlNjdmNDg0NDUxY2MxYjZhNjgwZjEyOmI4MDFlNzZmNmIwNGQ2NDhlYjA2YzNjNjRjMzY0OThkMGQyNjg0MzdkYjk2ZDIzZWM3Y2RlNjdkODgxMGM2NDJlNjlkNjhmOTRiYTMxNzA3NTU1YTBlOTE5Yjg0YzU5YTAyNGMxNDhmNmZlOTI1MjJhMzdkNTI3MzhlZDM1MjdkZDhhNDY1YWMzMGI1ZWMzMDFmYjY5OWE5YTY4ZTFhZDFiMWM4ODcxODBmNGM4OGM1ZjBkZTdlMTE0ZGM5NDkzYWM3MDNkOTJkNTZmYTQyMGUzMDJmZjRjZjdkMGQ5YmViYmY2NjdjOTZkZg==';

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
    '.kh/trips.travel.json': travel(now),
    '.kh/ai.prompts.md': PROMPTS,
    '.kh/shell.commands.md': COMMANDS,
    '.kh/command-palette.settings.json': PALETTE_SETTINGS,
    'data/reading-list.csv': READING_LIST_CSV,
    'data/app-settings.json': APP_SETTINGS_JSON,
    'images/logo.svg': LOGO_SVG,
    'notes/plain.txt': PLAIN_TXT,
    'notes/diagram.drawio': DIAGRAM_DRAWIO,
    'notes/secret.md.enc': SECRET_NOTE_ENC,
    'README.md': README,
    'notes/welcome.md': WELCOME,
    'notes/ideas.md': IDEAS,
    ...ideas(now),
    ...business(now),
    '.kh/wiki/clients.md': CLIENTS_WIKI,
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
