/** Record shapes as they appear in files: snake_case keys, money in integer minor units, decimals as strings. */

import type { Slug, Ulid } from './ids.js';

export type Address = { street: string; postcode: string; city: string; country: string };

export type Jurisdiction = 'de' | 'generic';

export type BusinessProfile = {
  name: string;
  address: Address;
  vat_id?: string;
  tax_number?: string;
  contact: { name: string; email: string; phone?: string };
  bank: { iban: string; bic?: string; account_holder?: string };
  jurisdiction: Jurisdiction;
  vat_regime: 'regular' | 'small-business';
  currency: string;
  language: 'de' | 'en';
  payment_terms_days: number;
  default_vat_rate: string;
  electronic_address?: string;
  numbering?: { invoice?: string; offer?: string };
};

export const CLIENT_STAGES = ['lead', 'contacted', 'offer-sent', 'active', 'past', 'lost'] as const;
export type ClientStage = (typeof CLIENT_STAGES)[number];

export type Client = {
  slug: Slug;
  name: string;
  address: Address;
  vat_id?: string;
  buyer_reference?: string;
  leitweg_id?: string;
  electronic_address?: string;
  contacts: { name: string; email?: string; phone?: string; role?: string }[];
  payment_terms_days?: number;
  language?: 'de' | 'en';
  currency?: string;
  stage: ClientStage;
  tags?: string[];
};

export type Project = {
  slug: Slug;
  client: Slug;
  name: string;
  status: 'active' | 'paused' | 'done';
  rate?: { per: 'hour' | 'day'; amount: number };
  fixed_price?: number;
  budget_minutes?: number;
  budget_amount?: number;
  retainer?: {
    amount: number;
    interval: 'monthly' | 'quarterly';
    next_date: string;
    description: string;
  };
};

export type Contract = {
  id: Ulid;
  client: Slug;
  kind: string;
  title: string;
  start: string;
  end?: string;
  notice_period_days?: number;
  renewal_date?: string;
  file?: string;
};

export const VAT_CATEGORIES = ['S', 'Z', 'E', 'AE', 'K', 'O'] as const;
export type VatCategory = (typeof VAT_CATEGORIES)[number];

export type Line = {
  description: string;
  quantity: string;
  /** UN/ECE recommendation 20 code, e.g. HUR, C62. */
  unit: string;
  unit_price: number;
  vat_category: VatCategory;
  vat_rate: string;
};

export const DOC_KINDS = ['invoice', 'credit-note', 'offer'] as const;
export type DocKind = (typeof DOC_KINDS)[number];

export type Draft = {
  id: Ulid;
  kind: DocKind;
  client: Slug;
  project?: Slug;
  currency?: string;
  language?: 'de' | 'en';
  service_period?: { start: string; end: string };
  service_date?: string;
  lines: Line[];
  notes?: string;
  payment_terms_days?: number;
  /** Offers only. */
  valid_until?: string;
  from_offer?: string;
  /** Offers only: the offer this one replaces. */
  supersedes?: string;
  /** Credit notes only: number of the corrected invoice. */
  corrects?: string;
  buyer_reference?: string;
  time_entries?: Ulid[];
};

export type Party = {
  name: string;
  address: Address;
  vat_id?: string;
  tax_number?: string;
  contact?: { name: string; email?: string; phone?: string };
  electronic_address?: string;
  buyer_reference?: string;
  leitweg_id?: string;
};

export type Totals = {
  net: number;
  vat: number;
  gross: number;
  breakdown: {
    category: VatCategory;
    rate: string;
    taxable: number;
    tax: number;
    exemption_reason?: string;
  }[];
};

export type Issued = Omit<Draft, 'id'> & {
  number: string;
  draft_id: Ulid;
  /** Offers have no EN 16931 type code. */
  type_code: 380 | 381 | null;
  issue_date: string;
  due_date?: string;
  seller: Party;
  buyer: Party;
  payment?: { means_code: '58'; iban: string; bic?: string; reference: string };
  totals: Totals;
  legal_notes: string[];
  retain_until: string;
  jurisdiction: Jurisdiction;
};

export type TimeEntry = {
  id: Ulid;
  date: string;
  minutes: number;
  client: Slug;
  project?: Slug;
  note: string;
  invoice?: string;
};

/** The one running timer (`time/running.yaml`); stopping turns it into a `TimeEntry`. */
export type RunningTimer = {
  client: Slug;
  project?: Slug;
  /** ISO 8601 datetime with an explicit offset, as written. */
  started_at: string;
  note?: string;
};

export type Payment = {
  id: Ulid;
  date: string;
  invoice: string;
  amount: number;
  method?: string;
  ref?: string;
};

export const EVENT_TYPES = ['sent', 'accepted', 'declined', 'downloaded'] as const;
export type DocEvent = {
  id: Ulid;
  /** ISO datetime. */
  at: string;
  doc: string;
  type: (typeof EVENT_TYPES)[number];
  note?: string;
};

export type LinkRecord = {
  id: Ulid;
  doc: string;
  url: string;
  created: string;
  expires?: string;
  revoked?: string;
};

export type Expense = {
  id: Ulid;
  date: string;
  supplier: string;
  description: string;
  category: string;
  net: number;
  vat: number;
  gross: number;
  vat_rate: string;
  client?: Slug;
  project?: Slug;
  receipt?: string;
};

export type RecordKind =
  | 'profile'
  | 'client'
  | 'project'
  | 'contract'
  | 'draft'
  | 'issued'
  | 'time'
  | 'timer'
  | 'payment'
  | 'event'
  | 'link'
  | 'expense';

export const ADDRESS_KEYS = ['street', 'postcode', 'city', 'country'] as const;
export const LINE_KEYS = [
  'description',
  'quantity',
  'unit',
  'unit_price',
  'vat_category',
  'vat_rate',
] as const;
export const DRAFT_BODY_KEYS = [
  'kind',
  'client',
  'project',
  'currency',
  'language',
  'service_period',
  'service_date',
  'lines',
  'notes',
  'payment_terms_days',
  'valid_until',
  'from_offer',
  'supersedes',
  'corrects',
  'buyer_reference',
  'time_entries',
] as const;
export const PARTY_KEYS = [
  'name',
  'address',
  'vat_id',
  'tax_number',
  'contact',
  'electronic_address',
  'buyer_reference',
  'leitweg_id',
] as const;

/** Top-level key order for every writer. Nested key sets are the exported *_KEYS lists. */
export const KEY_ORDER: Record<RecordKind, readonly string[]> = {
  profile: [
    'name',
    'address',
    'vat_id',
    'tax_number',
    'contact',
    'bank',
    'jurisdiction',
    'vat_regime',
    'currency',
    'language',
    'payment_terms_days',
    'default_vat_rate',
    'electronic_address',
    'numbering',
  ],
  client: [
    'name',
    'address',
    'vat_id',
    'buyer_reference',
    'leitweg_id',
    'electronic_address',
    'contacts',
    'payment_terms_days',
    'language',
    'currency',
    'stage',
    'tags',
  ],
  project: [
    'client',
    'name',
    'status',
    'rate',
    'fixed_price',
    'budget_minutes',
    'budget_amount',
    'retainer',
  ],
  contract: [
    'id',
    'client',
    'kind',
    'title',
    'start',
    'end',
    'notice_period_days',
    'renewal_date',
    'file',
  ],
  draft: ['id', ...DRAFT_BODY_KEYS],
  issued: [
    'number',
    'draft_id',
    'type_code',
    'issue_date',
    'due_date',
    'jurisdiction',
    ...DRAFT_BODY_KEYS,
    'seller',
    'buyer',
    'payment',
    'totals',
    'legal_notes',
    'retain_until',
  ],
  time: ['id', 'date', 'minutes', 'client', 'project', 'note', 'invoice'],
  timer: ['client', 'project', 'started_at', 'note'],
  payment: ['id', 'date', 'invoice', 'amount', 'method', 'ref'],
  event: ['id', 'at', 'doc', 'type', 'note'],
  link: ['id', 'doc', 'url', 'created', 'expires', 'revoked'],
  expense: [
    'id',
    'date',
    'supplier',
    'description',
    'category',
    'net',
    'vat',
    'gross',
    'vat_rate',
    'client',
    'project',
    'receipt',
  ],
};
