import { describe, expect, it } from 'vitest';
import {
  type BraindumpId,
  braindumpCreatedAt,
  braindumpIdOf,
  braindumpPath,
  braindumpTitle,
} from './braindumps.js';

describe('braindump paths', () => {
  it('names a braindump by its id and reads the id back', () => {
    const path = braindumpPath('1790000000000' as BraindumpId);
    expect(path).toBe('.kh/braindumps/1790000000000.md');
    expect(braindumpIdOf(path)).toBe('1790000000000');
  });

  it('reads the creation time from the id', () => {
    const id = braindumpIdOf('.kh/braindumps/1790000000000.md');
    expect(id && braindumpCreatedAt(id)).toBe(1_790_000_000_000);
  });

  it('refuses every other path', () => {
    for (const path of [
      '.kh/braindumps/../dump.md',
      '.kh/braindumps/notes.md',
      '.kh/braindumps/123.txt',
      '.kh/braindumps/archive/123.md',
      '.kh/braindumps/123456789012345678901.md',
      '.kh/raw/123.md',
      '/.kh/braindumps/123.md',
      'x.kh/braindumps/123.md',
      '.kh/braindumps/123.md\n',
    ]) {
      expect(braindumpIdOf(path), path).toBeNull();
    }
  });
});

describe('braindumpTitle', () => {
  it('is the first non-empty line, trimmed', () => {
    expect(braindumpTitle('\n\n  call the bank  \nabout the card')).toBe('call the bank');
  });

  it('drops markdown heading marks', () => {
    expect(braindumpTitle('## Release plan\n- one')).toBe('Release plan');
    expect(braindumpTitle('#\n# Real title')).toBe('Real title');
  });

  it('shortens long lines to 60 characters', () => {
    const title = braindumpTitle('x'.repeat(100));
    expect(title).toHaveLength(60);
    expect(title.endsWith('…')).toBe(true);
    expect(braindumpTitle('y'.repeat(60))).toBe('y'.repeat(60));
  });

  it('says so when there is nothing to show', () => {
    expect(braindumpTitle('')).toBe('(blank)');
    expect(braindumpTitle(' \n\t\n')).toBe('(blank)');
  });
});
