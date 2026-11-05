import { CLIENT_STAGES, type Slug } from '@kaihuman/formats/business';
import { PRIMARY, SECONDARY } from '../components/business/buttons';
import { Card } from '../components/business/Card';
import { RecordPaymentLink } from '../components/business/DocActions';
import { GettingStarted } from '../components/business/GettingStarted';
import { hours, money, STAGE_LABEL } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { Stat } from '../components/business/Stat';
import { StatusPill } from '../components/business/StatusPill';
import { TimerCard } from '../components/business/TimerCard';
import { type AttentionItem, attentionItems } from '../lib/business/attention';
import { todayLocal } from '../lib/business/dates';
import { businessDashboard, hoursSummary, type VatStat } from '../lib/business/overview';
import { useBusinessRepo } from '../lib/business/use-business-repo';

const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';
const LINK = 'text-[var(--los-accent)] hover:underline';
const ROW_ACTION =
  'shrink-0 inline-block px-2 py-1 text-xs rounded border border-[var(--los-accent)] text-[var(--los-accent)] hover:bg-[var(--los-accent)] hover:text-black';

const BASIS = {
  accrual: { label: 'Soll', hint: 'Soll: VAT is owed once you invoice, paid or not.' },
  cash: { label: 'Ist', hint: 'Ist: VAT is owed once the client pays.' },
} as const;

/** Month and quarter VAT; a negative payable is a refund. One note replaces both for the small-business regime. */
function VatStats({
  month,
  quarter,
  currency,
}: {
  month: VatStat;
  quarter: VatStat;
  currency: string;
}) {
  if (!month.applicable || !quarter.applicable) {
    return (
      <Stat
        label="VAT"
        value="No VAT: small-business regime (§19 UStG)."
        hint="You charge no VAT and file no VAT returns."
      />
    );
  }
  return (
    <>
      {[month, quarter].map((v, i) =>
        v.applicable ? (
          <Stat
            key={v.period}
            label={`${v.payable < 0 ? 'VAT refund' : 'VAT payable'} ${v.period} (${BASIS[v.basis].label})`}
            value={money(Math.abs(v.payable), currency)}
            hint={i === 0 ? BASIS[v.basis].hint : undefined}
          />
        ) : null,
      )}
    </>
  );
}

function Attention({ items }: { items: AttentionItem[] }) {
  return (
    <section aria-labelledby="attention" class="border border-[var(--los-border)] p-3 min-w-0">
      <h2
        id="attention"
        class={`text-sm font-bold mb-1 ${items.length > 0 ? 'text-[var(--los-warning)]' : ''}`}
      >
        Needs attention{items.length > 0 ? ` (${items.length})` : ''}
      </h2>
      {items.length === 0 ? (
        <p class="text-xs text-[var(--los-success)]">
          All caught up. Nothing is overdue, due soon or waiting to be billed.
        </p>
      ) : (
        <ul class="divide-y divide-[var(--los-border)]">
          {items.map((item) => (
            <li
              key={item.key}
              class="flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 py-2"
            >
              <span class="min-w-0">
                <span
                  class={`block text-xs font-bold break-words ${
                    item.tone === 'warning' ? 'text-[var(--los-warning)]' : ''
                  }`}
                >
                  {item.title}
                </span>
                <span class="block text-xs text-[var(--los-fg-dim)]">{item.detail}</span>
              </span>
              <a href={item.action.href} class={ROW_ACTION}>
                {item.action.label}
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function BusinessPage() {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Business" section="/business">
      {({ data, loadErrors }) => {
        if (data.clients.length === 0) {
          return (
            <>
              <GettingStarted />
              <ProblemsList findings={data.findings} loadErrors={loadErrors} />
            </>
          );
        }
        const today = todayLocal();
        const d = businessDashboard(data, today);
        const cur = d.currency;
        const h = hoursSummary(data, today);
        const names = new Map<Slug, string>(data.clients.map((c) => [c.slug, c.name]));
        const nameOf = (slug: Slug) => names.get(slug) ?? slug;
        const clientLink = (slug: Slug) => (
          <a href={`/clients/${slug}`} class={LINK}>
            {nameOf(slug)}
          </a>
        );
        const stages = CLIENT_STAGES.filter((s) => d.pipeline[s].length > 0);
        return (
          <>
            <div class="flex flex-wrap gap-2">
              <a href="/business/time/new" class={PRIMARY}>
                Log time
              </a>
              <a href="/business/drafts/new" class={SECONDARY}>
                New draft
              </a>
              <a href="/clients/new" class={SECONDARY}>
                New client
              </a>
              <a href="/business/expenses/new" class={SECONDARY}>
                Add expense
              </a>
            </div>

            <Attention items={attentionItems(d, nameOf, money, today)} />

            <TimerCard />

            <section aria-labelledby="glance" class="space-y-2">
              <h2 id="glance" class="text-[10px] uppercase tracking-widest text-[var(--los-muted)]">
                At a glance
              </h2>
              <dl class="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Stat
                  label="Open"
                  value={money(d.openTotal, cur)}
                  hint="Issued invoices not paid yet."
                />
                <Stat
                  label="Overdue"
                  value={money(d.overdueTotal, cur)}
                  tone={d.overdueTotal > 0 ? 'warning' : undefined}
                  hint="Open and past the due date."
                />
                <VatStats month={d.vat.month} quarter={d.vat.quarter} currency={cur} />
                <Stat label="Hours today" value={`${hours(h.todayMinutes)} h`} />
                <Stat label="Hours this week" value={`${hours(h.weekMinutes)} h`} />
              </dl>
            </section>

            {d.receivables.length > 0 && (
              <Card title="Who owes me">
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr>
                        <th class={th}>Client</th>
                        <th class={th}>Number</th>
                        <th class={th}>Due</th>
                        <th class={th}>Status</th>
                        <th class={`${th} text-right`}>Open</th>
                        <th class={th}>
                          <span class="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.receivables.map((r) => (
                        <tr key={r.number}>
                          <td class={td}>{clientLink(r.client)}</td>
                          <td class={`${td} whitespace-nowrap`}>{r.number}</td>
                          <td class={`${td} whitespace-nowrap`}>{r.dueDate ?? '-'}</td>
                          <td class={td}>
                            <StatusPill state={r.status.state} />
                          </td>
                          <td class={`${td} text-right whitespace-nowrap`}>
                            {money(r.status.open, r.currency)}
                          </td>
                          <td class={td}>
                            {r.kind === 'invoice' && <RecordPaymentLink invoice={r.number} />}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}

            <Card title="Pipeline">
              <ul class="flex flex-wrap gap-x-6 gap-y-3 text-xs">
                {stages.map((stage) => (
                  <li key={stage} class="min-w-0">
                    <span class="block text-[10px] uppercase tracking-widest text-[var(--los-muted)]">
                      {STAGE_LABEL[stage]} ({d.pipeline[stage].length})
                    </span>
                    <span class="break-words">
                      {d.pipeline[stage].map((c, i) => (
                        <span key={c.slug}>
                          {i > 0 && ', '}
                          {clientLink(c.slug)}
                        </span>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
              <p class="text-xs mt-3">
                <a href="/business/pipeline" class={LINK}>
                  Open board
                </a>
              </p>
            </Card>

            <ProblemsList findings={data.findings} loadErrors={loadErrors} />
          </>
        );
      }}
    </PageShell>
  );
}
