import {
  type BusinessProfile,
  type BusinessRepo,
  documentPath,
  type Issue,
  type PrintSettings,
  parseDocumentFile,
  type Result,
  type Slug,
  setProfilePrint,
  validateProfile,
} from '@kaihuman/formats/business';
import { BUSINESS_PROFILE_PATH } from './load';
import type { FileChanges } from './write';

export type DocumentSummary = {
  slug: Slug;
  path: string;
  subject?: string;
  template?: string;
  /** The client slug, or the inline client's name. */
  client?: string;
};

const text = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** One row per `documents/<slug>.md`, from the frontmatter when it parses. */
export const documentSummaries = (
  repo: BusinessRepo,
  contents: Record<string, string>,
): DocumentSummary[] =>
  repo.documents.map(({ slug, path }) => {
    const content = contents[path];
    const parsed = content === undefined ? null : parseDocumentFile(content);
    if (!parsed?.ok) return { slug, path };
    const { subject, template, client } = parsed.value.data;
    const clientName =
      text(client) ??
      (typeof client === 'object' && client !== null
        ? text((client as Record<string, unknown>).name)
        : undefined);
    return {
      slug,
      path,
      ...(text(subject) ? { subject: text(subject) } : {}),
      template: text(template) ?? 'offer',
      ...(clientName ? { client: clientName } : {}),
    };
  });

export type PrintForm = Record<keyof PrintSettings, string>;

export const printFormOf = (profile: BusinessProfile | null): PrintForm => {
  const p = profile?.print ?? {};
  return {
    letterhead: p.letterhead ?? '',
    paper: p.paper ?? '',
    accent: p.accent ?? '',
    font: p.font ?? '',
    website: p.website ?? '',
    logo: p.logo ?? '',
    bank_name: p.bank_name ?? '',
  };
};

/** The settings from the form, checked as part of the profile; issues keep their `print.*` path. */
export const printFromForm = (profile: BusinessProfile, form: PrintForm): Result<PrintSettings> => {
  const print = Object.fromEntries(
    Object.entries(form)
      .map(([k, v]) => [k, v.trim()] as const)
      .filter(([, v]) => v !== ''),
  ) as PrintSettings;
  const r = validateProfile({ ...profile, print });
  if (r.ok) return { ok: true, value: print };
  return { ok: false, issues: r.issues.filter((i) => i.path.startsWith('print')) };
};

/** `business.yaml` with the new print settings; the rest of the file is kept as written. */
export const printSettingsChanges = (
  profileText: string,
  print: PrintSettings,
): Result<FileChanges> => {
  const r = setProfilePrint(profileText, print);
  return r.ok ? { ok: true, value: { [BUSINESS_PROFILE_PATH]: r.value } } : r;
};

/** A starting point that renders as is with the first client; the user replaces the content. */
export const sampleDocument = (client: Slug | undefined, today: string): string => `---
template: offer
number: AN-${today.slice(0, 4)}-0001
date: ${today}
validDays: 30
acceptance: true
client: ${client ?? '{ name: Muster GmbH, contact: Erika Mustermann, address: [Musterstraße 1, 10115 Berlin] }'}
subject: Angebot
items:
  - description: Beratung
    details: Analyse und Konzept
    qty: 8
    unit: Std.
    price: 120
    vat: 19
---

Sehr geehrte Damen und Herren,

vielen Dank für Ihr Interesse. Gerne biete ich Ihnen an:

<!-- items -->

Mit freundlichen Grüßen
`;

export const newDocumentChanges = (
  repo: BusinessRepo,
  slug: Slug,
  today: string,
): Result<FileChanges> => {
  if (repo.documents.some((d) => d.slug === slug)) {
    const issue: Issue = { path: 'slug', message: `documents/${slug}.md already exists.` };
    return { ok: false, issues: [issue] };
  }
  return {
    ok: true,
    value: { [documentPath(slug)]: sampleDocument(repo.clients[0]?.slug, today) },
  };
};
