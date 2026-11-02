import { parseActionLog, parseTodos } from '@kaihuman/formats';
import {
  BUSINESS_ROOT,
  contractDates,
  contractFilePath,
  type LinkRecord,
} from '@kaihuman/formats/business';
import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { Card } from '../components/business/Card';
import {
  CreditNoteAction,
  OfferActions,
  RecordPaymentLink,
} from '../components/business/DocActions';
import { hours, money } from '../components/business/money';
import { PageShell } from '../components/business/PageShell';
import { ProblemsList } from '../components/business/ProblemsList';
import { QuickAdd } from '../components/business/QuickAdd';
import { ShareActions } from '../components/business/ShareActions';
import { Stat } from '../components/business/Stat';
import { StatusPill } from '../components/business/StatusPill';
import { TimerCard } from '../components/business/TimerCard';
import { clientBacklinks } from '../lib/business/backlinks';
import { addDays, isoWeek, todayLocal } from '../lib/business/dates';
import { BUSINESS_PROFILE_PATH, parseLoadError } from '../lib/business/load';
import {
  type ClientOverview,
  CONTRACT_WHAT,
  clientOverview,
  latestLink,
} from '../lib/business/overview';
import { openAttachment } from '../lib/business/receipt';
import { useBacklinkContents, useBusinessRepo } from '../lib/business/use-business-repo';
import type { KBRepo } from '../lib/github-kb';

const TIMELINE_SHOWN = 20;
const WEEKS_SHOWN = 8;
const th =
  'text-left text-[10px] uppercase tracking-widest text-[var(--los-muted)] font-normal py-1 pr-3';
const td = 'py-1 pr-3 align-top';
const link = 'text-[var(--los-accent)] hover:underline';

const Table = (props: { head: string[]; children: ComponentChildren }) => (
  <div class="overflow-x-auto">
    <table class="w-full text-xs">
      <thead>
        <tr>
          {props.head.map((h) => (
            <th key={h} class={th}>
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>{props.children}</tbody>
    </table>
  </div>
);

const Pdf = ({ present }: { present: boolean }) =>
  present ? <span>PDF</span> : <span class="text-[var(--los-warning)]">PDF missing</span>;

const budgetText = (p: ClientOverview['projects'][number], currency: string): string => {
  const { project, minutesUsed, amountBilled } = p;
  if (project.budget_minutes !== undefined) {
    return `${hours(minutesUsed)} of ${hours(project.budget_minutes)} h`;
  }
  if (project.budget_amount !== undefined) {
    return `${money(amountBilled, currency)} of ${money(project.budget_amount, currency)}`;
  }
  return `${hours(minutesUsed)} h`;
};

const Timeline = ({ items }: { items: ClientOverview['timeline'] }) => {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, TIMELINE_SHOWN);
  return (
    <Card title="Timeline" empty={items.length === 0 ? 'Nothing has happened yet.' : undefined}>
      <ul class="space-y-1 text-xs" data-testid="timeline">
        {shown.map((item, i) => (
          // The same document can appear several times on one day.
          <li key={i} class="flex gap-3">
            <span class="text-[var(--los-muted)] whitespace-nowrap">{item.date}</span>
            <span class="min-w-0 break-words">{item.title}</span>
          </li>
        ))}
      </ul>
      {!all && items.length > TIMELINE_SHOWN && (
        <button type="button" class={`mt-2 text-xs ${link}`} onClick={() => setAll(true)}>
          Show all ({items.length})
        </button>
      )}
    </Card>
  );
};

function Overview(props: {
  target: KBRepo;
  o: ClientOverview;
  today: string;
  contents: Record<string, string>;
  backlinks: string[] | null;
  /** Unbilled time that is in no draft yet. */
  canDraftUnbilled: boolean;
  /** Offers that already have an issued invoice; converting them again would bill twice. */
  invoicedOffers: ReadonlySet<string>;
  /** Issued yaml path by document number. */
  issuedPaths: ReadonlyMap<string, string>;
  links: readonly LinkRecord[];
}) {
  const { target, o, today, contents, backlinks, invoicedOffers, issuedPaths, links } = props;
  const [fileError, setFileError] = useState<string | null>(null);
  const activeLink = (row: { number: string; link: ClientOverview['invoices'][number]['link'] }) =>
    row.link === 'active' ? latestLink(links, row.number) : null;
  const expiredLink = (row: {
    number: string;
    link: ClientOverview['invoices'][number]['link'];
  }) => (row.link === 'expired' ? latestLink(links, row.number) : null);
  const { client, summary: s } = o;
  const currency = s.currency;
  const contact = client.contacts[0];
  const minWeek = isoWeek(addDays(today, -7 * (WEEKS_SHOWN - 1)));
  const weeks = o.timeByWeek.filter((w) => w.week >= minWeek);
  const todos = o.files.todos ? parseTodos(contents[o.files.todos] ?? '').items : [];
  const log = o.files.log ? parseActionLog(contents[o.files.log] ?? '').entries : [];
  const notes = o.files.notes ? contents[o.files.notes] : undefined;

  return (
    <>
      <header class="space-y-2">
        <div class="flex flex-wrap items-baseline gap-3">
          <h2 class="text-base font-bold break-words">{client.name}</h2>
          <span class="text-xs uppercase tracking-widest text-[var(--los-muted)]">
            {client.stage}
          </span>
        </div>
        {contact && (
          <p class="text-xs break-words">
            {contact.name}
            {contact.email && (
              <>
                {' '}
                <a class={link} href={`mailto:${contact.email}`}>
                  {contact.email}
                </a>
              </>
            )}
            {contact.phone && (
              <>
                {' '}
                <a class={link} href={`tel:${contact.phone.replace(/[^\d+]/g, '')}`}>
                  {contact.phone}
                </a>
              </>
            )}
          </p>
        )}
        <dl class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Billed this year" value={money(s.billedThisYear, currency)} />
          <Stat
            label="Open"
            value={money(s.open, currency)}
            {...(s.open > 0 ? { tone: 'warning' as const } : {})}
          />
          <Stat label="Unbilled hours" value={`${hours(s.unbilledMinutes)} h`} />
          <Stat label="Hours this month" value={`${hours(s.minutesThisMonth)} h`} />
        </dl>
        <p class="text-xs">
          <a href={`/business/time/new?client=${client.slug}`} class={link}>
            Log time
          </a>
          {props.canDraftUnbilled && (
            <>
              {' · '}
              <a
                href={`/business/drafts/new?client=${client.slug}&kind=invoice&from=unbilled`}
                class={link}
              >
                New invoice from unbilled time
              </a>
            </>
          )}
          {' · '}
          <a href={`/business/drafts/new?client=${client.slug}&kind=offer`} class={link}>
            New offer
          </a>
        </p>
      </header>

      <TimerCard client={client.slug} />

      <Timeline items={o.timeline} />

      <Card title="Offers" empty={o.offers.length === 0 ? 'No offers.' : undefined}>
        <Table head={['Number', 'Date', 'Status', 'Amount', 'PDF', 'Link', 'Actions']}>
          {o.offers.map((r) => (
            <tr key={r.number}>
              <td class={td}>{r.number}</td>
              <td class={`${td} whitespace-nowrap`}>{r.issueDate}</td>
              <td class={td}>
                <StatusPill state={r.status} />
              </td>
              <td class={`${td} whitespace-nowrap`}>{money(r.gross, r.currency)}</td>
              <td class={td}>
                <Pdf present={r.pdf} />
              </td>
              <td class={td}>{r.link ?? 'no link'}</td>
              <td class={td}>
                {/* Accepted offers can still be converted; declined and replaced ones are history. Expired ones can be accepted late. */}
                {['issued', 'sent', 'expired'].includes(r.status) && (
                  <OfferActions offer={r.number} canConvert={!invoicedOffers.has(r.number)} />
                )}
                {r.status === 'accepted' && !invoicedOffers.has(r.number) && (
                  <OfferActions offer={r.number} decided />
                )}
                <ShareActions
                  doc={{
                    number: r.number,
                    path: issuedPaths.get(r.number) ?? '',
                    pdf: r.pdf && issuedPaths.has(r.number),
                    // A past valid_until would make the link dead on arrival.
                    ...(r.validUntil >= today ? { expires: r.validUntil } : {}),
                  }}
                  link={activeLink(r)}
                  expired={expiredLink(r)}
                />
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Invoices" empty={o.invoices.length === 0 ? 'No invoices.' : undefined}>
        <Table head={['Number', 'Date', 'Status', 'Amount', 'PDF', 'Link', 'Actions']}>
          {o.invoices.map((r) => (
            <tr key={r.number}>
              <td class={td}>{r.number}</td>
              <td class={`${td} whitespace-nowrap`}>{r.issueDate}</td>
              <td class={td}>
                <StatusPill state={r.status.state} />
              </td>
              <td class={`${td} whitespace-nowrap`}>
                {money(r.kind === 'credit-note' ? -r.gross : r.gross, r.currency)}
              </td>
              <td class={td}>
                <Pdf present={r.pdf} />
              </td>
              <td class={td}>{r.link ?? 'no link'}</td>
              <td class={td}>
                <div class="flex flex-wrap items-center gap-2">
                  {r.kind === 'invoice' && r.status.open > 0 && (
                    <RecordPaymentLink invoice={r.number} />
                  )}
                  {r.kind === 'invoice' && r.status.state !== 'credited' && (
                    <CreditNoteAction invoice={r.number} />
                  )}
                  <ShareActions
                    doc={{
                      number: r.number,
                      path: issuedPaths.get(r.number) ?? '',
                      pdf: r.pdf && issuedPaths.has(r.number),
                    }}
                    link={activeLink(r)}
                    expired={expiredLink(r)}
                  />
                </div>
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Projects" empty={o.projects.length === 0 ? 'No projects.' : undefined}>
        <Table head={['Project', 'Status', 'Budget used', 'Retainer']}>
          {o.projects.map((p) => (
            <tr key={p.project.slug}>
              <td class={td}>{p.project.name}</td>
              <td class={td}>{p.project.status}</td>
              <td class={`${td} whitespace-nowrap`}>{budgetText(p, currency)}</td>
              <td class={td}>
                {p.project.retainer
                  ? `${money(p.project.retainer.amount, currency)} ${p.project.retainer.interval}, next ${p.project.retainer.next_date}`
                  : '-'}
                {p.project.retainer && (
                  <>
                    {' '}
                    <a
                      href={`/business/drafts/new?client=${client.slug}&kind=invoice&from=retainer&project=${p.project.slug}`}
                      class={link}
                    >
                      Invoice retainer
                    </a>
                  </>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <p class="text-xs">
        <a href={`/clients/${client.slug}/projects/new`} class={link}>
          New project
        </a>
      </p>

      <Card
        title="Time by week and project"
        empty={weeks.length === 0 ? 'No time logged in the last 8 weeks.' : undefined}
      >
        <Table head={['Week', 'Project', 'Hours']}>
          {weeks.map((w) => (
            <tr key={`${w.week}:${w.project ?? ''}`}>
              <td class={td}>{w.week}</td>
              <td class={td}>{w.project ?? '-'}</td>
              <td class={td}>{hours(w.minutes)} h</td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Todos">
        {todos.length === 0 && <p class="text-xs italic text-[var(--los-muted)]">No todos.</p>}
        <ul class="space-y-1 text-xs">
          {todos.map((t) => (
            <li key={t.id} class="flex gap-2">
              <input
                type="checkbox"
                disabled
                checked={t.status === 'done'}
                aria-label={`${t.text} (${t.status})`}
              />
              <span class="break-words">{t.text}</span>
            </li>
          ))}
        </ul>
        <QuickAdd client={client.slug} kind="todo" />
      </Card>

      <Card title="Action log">
        {log.length === 0 && <p class="text-xs italic text-[var(--los-muted)]">No log entries.</p>}
        <ul class="space-y-1 text-xs">
          {log.map((e, i) => (
            <li key={`${i}:${e.timestamp}:${e.description}`} class="flex gap-3">
              <span class="text-[var(--los-muted)] whitespace-nowrap">
                {e.timestamp.slice(0, 16).replace('T', ' ')}
              </span>
              <span class="min-w-0 break-words">{e.description}</span>
            </li>
          ))}
        </ul>
        <QuickAdd client={client.slug} kind="log" />
      </Card>

      <Card title="Contracts" empty={o.contracts.length === 0 ? 'No contracts.' : undefined}>
        <Table
          head={['Title', 'Kind', 'Start', 'End', 'Notice', 'Next reminder', 'File', 'Actions']}
        >
          {o.contracts.map((c) => {
            const next = contractDates(c)
              .filter((d) => d.date >= today)
              .sort((a, b) => a.date.localeCompare(b.date))[0];
            return (
              <tr key={c.id}>
                <td class={td}>{c.title}</td>
                <td class={td}>{c.kind}</td>
                <td class={`${td} whitespace-nowrap`}>{c.start}</td>
                <td class={`${td} whitespace-nowrap`}>{c.end ?? '-'}</td>
                <td class={td}>
                  {c.notice_period_days !== undefined ? `${c.notice_period_days} days` : '-'}
                </td>
                <td class={`${td} whitespace-nowrap`} data-testid="contract-next">
                  {next ? `${next.date} (${CONTRACT_WHAT[next.what]})` : '-'}
                </td>
                <td class={td}>
                  {c.file ? (
                    <button
                      type="button"
                      class={link}
                      onClick={() => {
                        setFileError(null);
                        const file = c.file;
                        if (!file) return;
                        openAttachment(target, {
                          path: contractFilePath(c.client, c.id),
                          name: file,
                        }).catch((e) =>
                          setFileError(
                            `Could not open the contract: ${e instanceof Error ? e.message : String(e)}`,
                          ),
                        );
                      }}
                    >
                      Open PDF
                    </button>
                  ) : (
                    '-'
                  )}
                </td>
                <td class={td}>
                  <a href={`/clients/${client.slug}/contracts/${c.id}`} class={link}>
                    Edit
                  </a>
                </td>
              </tr>
            );
          })}
        </Table>
      </Card>
      {fileError && (
        <p role="alert" class="text-xs text-[var(--los-warning)]">
          {fileError}
        </p>
      )}
      <p class="text-xs">
        <a href={`/clients/${client.slug}/contracts/new`} class={link}>
          Add contract
        </a>
      </p>

      <Card title="Notes" empty={!notes?.trim() ? 'No notes.' : undefined}>
        <div class="text-xs whitespace-pre-wrap break-words">{notes}</div>
      </Card>

      <Card
        title="Linked from"
        empty={
          backlinks === null
            ? 'Looking for links…'
            : backlinks.length === 0
              ? 'No wiki or idea page links here.'
              : undefined
        }
      >
        <ul class="space-y-1 text-xs">
          {(backlinks ?? []).map((path) => (
            <li key={path} class="break-words">
              {/* The wiki keeps its open file in component state, so it cannot be deep-linked. */}
              <a href="/wiki" class={link} title="Open the wiki and choose this page">
                {path}
              </a>
            </li>
          ))}
        </ul>
      </Card>
    </>
  );
}

export function ClientPage({ slug }: { slug?: string }) {
  const state = useBusinessRepo();
  const known = state.status === 'ready' && state.data.clients.some((c) => c.slug === slug);
  const backlinkContents = useBacklinkContents(known);
  const today = todayLocal();
  return (
    <PageShell state={state} title="Client">
      {({ repo, data, contents, loadErrors }) => {
        const log = data.clientFiles.find((f) => f.client === slug && f.kind === 'log');
        const o = slug
          ? clientOverview(data, slug, today, log ? contents[log.path] : undefined)
          : null;
        if (!o) {
          return (
            <p class="text-xs">
              No client <code>{slug}</code>.{' '}
              <a href="/clients" class={link}>
                Back to clients
              </a>
            </p>
          );
        }
        const dir = `${BUSINESS_ROOT}/clients/${o.client.slug}/`;
        const mine = (file: string) => file === BUSINESS_PROFILE_PATH || file.startsWith(dir);
        const drafted = new Set(data.drafts.flatMap((d) => d.time_entries ?? []));
        const canDraftUnbilled = data.time.some(
          (t) => t.client === slug && t.invoice === undefined && !drafted.has(t.id),
        );
        const invoicedOffers = new Set(
          data.issued.flatMap((i) => (i.doc.from_offer ? [i.doc.from_offer] : [])),
        );
        return (
          <>
            <a href="/clients" class={`text-xs ${link}`}>
              All clients
            </a>
            <Overview
              target={repo}
              canDraftUnbilled={canDraftUnbilled}
              invoicedOffers={invoicedOffers}
              issuedPaths={new Map(data.issued.map((i) => [i.doc.number, i.path]))}
              links={data.links}
              o={o}
              today={today}
              contents={contents}
              backlinks={backlinkContents && clientBacklinks(o.client.slug, backlinkContents)}
            />
            <ProblemsList
              findings={data.findings.filter((f) => mine(f.file))}
              loadErrors={loadErrors.filter((e) => mine(parseLoadError(e).path))}
            />
          </>
        );
      }}
    </PageShell>
  );
}
