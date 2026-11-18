// The print chunk: everything that pulls in @getnarro/pdf. Load it with `import()` only, so the
// main bundle does not carry narro, remark and zod.
import {
  BUSINESS_ROOT,
  type BusinessProfile,
  type Client,
  type Issue,
  parseDocumentFile,
  resolveDocument,
} from '@kaihuman/formats/business';
import { browserFontCss } from './fonts';
import { type ReadBytes, type Rendered, renderDocumentHtml } from './render';

export { printHtml } from './print-frame';

export type DocumentOutcome = { ok: true; value: Rendered } | { ok: false; issues: Issue[] };

/** A `documents/<slug>.md` file to print-ready HTML, or every problem with its field. */
export async function renderBusinessDocument(
  text: string,
  profile: BusinessProfile,
  clients: readonly Client[],
  readBytes: ReadBytes,
  fontCss: (font: string) => string = browserFontCss,
): Promise<DocumentOutcome> {
  const parsed = parseDocumentFile(text);
  if (!parsed.ok) return parsed;
  const resolved = resolveDocument(parsed.value, profile, clients);
  if (!resolved.ok) return resolved;
  const logo = profile.print?.logo;
  return renderDocumentHtml({
    doc: resolved.value,
    readBytes,
    ...(logo ? { logoPath: `${BUSINESS_ROOT}/${logo}` } : {}),
    fontCss,
  });
}
