import type { Issued } from '@kaihuman/formats/business';
import { toCii, toEn16931, toUbl, xrechnungGaps } from '@kaihuman/formats/business';

const XML = 'application/xml';

export type EinvoiceFile = { name: string; blob: Blob };

/**
 * XRechnung (UBL) and CII files of an issued invoice or credit note, generated on demand.
 * `gaps` lists what XRechnung requires but the document lacks; the files are still producible.
 */
export const einvoiceFiles = (
  doc: Issued,
): { gaps: string[]; ubl: () => EinvoiceFile; cii: () => EinvoiceFile } => {
  const e = toEn16931(doc);
  return {
    gaps: xrechnungGaps(e),
    ubl: () => ({ name: `${doc.number}.xrechnung.xml`, blob: new Blob([toUbl(e)], { type: XML }) }),
    cii: () => ({ name: `${doc.number}.cii.xml`, blob: new Blob([toCii(e)], { type: XML }) }),
  };
};
