import { classifyBusinessPath } from '@kaihuman/formats/business';

const FROZEN_MESSAGE =
  'Issued documents never change. To correct an invoice, issue a credit note from the client page.';

/** Issued yaml and issued artifacts (pdf/xml/sha256) of offers and invoices; contract PDFs stay editable. */
export const isFrozenPath = (path: string): boolean => {
  const c = classifyBusinessPath(path);
  if (c.kind === 'issued') return true;
  return c.kind === 'artifact' && c.doc !== 'contract';
};

export const frozenMessage = (_path: string): string => FROZEN_MESSAGE;

/** A file itself, or a folder with a frozen file inside: renaming or deleting it would change issued documents. */
export const touchesFrozen = (path: string, treePaths: readonly string[]): boolean => {
  if (isFrozenPath(path)) return true;
  const prefix = path.endsWith('/') ? path : `${path}/`;
  return treePaths.some((p) => p.startsWith(prefix) && isFrozenPath(p));
};
