import {
  type BusinessRepo,
  type Expense,
  expensesCsv,
  type VatSummary,
  vatCsv,
  vatSummary,
} from '@kaihuman/formats/business';
import { useRef, useState } from 'preact/hooks';
import { Card } from '../components/business/Card';
import { INPUT } from '../components/business/FormField';
import { money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { todayLocal } from '../lib/business/dates';
import { csvBlob, downloadBlob } from '../lib/business/download';
import { openReceipt } from '../lib/business/receipt';
import { useBusinessRepo } from '../lib/business/use-business-repo';
import { buildYearExport } from '../lib/business/year-export';
import type { KBRepo } from '../lib/github-kb';

type Kind = 'month' | 'quarter' | 'year';

const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';
const BUTTON =
  'px-3 py-1.5 text-xs rounded border border-[var(--los-border)] hover:opacity-90 disabled:opacity-50';
const NOT_APPLICABLE = 'No VAT: small-business regime (§19 UStG).';
const BASIS_LABEL = { accrual: 'Soll (accrual)', cash: 'Ist (cash)' } as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** The periods of `kind` in `year`, as the strings `vatSummary` takes. */
const periodsOf = (year: string, kind: Kind): string[] =>
  kind === 'month'
    ? Array.from({ length: 12 }, (_, i) => `${year}-${pad(i + 1)}`)
    : kind === 'quarter'
      ? [1, 2, 3, 4].map((q) => `${year}-Q${q}`)
      : [year];

/** The period containing today when the year is the current one, else the first. */
const defaultPeriod = (year: string, kind: Kind, today: string): string => {
  const periods = periodsOf(year, kind);
  if (!today.startsWith(year)) return periods[0] ?? year;
  const month = Number(today.slice(5, 7));
  return (
    periods[kind === 'month' ? month - 1 : kind === 'quarter' ? Math.ceil(month / 3) - 1 : 0] ??
    year
  );
};

const KIND_LABEL: Record<Kind, string> = { month: 'Month', quarter: 'Quarter', year: 'Year' };

function VatBlock(props: { summary: VatSummary; currency: string }) {
  const { summary, currency } = props;
  if (!summary.applicable) return <p class="text-xs">{NOT_APPLICABLE}</p>;
  const due = summary.payable;
  return (
    <div class="text-xs space-y-2">
      <p>
        {summary.period}, basis: {BASIS_LABEL[summary.basis]}
      </p>
      <table class="w-full">
        <thead>
          <tr>
            <th class={th}>Output VAT</th>
            <th class={`${th} text-right`}>Net</th>
            <th class={`${th} text-right`}>VAT</th>
          </tr>
        </thead>
        <tbody>
          {summary.output.length === 0 && (
            <tr>
              <td class={td} colSpan={3}>
                None in this period.
              </td>
            </tr>
          )}
          {summary.output.map((row) => (
            <tr key={`${row.category}|${row.rate}`}>
              <td class={td}>
                {row.category} {row.rate}%
              </td>
              <td class={`${td} text-right`}>{money(row.taxable, currency)}</td>
              <td class={`${td} text-right`}>{money(row.tax, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl class="grid grid-cols-2 gap-1 max-w-sm">
        <dt>Output VAT</dt>
        <dd class="text-right">{money(summary.outputTax, currency)}</dd>
        <dt>Input VAT</dt>
        <dd class="text-right">{money(summary.inputTax, currency)}</dd>
        <dt>Reverse-charge net</dt>
        <dd class="text-right">{money(summary.reverseChargeNet, currency)}</dd>
        <dt class="font-bold">{due < 0 ? 'Refund' : 'Payable'}</dt>
        <dd class="text-right font-bold">{money(Math.abs(due), currency)}</dd>
      </dl>
    </div>
  );
}

type ExportState =
  | { status: 'idle' }
  | { status: 'running'; done: number; total: number }
  | { status: 'done'; name: string }
  | { status: 'failed'; message: string };

/** Reads the year's files from the repo and downloads them, with CSV summaries, as one zip. */
function YearExport(props: { target: KBRepo; data: BusinessRepo; year: string }) {
  const { target, data, year } = props;
  const [state, setState] = useState<ExportState>({ status: 'idle' });
  const running = state.status === 'running';
  // Each run's id; progress from a run that has ended must not overwrite its result.
  const currentRun = useRef(0);

  async function run() {
    const id = ++currentRun.current;
    let ended = false;
    // The progress text is a live region: it changes in 10% steps and on the final count, so a
    // screen reader is not flooded with one announcement per file.
    let step = -1;
    setState({ status: 'running', done: 0, total: 0 });
    try {
      const zip = await buildYearExport(target, data, year, (done, total) => {
        if (ended || currentRun.current !== id) return;
        const now = total === 0 ? 0 : Math.floor((done * 10) / total);
        if (now <= step && done !== total) return;
        step = now;
        setState({ status: 'running', done, total });
      });
      ended = true;
      const name = `business-${year}.zip`;
      downloadBlob(name, new Blob([zip as BlobPart], { type: 'application/zip' }));
      setState({ status: 'done', name });
    } catch (e) {
      ended = true;
      setState({ status: 'failed', message: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <section
      aria-label="Year export"
      class="border border-[var(--los-border)] p-3 min-w-0 space-y-2"
    >
      <h2 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)]">Year export</h2>
      <p class="text-xs text-[var(--los-fg-dim)]">
        One zip for {year}: invoices, offers, expenses with receipts, payments, time, the clients
        involved and their contracts, CSV summaries and SHA-256 checksums. Uses the year selected
        above.
      </p>
      <button type="button" class={BUTTON} disabled={running} onClick={run}>
        Export year for Steuerberater…
      </button>
      <output class="block text-xs">
        {state.status === 'running'
          ? state.total === 0
            ? 'Listing files…'
            : `Reading ${state.done} of ${state.total} files…`
          : state.status === 'done'
            ? `Downloaded ${state.name}.`
            : ''}
      </output>
      {state.status === 'failed' && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {state.message}
        </p>
      )}
    </section>
  );
}

function ExpensesBody(props: { target: KBRepo; data: Parameters<typeof vatSummary>[0] }) {
  const { target, data } = props;
  const { expenses } = data;
  const today = todayLocal();
  const currency = data.profile?.currency ?? 'EUR';
  const thisYear = today.slice(0, 4);
  // The current and the previous year are always there, so a new year or a first import has a target.
  // Any year with records is offered, so the year export can reach a year without expenses.
  const years = [
    ...new Set([
      thisYear,
      String(Number(thisYear) - 1),
      ...expenses.map((e) => e.date.slice(0, 4)),
      ...data.issued.map(({ doc }) => doc.issue_date.slice(0, 4)),
      ...data.payments.map((p) => p.date.slice(0, 4)),
      ...data.time.map((t) => t.date.slice(0, 4)),
    ]),
  ].sort((a, b) => b.localeCompare(a));
  const [year, setYear] = useState(today.slice(0, 4));
  const [kind, setKind] = useState<Kind>('quarter');
  const [period, setPeriod] = useState(() => defaultPeriod(today.slice(0, 4), 'quarter', today));
  const [error, setError] = useState<string | null>(null);

  const inYear = expenses.filter((e) => e.date.startsWith(year));
  const listed = [...inYear].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  );
  const summary = vatSummary(data, period);

  const exportExpenses = () => {
    const sorted = [...inYear].sort(
      (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
    );
    downloadBlob(`expenses-${year}.csv`, csvBlob(expensesCsv(sorted)));
  };
  const exportVat = () => {
    const periods = [...periodsOf(year, 'month'), ...periodsOf(year, 'quarter'), year];
    downloadBlob(`vat-${year}.csv`, csvBlob(vatCsv(periods.map((p) => vatSummary(data, p)))));
  };
  async function receipt(expense: Expense) {
    setError(null);
    try {
      await openReceipt(target, expense);
    } catch (e) {
      setError(`Could not open the receipt: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <>
      <div class="flex flex-wrap items-end gap-3">
        <div>
          <label for="year" class="block text-xs text-[var(--los-fg-dim)] mb-1">
            Year
          </label>
          <select
            id="year"
            class={INPUT}
            value={year}
            onChange={(e) => {
              const next = (e.target as HTMLSelectElement).value;
              setYear(next);
              setPeriod(defaultPeriod(next, kind, today));
            }}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </div>
        <a
          href="/business/expenses/new"
          class="px-3 py-1.5 text-xs rounded bg-[var(--los-accent)] text-black font-bold hover:opacity-90"
        >
          New expense
        </a>
        <button type="button" class={BUTTON} onClick={exportExpenses}>
          Export expenses (CSV)
        </button>
        <button type="button" class={BUTTON} onClick={exportVat}>
          Export VAT (CSV)
        </button>
      </div>

      {error && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {error}
        </p>
      )}

      <Card
        title={`Expenses ${year}`}
        empty={listed.length === 0 ? `No expenses in ${year}.` : undefined}
      >
        <div class="overflow-x-auto">
          <table class="w-full text-xs">
            <thead>
              <tr>
                <th class={th}>Date</th>
                <th class={th}>Supplier</th>
                <th class={th}>Category</th>
                <th class={`${th} text-right`}>Net</th>
                <th class={`${th} text-right`}>VAT</th>
                <th class={`${th} text-right`}>Gross</th>
                <th class={th}>Receipt</th>
              </tr>
            </thead>
            <tbody>
              {listed.map((e) => (
                <tr key={e.id}>
                  <td class={`${td} whitespace-nowrap`}>
                    <a
                      href={`/business/expenses/${e.id}`}
                      class="text-[var(--los-accent)] hover:underline"
                    >
                      {e.date}
                    </a>
                  </td>
                  <td class={`${td} break-words`}>{e.supplier}</td>
                  <td class={td}>{e.category}</td>
                  <td class={`${td} text-right whitespace-nowrap`}>{money(e.net, currency)}</td>
                  <td class={`${td} text-right whitespace-nowrap`}>{money(e.vat, currency)}</td>
                  <td class={`${td} text-right whitespace-nowrap`}>{money(e.gross, currency)}</td>
                  <td class={td}>
                    {e.receipt && (
                      <button
                        type="button"
                        aria-label={`Open receipt for ${e.supplier}`}
                        class="text-[var(--los-accent)] hover:underline"
                        onClick={() => receipt(e)}
                      >
                        Receipt
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <section
        aria-label="VAT summary"
        class="border border-[var(--los-border)] p-3 min-w-0 space-y-3"
      >
        <h2 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)]">VAT summary</h2>
        <div class="flex flex-wrap items-end gap-3">
          <div>
            <label for="period-kind" class="block text-xs text-[var(--los-fg-dim)] mb-1">
              Period
            </label>
            <select
              id="period-kind"
              class={INPUT}
              value={kind}
              onChange={(e) => {
                const next = (e.target as HTMLSelectElement).value as Kind;
                setKind(next);
                setPeriod(defaultPeriod(year, next, today));
              }}
            >
              {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                <option key={k} value={k}>
                  {KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          {kind !== 'year' && (
            <div>
              <label for="period" class="block text-xs text-[var(--los-fg-dim)] mb-1">
                {KIND_LABEL[kind]}
              </label>
              <select
                id="period"
                class={INPUT}
                value={period}
                onChange={(e) => setPeriod((e.target as HTMLSelectElement).value)}
              >
                {periodsOf(year, kind).map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <VatBlock summary={summary} currency={currency} />
      </section>

      <YearExport target={target} data={data} year={year} />
    </>
  );
}

export function ExpensesPage() {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Expenses">
      {({ repo, data, loadErrors }) => (
        <>
          <ExpensesBody target={repo} data={data} />
          <ProblemsList findings={data.findings} loadErrors={loadErrors} />
        </>
      )}
    </PageShell>
  );
}
