import { loadBusinessRepo } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import { attentionItems } from './attention';
import { loadFixtureRepo } from './fixture.test-helper';
import { businessDashboard } from './overview';

const money = (minor: number, cur: string) => `${(minor / 100).toFixed(2)} ${cur}`;
const name = (slug: string) => `Name of ${slug}`;
const dashboard = (edit?: (m: Map<string, string>) => void, today = '2026-11-10') => {
  const m = loadFixtureRepo();
  edit?.(m);
  return businessDashboard(loadBusinessRepo(m), today);
};
const TODAY = '2026-11-10';
const DRAFT = '.kh/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27.yaml';

describe('attentionItems', () => {
  it('puts an overdue invoice first, with Record payment', () => {
    const items = attentionItems(
      dashboard((m) => m.delete('.kh/business/payments/2026.jsonl')),
      name,
      money,
      TODAY,
    );
    expect(items[0]).toMatchObject({
      tone: 'warning',
      title: 'RE-2026-0001 from Name of acme-gmbh is overdue',
      action: { label: 'Record payment', href: '/business/payments/new?invoice=RE-2026-0001' },
    });
  });

  it('lists a draft to issue and leaves out that client’s unbilled time', () => {
    const d = dashboard();
    const items = attentionItems(d, name, money, TODAY);
    const draft = items.find((i) => i.key.startsWith('draft:'));
    expect(draft?.action).toEqual({
      label: 'Review and issue',
      href: '/business/drafts/01M5KA3Q00W16BGNTZ49EKRX27',
    });
    for (const { client } of d.drafts) {
      expect(items.some((i) => i.key === `unbilled:${client}`)).toBe(false);
    }
  });

  it('offers to draft an invoice for unbilled time once no draft exists', () => {
    const d = dashboard((m) => m.delete(DRAFT));
    const items = attentionItems(d, name, money, TODAY);
    for (const u of d.unbilled) {
      expect(items.find((i) => i.key === `unbilled:${u.client}`)?.action.href).toBe(
        `/business/drafts/new?client=${u.client}&kind=invoice&from=unbilled`,
      );
    }
  });

  it('is empty when nothing is due', () => {
    const d = dashboard();
    expect(
      attentionItems(
        { ...d, receivables: [], retainersDue: [], contractsDue: [], drafts: [], unbilled: [] },
        name,
        money,
        TODAY,
      ),
    ).toEqual([]);
  });

  it('warns about a retainer whose billing date has passed', () => {
    const d = dashboard();
    const project = { client: 'acme-gmbh', slug: 'hosting', name: 'Hosting' } as never;
    const due = (date: string) =>
      attentionItems(
        { ...d, retainersDue: [{ project, date, hasDraft: false }] },
        name,
        money,
        TODAY,
      ).find((i) => i.key.startsWith('retainer:'))?.tone;
    expect(due('2026-11-01')).toBe('warning');
    expect(due('2026-11-12')).toBe('todo');
  });

  it('links a contract date to the contract and warns on a notice deadline', () => {
    const d = dashboard();
    const items = attentionItems(d, name, money, TODAY).filter((i) =>
      i.key.startsWith('contract:'),
    );
    expect(items).toHaveLength(d.contractsDue.length);
    for (const [i, c] of d.contractsDue.entries()) {
      expect(items[i]?.action.href).toBe(
        `/clients/${c.contract.client}/contracts/${c.contract.id}`,
      );
      expect(items[i]?.tone).toBe(c.what === 'notice' ? 'warning' : 'todo');
    }
  });
});
