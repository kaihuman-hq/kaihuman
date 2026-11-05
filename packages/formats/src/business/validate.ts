import { isValidPattern } from './numbering.js';
import { CONTRACT_EXTENSIONS, RECEIPT_EXTENSIONS } from './paths.js';
import {
  ADDRESS_KEYS,
  type Address,
  type BusinessProfile,
  CLIENT_STAGES,
  type Client,
  type Contract,
  DOC_KINDS,
  type DocEvent,
  type DocKind,
  type Draft,
  EVENT_TYPES,
  type Expense,
  type Issued,
  KEY_ORDER,
  LINE_KEYS,
  type Line,
  type LinkRecord,
  PARTY_KEYS,
  type Party,
  type Payment,
  type Project,
  type RunningTimer,
  type TimeEntry,
  type Totals,
  VAT_CATEGORIES,
} from './records.js';
import {
  arr,
  date,
  decimalStr,
  type Issue,
  int,
  obj,
  oneOf,
  optStr,
  type Result,
  slug,
  str,
  ulidField,
} from './validate-kit.js';

type Reader<T> = (raw: unknown, path: string, issues: Issue[]) => T | undefined;
type Rec = Record<string, unknown>;

const at = (base: string, key: string): string => (base ? `${base}.${key}` : key);

/** Required key: absent counts as invalid. */
const req = <T>(r: Rec, base: string, key: string, issues: Issue[], read: Reader<T>) =>
  read(r[key], at(base, key), issues);

/** Optional key: absent or null is fine; anything else must read. */
const opt = <T>(r: Rec, base: string, key: string, issues: Issue[], read: Reader<T>) =>
  r[key] === undefined || r[key] === null ? undefined : read(r[key], at(base, key), issues);

const note = (issues: Issue[], path: string, message: string): void => {
  issues.push({ path, message: `${path}: ${message}` });
};

const finish = <T>(issues: Issue[], value: unknown): Result<T> =>
  issues.length > 0 ? { ok: false, issues } : { ok: true, value: value as T };

/** Drops keys whose value could not be read, so the cast in `finish` only matters when `issues` is empty. */
const compact = (r: Rec): Rec =>
  Object.fromEntries(Object.entries(r).filter(([, v]) => v !== undefined));

const nonNegInt: Reader<number> = (raw, path, issues) => {
  const n = int(raw, path, issues);
  if (n !== undefined && n < 0) note(issues, path, 'must not be negative');
  return n;
};

const posInt: Reader<number> = (raw, path, issues) => {
  const n = int(raw, path, issues);
  if (n !== undefined && n < 1) note(issues, path, 'must be at least 1');
  return n;
};

const CURRENCY = /^[A-Z]{3}$/;
const currency: Reader<string> = (raw, path, issues) => {
  const s = str(raw, path, issues);
  if (s !== undefined && !CURRENCY.test(s)) {
    note(issues, path, 'expected an ISO 4217 code such as EUR');
    return undefined;
  }
  return s;
};

const COUNTRY = /^[A-Z]{2}$/;
const IBAN = /^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/;
const iban: Reader<string> = (raw, path, issues) => {
  const s = str(raw, path, issues);
  if (s !== undefined && !IBAN.test(s)) {
    note(issues, path, 'expected an IBAN without spaces');
    return undefined;
  }
  return s;
};

const DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const datetime: Reader<string> = (raw, path, issues) => {
  const s = str(raw, path, issues);
  if (s !== undefined && (!DATETIME.test(s) || Number.isNaN(Date.parse(s)))) {
    note(issues, path, 'expected an ISO datetime such as 2026-10-26T09:30:00Z');
    return undefined;
  }
  return s;
};

const language = oneOf(['de', 'en'] as const);
const jurisdiction = oneOf(['de', 'generic'] as const);
const vatCategory = oneOf(VAT_CATEGORIES);

const list = <T>(raw: unknown, path: string, issues: Issue[], read: Reader<T>): T[] | undefined => {
  const items = arr(raw, path, issues);
  return items
    ?.map((item, i) => read(item, `${path}[${i}]`, issues))
    .filter((v) => v !== undefined);
};

const address: Reader<Address> = (raw, path, issues) => {
  const r = obj(raw, path, ADDRESS_KEYS, issues);
  if (!r) return undefined;
  const country = req(r, path, 'country', issues, str);
  if (country !== undefined && !COUNTRY.test(country)) {
    note(issues, at(path, 'country'), 'expected an ISO 3166-1 alpha-2 code such as DE');
  }
  return compact({
    street: req(r, path, 'street', issues, str),
    postcode: req(r, path, 'postcode', issues, str),
    city: req(r, path, 'city', issues, str),
    country,
  }) as Address;
};

const contactPerson: Reader<{ name: string; email?: string; phone?: string }> = (
  raw,
  path,
  issues,
) => {
  const r = obj(raw, path, ['name', 'email', 'phone'], issues);
  if (!r) return undefined;
  return compact({
    name: req(r, path, 'name', issues, str),
    email: opt(r, path, 'email', issues, str),
    phone: opt(r, path, 'phone', issues, str),
  }) as { name: string; email?: string; phone?: string };
};

export const validateProfile = (raw: unknown): Result<BusinessProfile> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.profile, issues);
  if (!r) return { ok: false, issues };
  const contact = req(r, '', 'contact', issues, (c, p, i) => {
    const k = obj(c, p, ['name', 'email', 'phone'], i);
    return k
      ? (compact({
          name: req(k, p, 'name', i, str),
          email: req(k, p, 'email', i, str),
          phone: opt(k, p, 'phone', i, str),
        }) as BusinessProfile['contact'])
      : undefined;
  });
  const bank = req(r, '', 'bank', issues, (b, p, i) => {
    const k = obj(b, p, ['iban', 'bic', 'account_holder'], i);
    return k
      ? (compact({
          iban: req(k, p, 'iban', i, iban),
          bic: opt(k, p, 'bic', i, str),
          account_holder: opt(k, p, 'account_holder', i, str),
        }) as BusinessProfile['bank'])
      : undefined;
  });
  const numbering = opt(r, '', 'numbering', issues, (n, p, i) => {
    const k = obj(n, p, ['invoice', 'offer'], i);
    const pattern = (raw: unknown, path: string, iss: Issue[]) => {
      const v = str(raw, path, iss);
      if (v !== undefined && !isValidPattern(v)) {
        note(
          iss,
          path,
          'must contain exactly one {yyyy} and one {nnnn}-style sequence, other text only letters, digits, - and _, starting with a letter or digit, e.g. "RE-{yyyy}-{nnnn}"',
        );
        return undefined;
      }
      return v;
    };
    return k
      ? (compact({
          invoice: opt(k, p, 'invoice', i, pattern),
          offer: opt(k, p, 'offer', i, pattern),
        }) as NonNullable<BusinessProfile['numbering']>)
      : undefined;
  });
  const value = compact({
    name: req(r, '', 'name', issues, str),
    address: req(r, '', 'address', issues, address),
    vat_id: opt(r, '', 'vat_id', issues, str),
    tax_number: opt(r, '', 'tax_number', issues, str),
    contact,
    bank,
    jurisdiction: req(r, '', 'jurisdiction', issues, jurisdiction),
    vat_regime: req(r, '', 'vat_regime', issues, oneOf(['regular', 'small-business'] as const)),
    vat_basis: opt(r, '', 'vat_basis', issues, oneOf(['accrual', 'cash'] as const)),
    currency: req(r, '', 'currency', issues, currency),
    language: req(r, '', 'language', issues, language),
    payment_terms_days: req(r, '', 'payment_terms_days', issues, nonNegInt),
    default_vat_rate: req(r, '', 'default_vat_rate', issues, decimalStr),
    electronic_address: opt(r, '', 'electronic_address', issues, str),
    numbering,
  });
  return finish(issues, value);
};

/** `slug` comes from the folder name and must agree with nothing inside the file (the file has no slug key). */
export const validateClient = (raw: unknown, clientSlug: string): Result<Client> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.client, issues);
  if (!r) return { ok: false, issues };
  const s = slug(clientSlug, 'slug', issues);
  const value = compact({
    slug: s,
    name: req(r, '', 'name', issues, str),
    address: req(r, '', 'address', issues, address),
    vat_id: opt(r, '', 'vat_id', issues, str),
    buyer_reference: opt(r, '', 'buyer_reference', issues, str),
    leitweg_id: opt(r, '', 'leitweg_id', issues, str),
    electronic_address: opt(r, '', 'electronic_address', issues, str),
    contacts:
      r.contacts === undefined
        ? []
        : list(r.contacts, 'contacts', issues, (c, p, i) => {
            const k = obj(c, p, ['name', 'email', 'phone', 'role'], i);
            return k
              ? compact({
                  name: req(k, p, 'name', i, str),
                  email: opt(k, p, 'email', i, str),
                  phone: opt(k, p, 'phone', i, str),
                  role: opt(k, p, 'role', i, str),
                })
              : undefined;
          }),
    payment_terms_days: opt(r, '', 'payment_terms_days', issues, nonNegInt),
    language: opt(r, '', 'language', issues, language),
    currency: opt(r, '', 'currency', issues, currency),
    stage: req(r, '', 'stage', issues, oneOf(CLIENT_STAGES)),
    tags: opt(r, '', 'tags', issues, (t, p, i) => list(t, p, i, str)),
  });
  return finish(issues, value);
};

/** `clientSlug` is the owning folder; the file's `client` key must match it. */
export const validateProject = (
  raw: unknown,
  projectSlug: string,
  clientSlug: string,
): Result<Project> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.project, issues);
  if (!r) return { ok: false, issues };
  const client = req(r, '', 'client', issues, slug);
  if (client !== undefined && client !== clientSlug) {
    note(issues, 'client', `must match the folder "${clientSlug}"`);
  }
  const value = compact({
    slug: slug(projectSlug, 'slug', issues),
    client,
    name: req(r, '', 'name', issues, str),
    status: req(r, '', 'status', issues, oneOf(['active', 'paused', 'done'] as const)),
    rate: opt(r, '', 'rate', issues, (x, p, i) => {
      const k = obj(x, p, ['per', 'amount'], i);
      return k
        ? compact({
            per: req(k, p, 'per', i, oneOf(['hour', 'day'] as const)),
            amount: req(k, p, 'amount', i, nonNegInt),
          })
        : undefined;
    }),
    fixed_price: opt(r, '', 'fixed_price', issues, nonNegInt),
    budget_minutes: opt(r, '', 'budget_minutes', issues, nonNegInt),
    budget_amount: opt(r, '', 'budget_amount', issues, nonNegInt),
    retainer: opt(r, '', 'retainer', issues, (x, p, i) => {
      const k = obj(x, p, ['amount', 'interval', 'next_date', 'description'], i);
      return k
        ? compact({
            amount: req(k, p, 'amount', i, nonNegInt),
            interval: req(k, p, 'interval', i, oneOf(['monthly', 'quarterly'] as const)),
            next_date: req(k, p, 'next_date', i, date),
            description: req(k, p, 'description', i, str),
          })
        : undefined;
    }),
  });
  return finish(issues, value);
};

/** A receipt or contract file sits next to its record and is named by the record's id: `<id>.<ext>`. */
const attachmentName =
  (id: unknown, exts: readonly string[], record: string): Reader<string> =>
  (raw, path, issues) => {
    const name = str(raw, path, issues);
    if (name === undefined) return undefined;
    const dot = name.lastIndexOf('.');
    if (name.slice(0, dot) === id && exts.includes(name.slice(dot + 1))) return name;
    note(
      issues,
      path,
      `must be "<id>.<ext>", ext ${exts.join('/')} (rename the file to match the ${record} id)`,
    );
    return undefined;
  };

export const validateContract = (raw: unknown): Result<Contract> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.contract, issues);
  if (!r) return { ok: false, issues };
  const value = compact({
    id: req(r, '', 'id', issues, ulidField),
    client: req(r, '', 'client', issues, slug),
    kind: req(r, '', 'kind', issues, str),
    title: req(r, '', 'title', issues, str),
    start: req(r, '', 'start', issues, date),
    end: opt(r, '', 'end', issues, date),
    notice_period_days: opt(r, '', 'notice_period_days', issues, nonNegInt),
    renewal_date: opt(r, '', 'renewal_date', issues, date),
    file: opt(r, '', 'file', issues, attachmentName(r.id, CONTRACT_EXTENSIONS, 'contract')),
  });
  return finish(issues, value);
};

const line: Reader<Line> = (raw, path, issues) => {
  const r = obj(raw, path, LINE_KEYS, issues);
  if (!r) return undefined;
  return compact({
    description: req(r, path, 'description', issues, str),
    quantity: req(r, path, 'quantity', issues, decimalStr),
    unit: req(r, path, 'unit', issues, str),
    unit_price: req(r, path, 'unit_price', issues, int),
    vat_category: req(r, path, 'vat_category', issues, vatCategory),
    vat_rate: req(r, path, 'vat_rate', issues, decimalStr),
  }) as Line;
};

/** Fields shared by drafts and issued documents, plus the cross-field rules on kind. */
const docBody = (r: Rec, issues: Issue[]): Rec => {
  const kind = req(r, '', 'kind', issues, oneOf(DOC_KINDS));
  const lines = req(r, '', 'lines', issues, (x, p, i) => list(x, p, i, line));
  if (lines && lines.length === 0) note(issues, 'lines', 'must not be empty');
  const corrects = opt(r, '', 'corrects', issues, str);
  const validUntil = opt(r, '', 'valid_until', issues, date);
  if (kind === 'credit-note' && corrects === undefined) {
    note(issues, 'corrects', 'a credit-note needs the number of the invoice it corrects');
  }
  if (kind === 'offer' && validUntil === undefined) {
    note(issues, 'valid_until', 'an offer needs a valid_until date');
  }
  return compact({
    kind,
    client: req(r, '', 'client', issues, slug),
    project: opt(r, '', 'project', issues, slug),
    currency: opt(r, '', 'currency', issues, currency),
    language: opt(r, '', 'language', issues, language),
    service_period: opt(r, '', 'service_period', issues, (x, p, i) => {
      const k = obj(x, p, ['start', 'end'], i);
      return k
        ? compact({ start: req(k, p, 'start', i, date), end: req(k, p, 'end', i, date) })
        : undefined;
    }),
    service_date: opt(r, '', 'service_date', issues, date),
    lines,
    notes: opt(r, '', 'notes', issues, optStr),
    payment_terms_days: opt(r, '', 'payment_terms_days', issues, nonNegInt),
    valid_until: validUntil,
    from_offer: opt(r, '', 'from_offer', issues, str),
    supersedes: opt(r, '', 'supersedes', issues, str),
    corrects,
    buyer_reference: opt(r, '', 'buyer_reference', issues, str),
    time_entries: opt(r, '', 'time_entries', issues, (t, p, i) => list(t, p, i, ulidField)),
  });
};

export const validateDraft = (raw: unknown): Result<Draft> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.draft, issues);
  if (!r) return { ok: false, issues };
  const id = req(r, '', 'id', issues, ulidField);
  return finish(issues, {
    id,
    ...docBody(r, issues),
    ...compact({ from_retainer: opt(r, '', 'from_retainer', issues, date) }),
  });
};

const party: Reader<Party> = (raw, path, issues) => {
  const r = obj(raw, path, PARTY_KEYS, issues);
  if (!r) return undefined;
  return compact({
    name: req(r, path, 'name', issues, str),
    address: req(r, path, 'address', issues, address),
    vat_id: opt(r, path, 'vat_id', issues, str),
    tax_number: opt(r, path, 'tax_number', issues, str),
    contact: opt(r, path, 'contact', issues, contactPerson),
    electronic_address: opt(r, path, 'electronic_address', issues, str),
    buyer_reference: opt(r, path, 'buyer_reference', issues, str),
    leitweg_id: opt(r, path, 'leitweg_id', issues, str),
  }) as Party;
};

const totals: Reader<Totals> = (raw, path, issues) => {
  const r = obj(raw, path, ['net', 'vat', 'gross', 'breakdown'], issues);
  if (!r) return undefined;
  const net = req(r, path, 'net', issues, int);
  const vat = req(r, path, 'vat', issues, int);
  const gross = req(r, path, 'gross', issues, int);
  if (net !== undefined && vat !== undefined && gross !== undefined && gross !== net + vat) {
    note(issues, at(path, 'gross'), `must equal net + vat (${net + vat})`);
  }
  return compact({
    net,
    vat,
    gross,
    breakdown: req(r, path, 'breakdown', issues, (b, p, i) =>
      list(b, p, i, (x, xp, xi) => {
        const k = obj(x, xp, ['category', 'rate', 'taxable', 'tax', 'exemption_reason'], xi);
        return k
          ? compact({
              category: req(k, xp, 'category', xi, vatCategory),
              rate: req(k, xp, 'rate', xi, decimalStr),
              taxable: req(k, xp, 'taxable', xi, int),
              tax: req(k, xp, 'tax', xi, int),
              exemption_reason: opt(k, xp, 'exemption_reason', xi, str),
            })
          : undefined;
      }),
    ),
  }) as Totals;
};

const TYPE_CODES: Record<DocKind, 380 | 381 | null> = {
  invoice: 380,
  'credit-note': 381,
  offer: null,
};

/** Checks shape and `gross === net + vat`; recomputing totals from the lines is `computeTotals`' job. */
export const validateIssued = (raw: unknown): Result<Issued> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.issued, issues);
  if (!r) return { ok: false, issues };
  const body = docBody(r, issues);
  const typeCode = r.type_code;
  if (typeCode !== 380 && typeCode !== 381 && typeCode !== null) {
    note(issues, 'type_code', 'expected 380, 381 or null');
  } else if (body.kind !== undefined && TYPE_CODES[body.kind as DocKind] !== typeCode) {
    note(
      issues,
      'type_code',
      'must be 380 for an invoice, 381 for a credit-note, null for an offer',
    );
  }
  const value = {
    number: req(r, '', 'number', issues, str),
    draft_id: req(r, '', 'draft_id', issues, ulidField),
    type_code: typeCode,
    issue_date: req(r, '', 'issue_date', issues, date),
    due_date: opt(r, '', 'due_date', issues, date),
    jurisdiction: req(r, '', 'jurisdiction', issues, jurisdiction),
    ...body,
    seller: req(r, '', 'seller', issues, party),
    buyer: req(r, '', 'buyer', issues, party),
    payment: opt(r, '', 'payment', issues, (x, p, i) => {
      const k = obj(x, p, ['means_code', 'iban', 'bic', 'reference'], i);
      return k
        ? compact({
            means_code: req(k, p, 'means_code', i, oneOf(['58'] as const)),
            iban: req(k, p, 'iban', i, iban),
            bic: opt(k, p, 'bic', i, str),
            reference: req(k, p, 'reference', i, str),
          })
        : undefined;
    }),
    totals: req(r, '', 'totals', issues, totals),
    legal_notes: req(r, '', 'legal_notes', issues, (x, p, i) => list(x, p, i, str)),
    retain_until: req(r, '', 'retain_until', issues, date),
  };
  return finish(issues, compact(value));
};

export const validateTimeEntry = (raw: unknown): Result<TimeEntry> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.time, issues);
  if (!r) return { ok: false, issues };
  const minutes = req(r, '', 'minutes', issues, int);
  if (minutes !== undefined && (minutes < 1 || minutes > 1440)) {
    note(issues, 'minutes', 'must be between 1 and 1440');
  }
  const value = compact({
    id: req(r, '', 'id', issues, ulidField),
    date: req(r, '', 'date', issues, date),
    minutes,
    client: req(r, '', 'client', issues, slug),
    project: opt(r, '', 'project', issues, slug),
    note: req(r, '', 'note', issues, str),
    invoice: opt(r, '', 'invoice', issues, str),
  });
  return finish(issues, value);
};

const OFFSET_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/;
const offsetDatetime: Reader<string> = (raw, path, issues) => {
  if (typeof raw === 'string' && OFFSET_DATETIME.test(raw) && !Number.isNaN(Date.parse(raw))) {
    return raw;
  }
  note(issues, path, 'expected an ISO datetime with offset, e.g. 2026-11-02T09:30:00+01:00');
  return undefined;
};

export const validateTimer = (raw: unknown): Result<RunningTimer> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.timer, issues);
  if (!r) return { ok: false, issues };
  const value = compact({
    client: req(r, '', 'client', issues, slug),
    project: opt(r, '', 'project', issues, slug),
    started_at: req(r, '', 'started_at', issues, offsetDatetime),
    note: opt(r, '', 'note', issues, str),
  });
  return finish(issues, value);
};

export const validatePayment = (raw: unknown): Result<Payment> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.payment, issues);
  if (!r) return { ok: false, issues };
  const value = compact({
    id: req(r, '', 'id', issues, ulidField),
    date: req(r, '', 'date', issues, date),
    invoice: req(r, '', 'invoice', issues, str),
    amount: req(r, '', 'amount', issues, posInt),
    method: opt(r, '', 'method', issues, str),
    ref: opt(r, '', 'ref', issues, str),
  });
  return finish(issues, value);
};

export const validateEvent = (raw: unknown): Result<DocEvent> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.event, issues);
  if (!r) return { ok: false, issues };
  const value = compact({
    id: req(r, '', 'id', issues, ulidField),
    at: req(r, '', 'at', issues, datetime),
    doc: req(r, '', 'doc', issues, str),
    type: req(r, '', 'type', issues, oneOf(EVENT_TYPES)),
    note: opt(r, '', 'note', issues, str),
  });
  return finish(issues, value);
};

export const validateLink = (raw: unknown): Result<LinkRecord> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.link, issues);
  if (!r) return { ok: false, issues };
  const value = compact({
    id: req(r, '', 'id', issues, ulidField),
    doc: req(r, '', 'doc', issues, str),
    url: req(r, '', 'url', issues, str),
    created: req(r, '', 'created', issues, datetime),
    expires: opt(r, '', 'expires', issues, datetime),
    revoked: opt(r, '', 'revoked', issues, datetime),
  });
  return finish(issues, value);
};

export const validateExpense = (raw: unknown): Result<Expense> => {
  const issues: Issue[] = [];
  const r = obj(raw, '', KEY_ORDER.expense, issues);
  if (!r) return { ok: false, issues };
  const net = req(r, '', 'net', issues, int);
  const vat = req(r, '', 'vat', issues, int);
  const gross = req(r, '', 'gross', issues, int);
  if (net !== undefined && vat !== undefined && gross !== undefined && gross !== net + vat) {
    note(issues, 'gross', `must equal net + vat (${net + vat})`);
  }
  const value = compact({
    id: req(r, '', 'id', issues, ulidField),
    date: req(r, '', 'date', issues, date),
    supplier: req(r, '', 'supplier', issues, str),
    description: req(r, '', 'description', issues, str),
    category: req(r, '', 'category', issues, str),
    net,
    vat,
    gross,
    vat_rate: req(r, '', 'vat_rate', issues, decimalStr),
    client: opt(r, '', 'client', issues, slug),
    project: opt(r, '', 'project', issues, slug),
    receipt: opt(r, '', 'receipt', issues, attachmentName(r.id, RECEIPT_EXTENSIONS, 'expense')),
  });
  return finish(issues, value);
};
