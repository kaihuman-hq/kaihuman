import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EINVOICE_DIR,
  EINVOICE_NAMES,
  einvoiceFixtures,
  readGolden,
} from './einvoice-fixtures.test-helper.js';
import { toEn16931 } from './en16931.js';
import { toCii, toUbl, xrechnungGaps } from './xrechnung.js';

const update = process.env.UPDATE_GOLDEN === '1';
const fixtures = einvoiceFixtures();

describe.each(EINVOICE_NAMES)('golden e-invoice %s', (name) => {
  const e = toEn16931(fixtures[name]);

  it('has no XRechnung gaps', () => {
    expect(xrechnungGaps(e)).toEqual([]);
  });

  it.each([
    ['ubl', () => toUbl(e)],
    ['cii', () => toCii(e)],
  ] as const)('%s output matches the golden file', (kind, render) => {
    const file = `${name}.${kind}.xml`;
    const xml = render();
    if (update) {
      mkdirSync(EINVOICE_DIR, { recursive: true });
      writeFileSync(join(EINVOICE_DIR, file), xml);
    }
    expect(xml).toBe(readGolden(file));
  });
});
