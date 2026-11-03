import { loadBusinessRepo } from '@kaihuman/formats/business';
import { describe, expect, it } from 'vitest';
import { einvoiceFiles } from './einvoice';
import { loadFixtureRepo } from './fixture.test-helper';

const doc = () => {
  const issued = loadBusinessRepo(loadFixtureRepo()).issued.find(
    (i) => i.doc.number === 'RE-2026-0001',
  );
  if (!issued) throw new Error('fixture invoice missing');
  return issued.doc;
};

describe('einvoiceFiles', () => {
  it('names the files after the document number and types them as XML', async () => {
    const f = einvoiceFiles(doc());
    const ubl = f.ubl();
    const cii = f.cii();
    expect(ubl.name).toBe('RE-2026-0001.xrechnung.xml');
    expect(cii.name).toBe('RE-2026-0001.cii.xml');
    expect(ubl.blob.type).toBe('application/xml');
    expect(await ubl.blob.text()).toContain('RE-2026-0001');
    expect(await cii.blob.text()).toContain('CrossIndustryInvoice');
  });

  it('reports gaps as strings', () => {
    expect(Array.isArray(einvoiceFiles(doc()).gaps)).toBe(true);
  });
});
