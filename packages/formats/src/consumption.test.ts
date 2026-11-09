import { describe, expect, it } from 'vitest';
import { sameDayLastYear } from './consumption.js';

describe('sameDayLastYear', () => {
  it('returns the same calendar day one year earlier', () => {
    expect(sameDayLastYear('2026-10-08')).toBe('2025-10-08');
    expect(sameDayLastYear('2026-01-01')).toBe('2025-01-01');
  });

  it('maps Feb 29 to a non-existent date so no entry matches', () => {
    expect(sameDayLastYear('2024-02-29')).toBe('2023-02-29');
  });
});
