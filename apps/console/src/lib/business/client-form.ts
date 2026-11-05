import {
  asSlug,
  CLIENT_STAGES,
  type Client,
  type ClientStage,
  type Project,
  type Result,
  slugifyName,
  validateClient,
  validateProject,
} from '@kaihuman/formats/business';
import { HOURS_HINT, parseHours } from './time-form';

export const MONEY_HINT = 'Use 1200, 1200.50 or 1.200,50. Note that 12.345 reads as 12345.';
const SLUG_MESSAGE = 'Use 2 to 40 lowercase letters, digits or -.';

/**
 * Minor units for a money input, or `null` when it is not one of the accepted shapes.
 * Worked on as text: the amounts are tax records, so no float ever sees them.
 */
export function parseMoney(input: string): number | null {
  const s = input.replace(/\s+/g, '');
  // Thousands groups need a decimal part of the other separator kind (1.200,50 / 1,200.50); a bare
  // `12,345` is refused because it reads as 12.345 in German and 12345 in English.
  const m =
    /^(\d+)(?:[.,](\d{1,2}))?$/.exec(s) ??
    /^(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(s) ??
    /^(\d{1,3}(?:,\d{3})+)\.(\d{1,2})$/.exec(s);
  if (!m) return null;
  const whole = (m[1] ?? '').replace(/[.,]/g, '');
  const cents = (m[2] ?? '').padEnd(2, '0');
  const value = Number(`${whole}${cents}`);
  return Number.isSafeInteger(value) ? value : null;
}

type Issues = { path: string; message: string }[];

/** First message per form field; `fieldOf` maps record paths to form fields. */
function errorsOf<F extends string>(
  result: Result<unknown>,
  fieldOf: Readonly<Record<string, F>>,
): Partial<Record<F, string>> {
  const errors: Partial<Record<F, string>> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const field = fieldOf[issue.path];
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/** An empty optional field is left out of the file. */
const opt = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } =>
  (value === undefined ? {} : { [key]: value }) as { [P in K]?: V };
const text = (value: string) => (value.trim() === '' ? undefined : value.trim());

/** The slug follows the name until the user edits the slug field. */
type SlugState = { name: string; slug: string; slugEdited: boolean };
export const withName = <T extends SlugState>(form: T, name: string): T => ({
  ...form,
  name,
  ...(form.slugEdited ? {} : { slug: slugifyName(name) ?? '' }),
});
export const withSlug = <T extends SlugState>(form: T, slug: string): T => ({
  ...form,
  slug,
  slugEdited: true,
});

const slugIssue = (form: SlugState, issues: Issues) => {
  const slug = asSlug(form.slug.trim());
  // `/clients/new` is the new-client form, so a client of that name could never be opened.
  if (slug === 'new') {
    issues.push({ path: 'slug', message: '"new" is reserved. Choose another slug.' });
    return null;
  }
  if (!slug) {
    issues.push({
      path: 'slug',
      message: form.slug.trim() === '' ? `Enter a slug. ${SLUG_MESSAGE}` : SLUG_MESSAGE,
    });
  }
  return slug;
};

// ---- Client -----------------------------------------------------------------------------------

export type ClientForm = SlugState & {
  street: string;
  postcode: string;
  city: string;
  country: string;
  vatId: string;
  buyerReference: string;
  leitwegId: string;
  contactName: string;
  email: string;
  phone: string;
  paymentTermsDays: string;
  stage: ClientStage;
};

export const emptyClientForm = (): ClientForm => ({
  name: '',
  slug: '',
  slugEdited: false,
  street: '',
  postcode: '',
  city: '',
  country: 'DE',
  vatId: '',
  buyerReference: '',
  leitwegId: '',
  contactName: '',
  email: '',
  phone: '',
  paymentTermsDays: '',
  stage: 'lead',
});

export const isClientStage = (value: string): value is ClientStage =>
  (CLIENT_STAGES as readonly string[]).includes(value);

const EMAIL = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function clientFromForm(form: ClientForm): Result<Client> {
  const issues: Issues = [];
  const slug = slugIssue(form, issues);
  const email = text(form.email);
  if (email && !EMAIL.test(email)) {
    issues.push({ path: 'email', message: 'Enter an email address like name@example.com.' });
  }
  const contactName = text(form.contactName);
  if (!contactName && (email || text(form.phone))) {
    issues.push({ path: 'contactName', message: 'Add the contact name for this email or phone.' });
  }
  const terms = text(form.paymentTermsDays);
  if (terms && !/^\d+$/.test(terms)) {
    issues.push({ path: 'paymentTermsDays', message: 'Use a whole number of days.' });
  }
  const body = {
    name: form.name.trim(),
    address: {
      street: form.street.trim(),
      postcode: form.postcode.trim(),
      city: form.city.trim(),
      country: form.country.trim().toUpperCase(),
    },
    ...opt('vat_id', text(form.vatId)),
    ...opt('buyer_reference', text(form.buyerReference)),
    ...opt('leitweg_id', text(form.leitwegId)),
    ...(contactName
      ? {
          contacts: [
            { name: contactName, ...opt('email', email), ...opt('phone', text(form.phone)) },
          ],
        }
      : {}),
    ...(terms && /^\d+$/.test(terms) ? { payment_terms_days: Number(terms) } : {}),
    stage: form.stage,
  };
  // Validate even with a slug problem, so the user sees every field error at once.
  const checked = validateClient(body, slug ?? 'placeholder');
  if (!checked.ok) issues.push(...checked.issues);
  if (issues.length > 0 || !checked.ok || !slug) return { ok: false, issues };
  return { ok: true, value: { ...checked.value, slug } };
}

const CLIENT_FIELD = {
  slug: 'slug',
  name: 'name',
  'address.street': 'street',
  'address.postcode': 'postcode',
  'address.city': 'city',
  'address.country': 'country',
  vat_id: 'vatId',
  buyer_reference: 'buyerReference',
  leitweg_id: 'leitwegId',
  contactName: 'contactName',
  email: 'email',
  phone: 'phone',
  paymentTermsDays: 'paymentTermsDays',
  payment_terms_days: 'paymentTermsDays',
  stage: 'stage',
} as const satisfies Record<string, keyof ClientForm>;

export const clientFieldErrors = (result: Result<unknown>) =>
  errorsOf<keyof ClientForm>(result, CLIENT_FIELD);

// ---- Project ----------------------------------------------------------------------------------

export type ProjectForm = SlugState & {
  status: Project['status'];
  rateAmount: string;
  ratePer: 'hour' | 'day';
  fixedPrice: string;
  budgetHours: string;
  budgetAmount: string;
  retainerAmount: string;
  retainerInterval: 'monthly' | 'quarterly';
  retainerNextDate: string;
  retainerDescription: string;
};

export const emptyProjectForm = (): ProjectForm => ({
  name: '',
  slug: '',
  slugEdited: false,
  status: 'active',
  rateAmount: '',
  ratePer: 'hour',
  fixedPrice: '',
  budgetHours: '',
  budgetAmount: '',
  retainerAmount: '',
  retainerInterval: 'monthly',
  retainerNextDate: '',
  retainerDescription: '',
});

export function projectFromForm(form: ProjectForm, client: Client['slug']): Result<Project> {
  const issues: Issues = [];
  const slug = slugIssue(form, issues);
  /** `undefined` for an empty field; an invalid one is reported and also left out. */
  const money = (field: keyof ProjectForm, raw: string): number | undefined => {
    if (!text(raw)) return undefined;
    const value = parseMoney(raw);
    if (value === null) issues.push({ path: field, message: `Not an amount. ${MONEY_HINT}` });
    return value ?? undefined;
  };
  const rate = money('rateAmount', form.rateAmount);
  const fixed = money('fixedPrice', form.fixedPrice);
  const budgetAmount = money('budgetAmount', form.budgetAmount);
  const retainerAmount = money('retainerAmount', form.retainerAmount);
  let budgetMinutes: number | undefined;
  if (text(form.budgetHours)) {
    const minutes = parseHours(form.budgetHours);
    if (minutes === null) {
      issues.push({ path: 'budgetHours', message: `Not a duration. ${HOURS_HINT}` });
    } else budgetMinutes = minutes;
  }
  const next = text(form.retainerNextDate);
  const description = text(form.retainerDescription);
  const hasRetainer = retainerAmount !== undefined || next || description;
  if (hasRetainer) {
    if (text(form.retainerAmount) && retainerAmount === undefined) {
      // Already reported as not an amount.
    } else if (retainerAmount === undefined) {
      issues.push({ path: 'retainerAmount', message: 'Enter the retainer amount.' });
    }
    if (!next) issues.push({ path: 'retainerNextDate', message: 'Enter the next billing date.' });
    if (!description) {
      issues.push({ path: 'retainerDescription', message: 'Describe what the retainer covers.' });
    }
  }
  const body = {
    client,
    name: form.name.trim(),
    status: form.status,
    ...(rate !== undefined ? { rate: { per: form.ratePer, amount: rate } } : {}),
    ...opt('fixed_price', fixed),
    ...opt('budget_minutes', budgetMinutes),
    ...opt('budget_amount', budgetAmount),
    ...(hasRetainer && retainerAmount !== undefined && next && description
      ? {
          retainer: {
            amount: retainerAmount,
            interval: form.retainerInterval,
            next_date: next,
            description,
          },
        }
      : {}),
  };
  const checked = validateProject(body, slug ?? 'placeholder', client);
  if (!checked.ok) issues.push(...checked.issues);
  if (issues.length > 0 || !checked.ok || !slug) return { ok: false, issues };
  return { ok: true, value: { ...checked.value, slug } };
}

const PROJECT_FIELD = {
  slug: 'slug',
  name: 'name',
  status: 'status',
  rateAmount: 'rateAmount',
  'rate.amount': 'rateAmount',
  'rate.per': 'ratePer',
  fixedPrice: 'fixedPrice',
  fixed_price: 'fixedPrice',
  budgetHours: 'budgetHours',
  budget_minutes: 'budgetHours',
  budgetAmount: 'budgetAmount',
  budget_amount: 'budgetAmount',
  retainerAmount: 'retainerAmount',
  'retainer.amount': 'retainerAmount',
  'retainer.interval': 'retainerInterval',
  retainerNextDate: 'retainerNextDate',
  'retainer.next_date': 'retainerNextDate',
  retainerDescription: 'retainerDescription',
  'retainer.description': 'retainerDescription',
} as const satisfies Record<string, keyof ProjectForm>;

export const projectFieldErrors = (result: Result<unknown>) =>
  errorsOf<keyof ProjectForm>(result, PROJECT_FIELD);
