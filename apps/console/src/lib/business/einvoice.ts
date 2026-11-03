import type { Issued } from '@kaihuman/formats/business';
import { toCii, toEn16931, toUbl, xrechnungGaps } from '@kaihuman/formats/business';

const XML = 'application/xml';

export type EinvoiceFile = { name: string; blob: Blob };

export type EinvoiceFiles =
  | { ok: true; gaps: string[]; ubl: () => EinvoiceFile; cii: () => EinvoiceFile }
  | { ok: false; error: string };

/**
 * XRechnung (UBL) and CII files of an issued invoice or credit note, generated on demand.
 * `gaps` lists what XRechnung requires but the document lacks; the files are still producible.
 * The mapping recomputes line amounts, which throws on a record the loader accepts but the
 * arithmetic cannot (an amount beyond the safe integer range), so that is returned as an error
 * instead: this runs while the client page renders.
 */
export const einvoiceFiles = (doc: Issued): EinvoiceFiles => {
  try {
    const e = toEn16931(doc);
    return {
      ok: true,
      gaps: xrechnungGaps(e),
      ubl: () => ({
        name: `${doc.number}.xrechnung.xml`,
        blob: new Blob([toUbl(e)], { type: XML }),
      }),
      cii: () => ({ name: `${doc.number}.cii.xml`, blob: new Blob([toCii(e)], { type: XML }) }),
    };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
};
