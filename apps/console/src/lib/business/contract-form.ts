import {
  ATTACHMENT_MAX_BYTES,
  CONTRACT_EXTENSIONS,
  type Contract,
  type Result,
  ulid,
  validateContract,
} from '@kaihuman/formats/business';
import { isRealDate } from './dates';

export const CONTRACT_KINDS = ['contract', 'nda', 'framework', 'sla', 'other'] as const;

export type ContractForm = {
  /** Fixed per page visit, so a failed save and a retry write the same files. */
  id: string;
  kind: string;
  title: string;
  start: string;
  end: string;
  notice: string;
  renewal: string;
  /** The stored file's name (`<id>.pdf`), or what a newly chosen file will be called. */
  file: string;
};

export type ContractField = Exclude<keyof ContractForm, 'id'>;
const FIELDS: readonly ContractField[] = [
  'kind',
  'title',
  'start',
  'end',
  'notice',
  'renewal',
  'file',
];
/** Record paths that the form shows under another field name. */
const FIELD_OF: Record<string, ContractField> = {
  notice_period_days: 'notice',
  renewal_date: 'renewal',
};

export const emptyContractForm = (today: string): ContractForm => ({
  id: ulid(),
  kind: 'contract',
  title: '',
  start: today,
  end: '',
  notice: '',
  renewal: '',
  file: '',
});

export const contractFormFromContract = (c: Contract): ContractForm => ({
  id: c.id,
  kind: c.kind,
  title: c.title,
  start: c.start,
  end: c.end ?? '',
  notice: c.notice_period_days === undefined ? '' : String(c.notice_period_days),
  renewal: c.renewal_date ?? '',
  file: c.file ?? '',
});

const text = (s: string) => s.trim();

/** Validates the form into a contract of `client`. */
export function contractFromForm(client: string, form: ContractForm): Result<Contract> {
  const issues: { path: string; message: string }[] = [];
  if (text(form.kind) === '') issues.push({ path: 'kind', message: 'Enter the kind.' });
  if (text(form.title) === '') issues.push({ path: 'title', message: 'Enter a title.' });
  const dateHint = 'Enter a date as YYYY-MM-DD.';
  if (!isRealDate(form.start)) issues.push({ path: 'start', message: dateHint });
  if (text(form.end) !== '' && !isRealDate(form.end)) {
    issues.push({ path: 'end', message: dateHint });
  } else if (text(form.end) !== '' && isRealDate(form.start) && form.end < form.start) {
    issues.push({ path: 'end', message: 'The end must not be before the start.' });
  }
  if (text(form.renewal) !== '' && !isRealDate(form.renewal)) {
    issues.push({ path: 'renewal', message: dateHint });
  }
  if (text(form.notice) !== '' && !/^\d{1,5}$/.test(text(form.notice))) {
    issues.push({ path: 'notice', message: 'Enter whole days, like 30.' });
  }
  if (issues.length > 0) return { ok: false, issues };
  return validateContract({
    id: form.id,
    client,
    kind: text(form.kind),
    title: text(form.title),
    start: form.start,
    ...(text(form.end) !== '' ? { end: form.end } : {}),
    ...(text(form.notice) !== '' ? { notice_period_days: Number(text(form.notice)) } : {}),
    ...(text(form.renewal) !== '' ? { renewal_date: form.renewal } : {}),
    ...(form.file !== '' ? { file: form.file } : {}),
  });
}

export function contractFieldErrors(
  result: Result<unknown>,
): Partial<Record<ContractField, string>> {
  const errors: Partial<Record<ContractField, string>> = {};
  if (result.ok) return errors;
  for (const issue of result.issues) {
    const path = FIELD_OF[issue.path] ?? issue.path;
    const field = FIELDS.find((f) => f === path);
    if (field && !errors[field]) errors[field] = issue.message;
  }
  return errors;
}

/**
 * Size and type of a chosen file, before any network call. The messages are the ones
 * `saveContract` refuses with, so the form and the write agree.
 */
export function checkContractFile(file: {
  name: string;
  size: number;
}): Result<Record<never, never>> {
  const refuse = (message: string) => ({ ok: false as const, issues: [{ path: 'file', message }] });
  if (file.size > ATTACHMENT_MAX_BYTES) return refuse('Contract files can be up to 10 MB.');
  const dot = file.name.lastIndexOf('.');
  const ext = dot < 0 ? '' : file.name.slice(dot + 1).toLowerCase();
  if (!(CONTRACT_EXTENSIONS as readonly string[]).includes(ext)) {
    return refuse('Contract files must be PDF.');
  }
  return { ok: true, value: {} };
}
