import type { Slug } from '@kaihuman/formats/business';
import { PRIMARY } from '../components/business/buttons';
import { Card } from '../components/business/Card';
import { RecordPaymentLink } from '../components/business/DocActions';
import { GettingStarted } from '../components/business/GettingStarted';
import { money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { StatusPill } from '../components/business/StatusPill';
import { todayLocal } from '../lib/business/dates';
import { invoiceRows, offerRows } from '../lib/business/overview';
import { useBusinessRepo } from '../lib/business/use-business-repo';

const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';
const LINK = 'text-[var(--los-accent)] hover:underline';

/** Every draft, invoice and offer across clients. Sharing, PDFs and e-invoices stay on the client page. */
export function InvoicesPage() {
  const state = useBusinessRepo();
  return (
    <PageShell state={state} title="Invoices" section="/business/invoices">
      {({ data, loadErrors }) => {
        if (data.clients.length === 0) return <GettingStarted />;
        const today = todayLocal();
        const invoices = invoiceRows(data, today);
        const offers = offerRows(data, today);
        const names = new Map<Slug, string>(data.clients.map((c) => [c.slug, c.name]));
        const client = (slug: Slug) => (
          <a href={`/clients/${slug}`} class={LINK}>
            {names.get(slug) ?? slug}
          </a>
        );
        const nothing = invoices.length === 0 && offers.length === 0 && data.drafts.length === 0;
        return (
          <>
            <div>
              <a href="/business/drafts/new" class={PRIMARY}>
                New draft
              </a>
            </div>
            {nothing && (
              <p class="text-xs text-[var(--los-fg-dim)] max-w-prose">
                No invoices yet. An invoice starts as a draft: pick a client, add lines or pull in
                unbilled time, then issue it. Issued invoices get a number and can no longer change.
              </p>
            )}
            {data.drafts.length > 0 && (
              <Card title="Drafts">
                <ul class="text-xs space-y-1">
                  {data.drafts.map((draft) => (
                    <li key={draft.id} class="flex flex-wrap justify-between gap-2">
                      <span>
                        {client(draft.client)}: {draft.kind}, {draft.lines.length}{' '}
                        {draft.lines.length === 1 ? 'line' : 'lines'}
                      </span>
                      <a href={`/business/drafts/${draft.id}`} class={LINK}>
                        Review and issue
                      </a>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
            {invoices.length > 0 && (
              <Card title="Invoices">
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr>
                        <th class={th}>Number</th>
                        <th class={th}>Client</th>
                        <th class={th}>Issued</th>
                        <th class={th}>Due</th>
                        <th class={th}>Status</th>
                        <th class={`${th} text-right`}>Total</th>
                        <th class={`${th} text-right`}>Open</th>
                        <th class={th}>
                          <span class="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((r) => (
                        <tr key={r.number}>
                          <td class={td}>
                            {r.number}
                            {r.kind === 'credit-note' && (
                              <span class="text-[var(--los-muted)]"> (credit note)</span>
                            )}
                          </td>
                          <td class={td}>{client(r.client)}</td>
                          <td class={td}>{r.issueDate}</td>
                          <td class={td}>{r.dueDate ?? '-'}</td>
                          <td class={td}>
                            <StatusPill state={r.status.state} />
                          </td>
                          <td class={`${td} text-right whitespace-nowrap`}>
                            {money(r.gross, r.currency)}
                          </td>
                          <td class={`${td} text-right whitespace-nowrap`}>
                            {money(r.status.open, r.currency)}
                          </td>
                          <td class={td}>
                            {r.kind === 'invoice' && r.status.open > 0 && (
                              <RecordPaymentLink invoice={r.number} />
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            {offers.length > 0 && (
              <Card title="Offers">
                <div class="overflow-x-auto">
                  <table class="w-full text-xs">
                    <thead>
                      <tr>
                        <th class={th}>Number</th>
                        <th class={th}>Client</th>
                        <th class={th}>Issued</th>
                        <th class={th}>Valid until</th>
                        <th class={th}>Status</th>
                        <th class={`${th} text-right`}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {offers.map((r) => (
                        <tr key={r.number}>
                          <td class={td}>{r.number}</td>
                          <td class={td}>{client(r.client)}</td>
                          <td class={td}>{r.issueDate}</td>
                          <td class={td}>{r.validUntil}</td>
                          <td class={td}>
                            <StatusPill state={r.status} />
                          </td>
                          <td class={`${td} text-right whitespace-nowrap`}>
                            {money(r.gross, r.currency)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
            <ProblemsList findings={data.findings} loadErrors={loadErrors} />
          </>
        );
      }}
    </PageShell>
  );
}
