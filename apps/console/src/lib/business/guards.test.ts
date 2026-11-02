import { describe, expect, it } from 'vitest';
import { frozenMessage, isFrozenPath, touchesFrozen } from './guards';

const B = '.kh/business';

describe('isFrozenPath', () => {
  it.each([
    [`${B}/invoices/2026/RE-2026-0001.yaml`, true],
    [`${B}/invoices/2026/RE-2026-0001.pdf`, true],
    [`${B}/invoices/2026/RE-2026-0001.xml`, true],
    [`${B}/invoices/2026/RE-2026-0001.sha256`, true],
    [`${B}/offers/2026/AN-2026-0001.yaml`, true],
    [`${B}/offers/2026/AN-2026-0001.pdf`, true],
    [`${B}/drafts/01HZX3Y5N8Q2R4T6V8W0A1B2C3.yaml`, false],
    [`${B}/time/2026-11.jsonl`, false],
    [`${B}/clients/acme/client.yaml`, false],
    [`${B}/clients/acme/contracts/01HZX3Y5N8Q2R4T6V8W0A1B2C3.pdf`, false],
    [`${B}/invoices/.gitkeep`, false],
    ['notes/ideas.md', false],
  ])('%s -> %s', (path, expected) => {
    expect(isFrozenPath(path)).toBe(expected);
  });

  it('has the brief copy', () => {
    expect(frozenMessage(`${B}/invoices/2026/RE-2026-0001.yaml`)).toBe(
      'Issued documents never change. To correct an invoice, issue a credit note from the client page.',
    );
  });
});

describe('touchesFrozen', () => {
  const tree = [`${B}/invoices/2026/RE-2026-0001.yaml`, `${B}/drafts/x.yaml`, 'notes/a.md'];
  it('covers folders that contain issued documents', () => {
    expect(touchesFrozen(`${B}/invoices/2026`, tree)).toBe(true);
    expect(touchesFrozen(B, tree)).toBe(true);
    expect(touchesFrozen(`${B}/invoices/2026/RE-2026-0001.yaml`, tree)).toBe(true);
  });
  it('leaves other paths alone', () => {
    expect(touchesFrozen(`${B}/drafts`, tree)).toBe(false);
    expect(touchesFrozen('notes', tree)).toBe(false);
    expect(touchesFrozen(`${B}/invoices/20`, tree)).toBe(false);
  });
});
