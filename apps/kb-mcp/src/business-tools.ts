import { localDate } from '@kaihuman/formats';
import {
  addClientLog,
  addClientTodo,
  asSlug,
  type Client,
  checkBusinessRepo,
  contractDates,
  contractReminders,
  DOC_KINDS,
  type Draft,
  deriveInvoiceStatus,
  deriveOfferStatus,
  type FileChanges,
  formatFinding,
  type Issued,
  isUlid,
  logTime,
  type Result,
  retainersDue,
  saveDraft,
  saveExpense,
  timePath,
  ulid,
  VAT_CATEGORIES,
  validateDraft,
  vatSummary,
} from '@kaihuman/formats/business';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { type BusinessFiles, type LoadedBusiness, refusal } from './business.js';
import { KbError } from './repo.js';

export interface BusinessToolDeps {
  files: BusinessFiles;
  /** Runs a handler in the server's one-at-a-time queue, after a git pull when sync is on. */
  run: <A>(handler: (args: A) => Promise<CallToolResult>) => (args: A) => Promise<CallToolResult>;
  /** Commits only `paths` with `message` when git sync is on, and says what happened. */
  commit: (paths: string[], message: string) => Promise<string>;
}

const json = (value: unknown): CallToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
});

const DATE = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const TODAY = DATE.optional().describe(
  'Treat this date as today (YYYY-MM-DD); default: the server’s local date.',
);
const CLIENT = z.string().trim().min(1).max(100).describe('Client slug (see business_clients).');
const SLUGISH = z.string().trim().min(1).max(100);
const TEXT = z.string().trim().min(1).max(20_000);
const PERIOD = z
  .string()
  .regex(/^\d{4}(-(0[1-9]|1[0-2])|-Q[1-4])?$/, 'Use YYYY, YYYY-MM or YYYY-Qn');

const NEVER_ISSUES =
  'Draft-only: this tool never issues, numbers or deletes anything. Tell the user to issue the document in the kaihuman console.';

const LINE = z
  .object({
    description: z.string().max(2000),
    quantity: z.string().max(20).describe('Decimal string such as "7.5".'),
    unit: z.string().max(10).describe('UN/ECE unit code: HUR (hour), DAY, C62 (piece).'),
    unit_price: z.number().int().describe('Minor units (cents) per unit, excluding VAT.'),
    vat_category: z.enum(VAT_CATEGORIES),
    vat_rate: z.string().max(10).describe('Percent as a string, such as "19" or "0".'),
  })
  .strict();

const DRAFT_FIELDS = {
  kind: z.enum(DOC_KINDS),
  client: CLIENT,
  project: SLUGISH.optional(),
  currency: z.string().max(3).optional(),
  language: z.enum(['de', 'en']).optional(),
  service_period: z.object({ start: DATE, end: DATE }).strict().optional(),
  service_date: DATE.optional(),
  lines: z.array(LINE).max(200),
  notes: z.string().max(5000).optional(),
  payment_terms_days: z.number().int().min(0).max(365).optional(),
  valid_until: DATE.optional().describe('Offers only.'),
  from_offer: z.string().max(50).optional(),
  supersedes: z.string().max(50).optional().describe('Offers only: number of the offer replaced.'),
  corrects: z
    .string()
    .max(50)
    .optional()
    .describe('Credit notes only: number of the invoice corrected.'),
  buyer_reference: z.string().max(100).optional(),
  time_entries: z.array(z.string()).max(1000).optional().describe('Ids of time entries billed.'),
  from_retainer: DATE.optional().describe('Retainer drafts: the next_date being billed.'),
};

const draftOf = (id: string, input: Record<string, unknown>): Draft => {
  const fields = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
  return { id, ...fields } as unknown as Draft;
};

const sum = (values: number[]) => values.reduce((a, b) => a + b, 0);

/** Registers the business read tools and the draft-only write tools. */
export function registerBusinessTools(server: McpServer, deps: BusinessToolDeps): void {
  const { files, run, commit } = deps;

  const load = async () => {
    const loaded = await files.load();
    files.requireBusiness(loaded);
    return loaded;
  };

  const invoices = ({ repo }: LoadedBusiness) => repo.issued.filter((i) => i.doc.kind !== 'offer');
  const creditNotes = (b: LoadedBusiness) =>
    b.repo.issued.filter((i) => i.doc.kind === 'credit-note').map((i) => i.doc);
  const invoiceStatus = (b: LoadedBusiness, doc: Issued, today: string) =>
    deriveInvoiceStatus(doc, b.repo.payments, creditNotes(b), b.repo.events, today);

  const findClient = (b: LoadedBusiness, ref: string): Client => {
    const wanted = ref.toLowerCase();
    const client =
      b.repo.clients.find((c) => c.slug === wanted) ??
      b.repo.clients.find((c) => c.name.toLowerCase() === wanted);
    if (!client) throw new KbError(`Unknown client ${ref}. Use business_clients.`);
    return client;
  };

  /** Applies a formats action result: writes its changes, commits them, returns the tool result. */
  const apply = async (
    result: Result<{ changes: FileChanges; message: string }>,
    extra: Record<string, unknown> = {},
  ) => {
    if (!result.ok) throw refusal(result.issues);
    const paths = await files.write(result.value.changes);
    return json({ paths, ...extra, git: await commit(paths, result.value.message) });
  };

  server.registerTool(
    'business_clients',
    {
      title: 'List business clients',
      description:
        'Overview of the clients in .kh/business: slug, name, stage, tags, currency, open invoice amount (minor units), overdue invoice count and unbilled minutes. Optionally filtered by stage.',
      inputSchema: {
        stage: z.enum(['lead', 'contacted', 'offer-sent', 'active', 'past', 'lost']).optional(),
        today: TODAY,
      },
    },
    run(async ({ stage, today: given }: { stage?: string; today?: string }) => {
      const b = await load();
      const today = given ?? localDate(new Date());
      const rows = b.repo.clients
        .filter((c) => !stage || c.stage === stage)
        .map((c) => {
          const statuses = invoices(b)
            .filter((i) => i.doc.client === c.slug && i.doc.kind === 'invoice')
            .map((i) => invoiceStatus(b, i.doc, today));
          return {
            slug: c.slug,
            name: c.name,
            stage: c.stage,
            tags: c.tags ?? [],
            currency: c.currency ?? b.repo.profile?.currency ?? null,
            open: sum(statuses.map((s) => s.open)),
            overdue: statuses.filter((s) => s.state === 'overdue').length,
            unbilledMinutes: sum(
              b.repo.time.filter((t) => t.client === c.slug && !t.invoice).map((t) => t.minutes),
            ),
          };
        });
      return json(rows);
    }),
  );

  server.registerTool(
    'business_client',
    {
      title: 'Read one business client',
      description:
        'Everything about one client: record, projects, contracts with their dates, drafts (in full), offers and invoices (with derived status), payments, unbilled time (full entries) and minutes per month, expenses, and the notes/todos/log files as text. Amounts are minor units.',
      inputSchema: { client: CLIENT, today: TODAY },
    },
    run(async ({ client: ref, today: given }: { client: string; today?: string }) => {
      const b = await load();
      const today = given ?? localDate(new Date());
      const client = findClient(b, ref);
      const mine = b.repo.issued.filter((i) => i.doc.client === client.slug);
      const offers = mine
        .filter((i) => i.doc.kind === 'offer')
        .map(({ doc }) => ({
          number: doc.number,
          issue_date: doc.issue_date,
          valid_until: doc.valid_until ?? null,
          gross: doc.totals.gross,
          status: deriveOfferStatus(
            doc,
            b.repo.events,
            b.repo.issued.filter((i) => i.doc.kind === 'offer').map((i) => i.doc),
            today,
          ),
        }));
      const invoiceRows = mine
        .filter((i) => i.doc.kind !== 'offer')
        .map(({ doc }) => ({
          number: doc.number,
          kind: doc.kind,
          issue_date: doc.issue_date,
          due_date: doc.due_date ?? null,
          gross: doc.totals.gross,
          currency: doc.currency ?? client.currency ?? b.repo.profile?.currency ?? null,
          ...(doc.corrects ? { corrects: doc.corrects } : {}),
          status: invoiceStatus(b, doc, today),
        }));
      const numbers = new Set(invoiceRows.map((r) => r.number));
      const time = b.repo.time.filter((t) => t.client === client.slug);
      const minutesByMonth: Record<string, number> = {};
      for (const t of time) {
        const month = t.date.slice(0, 7);
        minutesByMonth[month] = (minutesByMonth[month] ?? 0) + t.minutes;
      }
      const text: Record<string, string> = {};
      for (const f of b.repo.clientFiles.filter((f) => f.client === client.slug)) {
        const content = b.files.get(f.path);
        if (content !== undefined) text[f.kind] = content;
      }
      return json({
        client,
        projects: b.repo.projects.filter((p) => p.client === client.slug),
        contracts: b.repo.contracts
          .filter((c) => c.client === client.slug)
          .map((c) => ({ ...c, dates: contractDates(c) })),
        drafts: b.repo.drafts.filter((d) => d.client === client.slug),
        offers,
        invoices: invoiceRows,
        payments: b.repo.payments.filter((p) => numbers.has(p.invoice)),
        time: { unbilled: time.filter((t) => !t.invoice), minutesByMonth },
        expenses: b.repo.expenses.filter((e) => e.client === client.slug),
        files: text,
      });
    }),
  );

  server.registerTool(
    'business_open_invoices',
    {
      title: 'List open invoices',
      description:
        'Invoices with an amount still to pay (minor units): number, client, dates, gross, open and state. Overdue first, then by due date. Totals of open and overdue amounts included.',
      inputSchema: { client: CLIENT.optional(), today: TODAY },
    },
    run(async ({ client: ref, today: given }: { client?: string; today?: string }) => {
      const b = await load();
      const today = given ?? localDate(new Date());
      const slug = ref ? findClient(b, ref).slug : undefined;
      const rows = invoices(b)
        .filter((i) => i.doc.kind === 'invoice' && (!slug || i.doc.client === slug))
        .map(({ doc }) => {
          const status = invoiceStatus(b, doc, today);
          return {
            number: doc.number,
            client: doc.client,
            issue_date: doc.issue_date,
            due_date: doc.due_date ?? null,
            gross: doc.totals.gross,
            open: status.open,
            state: status.state,
          };
        })
        .filter((r) => r.open > 0)
        .sort(
          (a, c) =>
            Number(c.state === 'overdue') - Number(a.state === 'overdue') ||
            (a.due_date ?? '9999').localeCompare(c.due_date ?? '9999') ||
            a.number.localeCompare(c.number),
        );
      return json({
        invoices: rows,
        totals: {
          open: sum(rows.map((r) => r.open)),
          overdue: sum(rows.filter((r) => r.state === 'overdue').map((r) => r.open)),
        },
      });
    }),
  );

  server.registerTool(
    'business_vat_summary',
    {
      title: 'VAT summary',
      description:
        'Output tax by rate, input tax from expenses, reverse-charge base and the amount payable for a period (YYYY, YYYY-MM or YYYY-Qn), computed by the kaihuman library. Minor units. Not a tax filing: the user files it.',
      inputSchema: { period: PERIOD },
    },
    run(async ({ period }: { period: string }) => json(vatSummary((await load()).repo, period))),
  );

  server.registerTool(
    'business_reminders',
    {
      title: 'Business reminders',
      description:
        'Retainers whose next billing date is within retainerDays (overdue ones included, with whether a draft exists) and contract dates (renewal, notice, end) within contractDays.',
      inputSchema: {
        today: TODAY,
        retainerDays: z.number().int().min(0).max(365).default(14),
        contractDays: z.number().int().min(0).max(730).default(60),
      },
    },
    run(
      async ({
        today: given,
        retainerDays,
        contractDays,
      }: {
        today?: string;
        retainerDays: number;
        contractDays: number;
      }) => {
        const { repo } = await load();
        const today = given ?? localDate(new Date());
        return json({
          today,
          retainers: retainersDue(repo, today, retainerDays).map((r) => ({
            client: r.project.client,
            project: r.project.slug,
            date: r.date,
            amount: r.project.retainer?.amount ?? null,
            hasDraft: r.hasDraft,
            draftId: r.draftId ?? null,
          })),
          contracts: contractReminders(repo, today, contractDays).map(
            ({ contract, date, what }) => ({
              client: contract.client,
              id: contract.id,
              title: contract.title,
              date,
              what,
            }),
          ),
        });
      },
    ),
  );

  server.registerTool(
    'business_check',
    {
      title: 'Check business data',
      description:
        'Runs the repository checks over .kh/business (schema, references, numbering, totals, links). The frozen-file rule (issued documents never change) needs git history and is not checked here. Works without a profile.',
    },
    run(async () => {
      const b = await files.load();
      // The checker looks files up by path, so binary files are present as empty text.
      const present = new Map(b.files);
      for (const path of b.tree) if (!present.has(path)) present.set(path, '');
      const findings = checkBusinessRepo({
        files: present,
        symlinks: b.symlinks,
        changes: null,
        today: localDate(new Date()),
      });
      const errors = findings.filter((f) => f.level === 'error').length;
      return json({
        errors,
        warnings: findings.length - errors,
        findings: findings.map(formatFinding),
        note: 'The frozen-file rule (issued documents never change) is not checked here.',
      });
    }),
  );

  server.registerTool(
    'business_create_draft',
    {
      title: 'Create business draft',
      description: `Save a new offer, invoice or credit-note draft for a client under .kh/business/drafts with a fresh id. Amounts are minor units (cents); quantities are decimal strings. ${NEVER_ISSUES}`,
      inputSchema: DRAFT_FIELDS,
    },
    run(async (input: Record<string, unknown>) => {
      const b = await load();
      const id = ulid();
      const draft = draftOf(id, input);
      const checked = validateDraft(draft);
      if (!checked.ok) throw refusal(checked.issues);
      return apply(saveDraft(b.repo, checked.value), { id });
    }),
  );

  server.registerTool(
    'business_update_draft',
    {
      title: 'Update business draft',
      description: `Replace an existing draft completely with the given fields (read it first with business_client; send every field to keep). The id must name an existing draft; an issued draft is refused. ${NEVER_ISSUES}`,
      inputSchema: { id: z.string().trim().min(1).max(40), ...DRAFT_FIELDS },
    },
    run(async ({ id, ...input }: { id: string } & Record<string, unknown>) => {
      const b = await load();
      if (!isUlid(id) || !b.repo.drafts.some((d) => d.id === id)) {
        throw new KbError(`No draft ${id}. Use business_client to list a client's drafts.`);
      }
      return apply(saveDraft(b.repo, draftOf(id, input)), { id });
    }),
  );

  server.registerTool(
    'business_add_time',
    {
      title: 'Log business time',
      description:
        'Append a time entry for a client (and optional project) to the month file. Never starts or stops the timer and never changes existing entries.',
      inputSchema: {
        client: CLIENT,
        project: SLUGISH.optional(),
        date: DATE.optional().describe('Default: today.'),
        minutes: z.number().int().min(1).max(1440),
        note: z.string().trim().max(500),
      },
    },
    run(
      async (a: {
        client: string;
        project?: string;
        date?: string;
        minutes: number;
        note: string;
      }) => {
        const b = await load();
        const client = findClient(b, a.client).slug;
        const project = a.project === undefined ? undefined : asSlug(a.project);
        if (a.project !== undefined && !project) {
          throw new KbError(`Unknown project ${a.project} of client ${a.client}.`);
        }
        const date = a.date ?? localDate(new Date());
        const month = timePath(date.slice(0, 7));
        const id = ulid();
        return apply(
          logTime(
            b.repo,
            { [month]: b.files.get(month) ?? '' },
            { date, minutes: a.minutes, client, ...(project ? { project } : {}), note: a.note },
            { id },
          ),
          { id },
        );
      },
    ),
  );

  const clientText = (kind: 'todos' | 'log') => async (a: { client: string; text: string }) => {
    const b = await load();
    const client = findClient(b, a.client);
    const path = b.repo.clientFiles.find((f) => f.client === client.slug && f.kind === kind)?.path;
    const current = path === undefined ? null : (b.files.get(path) ?? null);
    const add = kind === 'todos' ? addClientTodo : addClientLog;
    return apply(add(b.repo, current, client.slug, a.text, new Date()));
  };

  server.registerTool(
    'business_add_todo',
    {
      title: 'Add client todo',
      description:
        "Add an open todo to a client's todo file (clients/<slug>/todos.todos.md). Inline #tags are allowed.",
      inputSchema: { client: CLIENT, text: TEXT },
    },
    run(clientText('todos')),
  );

  server.registerTool(
    'business_add_log',
    {
      title: 'Add client log entry',
      description:
        "Add a dated entry to a client's action log (clients/<slug>/log.actionlog.md): a call, a decision, something sent.",
      inputSchema: { client: CLIENT, text: TEXT },
    },
    run(clientText('log')),
  );

  server.registerTool(
    'business_add_expense',
    {
      title: 'Add business expense',
      description:
        'Record a new expense (a new id each time; no receipt file, no edits to existing expenses). Amounts are minor units; vat_rate is a percent string.',
      inputSchema: {
        date: DATE,
        supplier: z.string().trim().min(1).max(200),
        description: z.string().trim().max(500),
        category: z.string().trim().min(1).max(100),
        net: z.number().int(),
        vat: z.number().int(),
        gross: z.number().int(),
        vat_rate: z.string().max(10),
        client: CLIENT.optional(),
        project: SLUGISH.optional(),
      },
    },
    run(async (input: Record<string, unknown>) => {
      const b = await load();
      const id = ulid();
      const fields = Object.fromEntries(Object.entries(input).filter(([, v]) => v !== undefined));
      return apply(saveExpense(b.repo, { id, ...fields } as never), { id });
    }),
  );
}
