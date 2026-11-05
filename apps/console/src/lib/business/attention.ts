import type { Slug } from '@kaihuman/formats/business';
import type { Dashboard } from './overview.js';

/** One thing on the dashboard that wants the user to act, with the action that resolves it. */
export type AttentionItem = {
  key: string;
  /** `warning` is money or a deadline already missed; `todo` is the next routine step. */
  tone: 'warning' | 'todo';
  title: string;
  detail: string;
  action: { label: string; href: string };
};

const CONTRACT_TITLE = {
  renewal: 'Renewal due',
  notice: 'Notice deadline',
  end: 'Contract ends',
} as const;

const hoursText = (minutes: number): string => `${(minutes / 60).toFixed(1)} h`;

/**
 * The dashboard's "needs attention" list, most urgent first: overdue invoices, retainers due,
 * contract dates, drafts to issue, then unbilled time. Unbilled time of a client that already
 * has a draft is left out: the draft is the next step there.
 */
export const attentionItems = (
  d: Dashboard,
  nameOf: (slug: Slug) => string,
  money: (minor: number, currency: string) => string,
  today: string,
): AttentionItem[] => {
  const items: AttentionItem[] = [];
  for (const r of d.receivables) {
    if (r.status.state !== 'overdue') continue;
    items.push({
      key: `overdue:${r.number}`,
      tone: 'warning',
      title: `${r.number} from ${nameOf(r.client)} is overdue`,
      detail: `${money(r.status.open, r.currency)} open${r.dueDate ? `, due ${r.dueDate}` : ''}`,
      action: { label: 'Record payment', href: `/business/payments/new?invoice=${r.number}` },
    });
  }
  for (const { project, date, draftId } of d.retainersDue) {
    items.push({
      key: `retainer:${project.client}/${project.slug}`,
      tone: date < today ? 'warning' : 'todo',
      title: `Retainer ${project.name} for ${nameOf(project.client)}`,
      detail: `Bill by ${date}`,
      action: draftId
        ? { label: 'Review draft', href: `/business/drafts/${draftId}` }
        : {
            label: 'Create draft',
            href: `/business/drafts/new?client=${project.client}&kind=invoice&from=retainer&project=${project.slug}`,
          },
    });
  }
  for (const c of d.contractsDue) {
    items.push({
      key: `contract:${c.contract.id}:${c.what}`,
      tone: c.what === 'notice' ? 'warning' : 'todo',
      title: `${CONTRACT_TITLE[c.what]}: ${c.contract.title}`,
      detail: `${nameOf(c.contract.client)}, ${c.date}`,
      action: {
        label: 'Open contract',
        href: `/clients/${c.contract.client}/contracts/${c.contract.id}`,
      },
    });
  }
  const drafted = new Set<Slug>();
  for (const draft of d.drafts) {
    drafted.add(draft.client);
    const lines = draft.lines.length;
    items.push({
      key: `draft:${draft.id}`,
      tone: 'todo',
      title: `Draft ${draft.kind} for ${nameOf(draft.client)}`,
      detail: `${lines} ${lines === 1 ? 'line' : 'lines'}, not issued yet`,
      action: { label: 'Review and issue', href: `/business/drafts/${draft.id}` },
    });
  }
  for (const u of d.unbilled) {
    if (drafted.has(u.client)) continue;
    items.push({
      key: `unbilled:${u.client}`,
      tone: 'todo',
      title: `${hoursText(u.minutes)} unbilled for ${nameOf(u.client)}`,
      detail: 'Tracked time that is not on an invoice yet',
      action: {
        label: 'Draft invoice',
        href: `/business/drafts/new?client=${u.client}&kind=invoice&from=unbilled`,
      },
    });
  }
  return items;
};
