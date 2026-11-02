import { describe, expect, it } from 'vitest';
import {
  clientFieldErrors,
  clientFromForm,
  emptyClientForm,
  emptyProjectForm,
  parseMoney,
  projectFieldErrors,
  projectFromForm,
  withName,
  withSlug,
} from './client-form';

const client = {
  ...withName(emptyClientForm(), 'Müller & Söhne GmbH'),
  street: 'Weg 1',
  postcode: '10115',
  city: 'Berlin',
};
const acme = 'acme-gmbh' as never;

describe('parseMoney', () => {
  it.each([
    ['1200', 120000],
    ['1200.50', 120050],
    ['1.200,50', 120050],
    ['1,200.50', 120050],
    ['1.200', 120000],
    ['12,5', 1250],
    ['0,05', 5],
    [' 1 200,00 ', 120000],
  ])('%s -> %s', (input, minor) => expect(parseMoney(input)).toBe(minor));
  it.each(['x', '', '12,345', '1.2.3', '-5', '1e3', '12,5€', '1,20,0'])('rejects %j', (input) =>
    expect(parseMoney(input)).toBeNull());
});

describe('slug following the name', () => {
  it('follows the name until the slug is edited', () => {
    const a = withName(emptyClientForm(), 'Acme GmbH');
    expect(a.slug).toBe('acme-gmbh');
    const b = withName(withSlug(a, 'acme'), 'Acme AG');
    expect(b.slug).toBe('acme');
  });
  it('leaves the slug empty for a name without letters', () => {
    expect(withName(emptyClientForm(), '!').slug).toBe('');
  });
});

describe('clientFromForm', () => {
  it('builds a client with defaults and no empty optional fields', () => {
    expect(clientFromForm(client)).toEqual({
      ok: true,
      value: {
        slug: 'muller-sohne-gmbh',
        name: 'Müller & Söhne GmbH',
        address: { street: 'Weg 1', postcode: '10115', city: 'Berlin', country: 'DE' },
        contacts: [],
        stage: 'lead',
      },
    });
  });
  it('includes the optional fields that were filled', () => {
    const r = clientFromForm({
      ...client,
      vatId: 'DE1',
      leitwegId: '04011000-1234-12',
      contactName: 'Max',
      email: 'max@x.example',
      phone: '+49 1',
      paymentTermsDays: '30',
      stage: 'active',
    });
    expect(r).toMatchObject({
      ok: true,
      value: {
        vat_id: 'DE1',
        leitweg_id: '04011000-1234-12',
        contacts: [{ name: 'Max', email: 'max@x.example', phone: '+49 1' }],
        payment_terms_days: 30,
        stage: 'active',
      },
    });
  });
  it('reports every field error at once', () => {
    const r = clientFromForm({
      ...emptyClientForm(),
      email: 'nope',
      paymentTermsDays: 'x',
    });
    const e = clientFieldErrors(r);
    expect(Object.keys(e).sort()).toEqual(
      [
        'city',
        'contactName',
        'email',
        'name',
        'paymentTermsDays',
        'postcode',
        'slug',
        'street',
      ].sort(),
    );
    expect(e.email).toContain('email');
  });
  it('refuses a slug that is not valid', () => {
    expect(clientFieldErrors(clientFromForm(withSlug(client, 'Bad Slug'))).slug).toBeDefined();
    expect(clientFieldErrors(clientFromForm({ ...client, slug: '' })).slug).toContain('Enter');
  });
});

describe('projectFromForm', () => {
  const base = withName(emptyProjectForm(), 'Relaunch');
  it('builds a minimal project', () => {
    expect(projectFromForm(base, acme)).toEqual({
      ok: true,
      value: { slug: 'relaunch', client: 'acme-gmbh', name: 'Relaunch', status: 'active' },
    });
  });
  it('converts money and hours to minor units and minutes', () => {
    const r = projectFromForm(
      {
        ...base,
        rateAmount: '90,50',
        ratePer: 'day',
        fixedPrice: '1.200,50',
        budgetHours: '40',
        budgetAmount: '5000',
        retainerAmount: '500',
        retainerInterval: 'quarterly',
        retainerNextDate: '2026-12-01',
        retainerDescription: 'Care',
      },
      acme,
    );
    expect(r).toMatchObject({
      ok: true,
      value: {
        rate: { per: 'day', amount: 9050 },
        fixed_price: 120050,
        budget_minutes: 2400,
        budget_amount: 500000,
        retainer: {
          amount: 50000,
          interval: 'quarterly',
          next_date: '2026-12-01',
          description: 'Care',
        },
      },
    });
  });
  it('reports bad money, hours and an incomplete retainer per field', () => {
    const r = projectFromForm(
      { ...base, rateAmount: 'x', budgetHours: 'y', retainerDescription: 'Care' },
      acme,
    );
    const e = projectFieldErrors(r);
    expect(Object.keys(e).sort()).toEqual(
      ['budgetHours', 'rateAmount', 'retainerAmount', 'retainerNextDate'].sort(),
    );
  });
  it('rejects an impossible next date through the validator', () => {
    const r = projectFromForm(
      { ...base, retainerAmount: '1', retainerNextDate: '2026-13-45', retainerDescription: 'x' },
      acme,
    );
    expect(projectFieldErrors(r).retainerNextDate).toBeDefined();
  });
});
