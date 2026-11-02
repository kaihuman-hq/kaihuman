import { CLIENT_STAGES } from '@kaihuman/formats/business';
import { Card } from '../components/business/Card';
import { RecordPaymentLink } from '../components/business/DocActions';
import { hours, money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { Stat } from '../components/business/Stat';
import { StatusPill } from '../components/business/StatusPill';
import { TimerCard } from '../components/business/TimerCard';
import { todayLocal } from '../lib/business/dates';
import { businessDashboard, hoursSummary } from '../lib/business/overview';
import { useBusinessRepo } from '../lib/business/use-business-repo';

const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';
const clientLink = (slug: string, text = slug) => (
  <a href={`/clients/${slug}`} class="text-[var(--los-accent)] hover:underline">
    {text}
  </a>
);

export function BusinessPage() {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Business">
      {({ data, loadErrors }) => {
        const d = businessDashboard(data, todayLocal());
        const cur = d.currency;
        const h = hoursSummary(data, todayLocal());
        return (
          <>
            <dl class="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <Stat label="Open" value={money(d.openTotal, cur)} />
              <Stat
                label="Overdue"
                value={money(d.overdueTotal, cur)}
                tone={d.overdueTotal > 0 ? 'warning' : undefined}
              />
              <Stat label={`VAT ${d.vat.month.period}`} value={money(d.vat.month.due, cur)} />
              <Stat label={`VAT ${d.vat.quarter.period}`} value={money(d.vat.quarter.due, cur)} />
              <Stat label="Hours today" value={`${hours(h.todayMinutes)} h`} />
              <Stat label="Hours this week" value={`${hours(h.weekMinutes)} h`} />
            </dl>

            <TimerCard />

            <Card
              title="Who owes me"
              empty={d.receivables.length === 0 ? 'Nothing outstanding.' : undefined}
            >
              <div class="overflow-x-auto">
                <table class="w-full text-xs">
                  <thead>
                    <tr>
                      <th class={th}>Client</th>
                      <th class={th}>Number</th>
                      <th class={th}>Due</th>
                      <th class={th}>Status</th>
                      <th class={`${th} text-right`}>Open</th>
                      <th class={th}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.receivables.map((r) => (
                      <tr key={r.number}>
                        <td class={td}>{clientLink(r.client)}</td>
                        <td class={td}>{r.number}</td>
                        <td class={td}>{r.dueDate ?? '-'}</td>
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

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Card
                title="Unbilled time"
                empty={d.unbilled.length === 0 ? 'No unbilled time.' : undefined}
              >
                <ul class="text-xs space-y-1">
                  {d.unbilled.map((u) => (
                    <li key={u.client} class="flex justify-between gap-2">
                      {clientLink(u.client)}
                      <span>{hours(u.minutes)} h</span>
                    </li>
                  ))}
                </ul>
              </Card>

              <Card
                title="Contracts due"
                empty={
                  d.contractsDue.length === 0 ? 'No contract dates in the next 60 days.' : undefined
                }
              >
                <ul class="text-xs space-y-1">
                  {d.contractsDue.map((c) => (
                    <li key={`${c.contract.id}:${c.what}`} class="flex justify-between gap-2">
                      <span class="min-w-0 break-words">
                        {c.contract.title} ({c.what}), {clientLink(c.contract.client)}
                      </span>
                      <span class="shrink-0">{c.date}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            </div>

            <Card
              title="Drafts"
              empty={d.drafts.length === 0 ? 'No drafts waiting to be issued.' : undefined}
            >
              <ul class="text-xs space-y-1">
                {d.drafts.map((draft) => (
                  <li key={draft.id}>
                    {clientLink(draft.client)}:{' '}
                    <a
                      href={`/business/drafts/${draft.id}`}
                      class="text-[var(--los-accent)] hover:underline"
                    >
                      {draft.kind}, {draft.lines.length}{' '}
                      {draft.lines.length === 1 ? 'line' : 'lines'}
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
            <p class="text-xs">
              <a href="/business/expenses" class="text-[var(--los-accent)] hover:underline">
                Expenses
              </a>
            </p>
            <p class="text-xs">
              <a href="/business/shared" class="text-[var(--los-accent)] hover:underline">
                Shared files
              </a>
            </p>
            <p class="text-xs">
              <a href="/business/drafts/new" class="text-[var(--los-accent)] hover:underline">
                New draft
              </a>
            </p>

            <Card title="Pipeline">
              <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                {CLIENT_STAGES.map((stage) => (
                  <div key={stage} class="min-w-0">
                    <h3 class="text-[10px] uppercase tracking-widest text-[var(--los-muted)] mb-1">
                      {stage}
                    </h3>
                    {d.pipeline[stage].length === 0 ? (
                      <p class="text-xs italic text-[var(--los-muted)]">None</p>
                    ) : (
                      <ul class="text-xs space-y-1">
                        {d.pipeline[stage].map((c) => (
                          <li key={c.slug} class="break-words">
                            {clientLink(c.slug, c.name)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </div>
            </Card>

            <ProblemsList findings={data.findings} loadErrors={loadErrors} />
          </>
        );
      }}
    </PageShell>
  );
}
