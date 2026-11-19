/**
 * Printable documents (`documents/<slug>.md`): YAML frontmatter plus a Markdown body. This module
 * turns one into the merged data a narro template validates; rendering lives in the console.
 * The company part comes from `business.yaml`, so there is no second company file to maintain.
 */

import { parseDocument } from 'yaml';
import { DOCUMENTS_DIR } from './paths.js';
import type { BusinessProfile, Client, PrintSettings } from './records.js';
import type { Issue, Result } from './validate-kit.js';
import { parseYaml } from './yaml.js';

/** Built-in templates; documents never name a file, so no user code runs. */
export const DOCUMENT_TEMPLATES = ['offer', 'invoice', 'offer-whole-product'] as const;
export type DocumentTemplate = (typeof DOCUMENT_TEMPLATES)[number];

type Data = Record<string, unknown>;

export type ParsedDocument = { data: Data; body: string };

const FRONTMATTER = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/** Splits `---` frontmatter from the body. Line numbers of YAML issues count from the file's top. */
export const parseDocumentFile = (text: string): Result<ParsedDocument> => {
  const src = text.replace(/^﻿/, '');
  const m = FRONTMATTER.exec(src);
  if (!m) {
    return {
      ok: false,
      issues: [{ path: '', message: 'the file must start with --- frontmatter --- and a body' }],
    };
  }
  const parsed = parseYaml(m[1] ?? '');
  if (!parsed.ok) {
    return {
      ok: false,
      issues: parsed.issues.map((i) => (i.line === undefined ? i : { ...i, line: i.line + 1 })),
    };
  }
  const data = parsed.value;
  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { ok: false, issues: [{ path: '', message: 'the frontmatter must be a mapping' }] };
  }
  return { ok: true, value: { data: data as Data, body: src.slice(m[0].length) } };
};

const localeOf = (p: BusinessProfile): string => `${p.language}-${p.address.country}`;

const addressLines = (a: { street: string; postcode: string; city: string }): string[] => [
  a.street,
  `${a.postcode} ${a.city}`,
];

/** IBAN in groups of four, as printed. */
const spacedIban = (iban: string): string => iban.replace(/(.{4})(?=.)/g, '$1 ');

/** The company part of every document (narro's `company.yaml`) from the business profile. */
export const companyFromProfile = (p: BusinessProfile): Data => {
  const print: PrintSettings = p.print ?? {};
  const theme = {
    ...(print.accent ? { accent: print.accent } : {}),
    ...(print.font ? { font: print.font } : {}),
  };
  return {
    locale: localeOf(p),
    currency: p.currency,
    ...(print.paper ? { paper: print.paper } : {}),
    ...(print.letterhead ? { letterhead: print.letterhead } : {}),
    ...(p.vat_regime === 'small-business' ? { smallBusiness: true } : {}),
    sender: {
      name: p.name,
      address: addressLines(p.address),
      country: p.address.country,
      email: p.contact.email,
      ...(p.contact.phone ? { phone: p.contact.phone } : {}),
      ...(print.website ? { website: print.website } : {}),
      ...(p.vat_id ? { vatId: p.vat_id } : {}),
      ...(p.tax_number ? { taxNumber: p.tax_number } : {}),
    },
    bank: {
      ...(print.bank_name ? { name: print.bank_name } : {}),
      iban: spacedIban(p.bank.iban),
      ...(p.bank.bic ? { bic: p.bank.bic } : {}),
    },
    ...(Object.keys(theme).length > 0 ? { theme } : {}),
  };
};

/** A client record as narro's recipient (`client:` mapping). The first contact is addressed. */
export const partyFromClient = (c: Client): Data => ({
  name: c.name,
  ...(c.contacts[0]?.name ? { contact: c.contacts[0].name } : {}),
  address: addressLines(c.address),
  country: c.address.country,
  ...(c.vat_id ? { vatId: c.vat_id } : {}),
});

const isPlain = (v: unknown): v is Data => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Deep merge as narro's `extends:`: mappings merge, everything else (lists too) is replaced. */
const merge = (base: Data, over: Data): Data => {
  const out: Data = { ...base };
  for (const [k, v] of Object.entries(over)) {
    const b = out[k];
    out[k] = isPlain(b) && isPlain(v) ? merge(b, v) : v;
  }
  return out;
};

export type ResolvedDocument = {
  template: DocumentTemplate;
  /** Company merged under the document; `client` resolved. What the template validates. */
  data: Data;
  body: string;
};

/**
 * Resolves `template` and `client` (a slug from `clients/`, or an inline mapping) and merges the
 * document over the company. Other fields are checked by the template's schema when rendered.
 */
export const resolveDocument = (
  doc: ParsedDocument,
  profile: BusinessProfile,
  clients: readonly Client[],
): Result<ResolvedDocument> => {
  const issues: Issue[] = [];
  const { template: rawTemplate = 'offer', client: rawClient, ...rest } = doc.data;
  const template = DOCUMENT_TEMPLATES.find((t) => t === rawTemplate);
  if (!template) {
    issues.push({
      path: 'template',
      message: `template: expected one of ${DOCUMENT_TEMPLATES.join(', ')}`,
    });
  }
  let client: unknown = rawClient;
  if (typeof rawClient === 'string') {
    const found = clients.find((c) => c.slug === rawClient);
    if (found) client = partyFromClient(found);
    else {
      issues.push({
        path: 'client',
        message: `client: no client "${rawClient}" in clients/ (use its slug or an inline mapping)`,
      });
    }
  } else if (rawClient === undefined) {
    issues.push({ path: 'client', message: 'client: required (a client slug or a mapping)' });
  }
  if (issues.length > 0 || !template) return { ok: false, issues };
  return {
    ok: true,
    value: {
      template,
      data: merge(companyFromProfile(profile), { ...rest, client }),
      body: doc.body,
    },
  };
};

/**
 * The repo path a reference written in `documents/<slug>.md` points to, or null when it would
 * leave the repository. `fromDir` defaults to the documents folder.
 */
export const resolveRepoPath = (ref: string, fromDir: string = DOCUMENTS_DIR): string | null => {
  const out = ref.startsWith('/') ? [] : fromDir.split('/').filter(Boolean);
  let decoded = ref;
  try {
    decoded = decodeURI(ref);
  } catch {
    // A literal `%` (e.g. `100%.svg`) is a file name, not an escape.
  }
  for (const part of decoded.split('/')) {
    if (part === '..') {
      if (out.length === 0) return null;
      out.pop();
    } else if (part !== '' && part !== '.') out.push(part);
  }
  return out.join('/');
};

/**
 * Sets or removes `print` in `business.yaml`, keeping its comments and other keys. An empty
 * setting is removed; no settings left removes the key.
 */
export const setProfilePrint = (text: string, print: PrintSettings): Result<string> => {
  const doc = parseDocument(text, { version: '1.2', schema: 'core', uniqueKeys: true });
  if (doc.errors.length > 0) {
    return { ok: false, issues: doc.errors.map((e) => ({ path: '', message: e.message })) };
  }
  const entries = Object.entries(print).filter(([, v]) => v !== undefined && v !== '');
  if (entries.length === 0) doc.delete('print');
  else doc.set('print', doc.createNode(Object.fromEntries(entries)));
  return { ok: true, value: doc.toString({ lineWidth: 0 }) };
};
