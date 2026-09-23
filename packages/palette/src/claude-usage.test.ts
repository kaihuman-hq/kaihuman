import { describe, expect, it } from 'vitest';
import {
  CLAUDE_USAGE_URL,
  formatMoney,
  usageBar,
  usagePace,
  usageReset,
  usageRows,
} from './claude-usage.js';

// Local time throughout, so the expectations hold in any time zone.
const NOW = new Date(2026, 8, 23, 12, 0);
const inHours = (hours: number) => new Date(NOW.getTime() + hours * 3600_000).toISOString();

describe('usageBar', () => {
  it('fills twelve cells in proportion, clamped', () => {
    expect(usageBar(50)).toBe('██████░░░░░░');
    expect(usageBar(-5)).toBe('░'.repeat(12));
    expect(usageBar(250)).toBe('█'.repeat(12));
  });
});

describe('usagePace', () => {
  it('is how much of a known window has passed', () => {
    // A 5h window resetting in 1h has run for 4h.
    expect(usagePace('five_hour', inHours(1), NOW)).toBe(80);
    expect(usagePace('seven_day', inHours(7 * 24), NOW)).toBe(0);
  });

  it('is unknown for windows of no fixed length, or without a reset', () => {
    expect(usagePace('something_new', inHours(1), NOW)).toBeNull();
    expect(usagePace('five_hour', undefined, NOW)).toBeNull();
  });
});

describe('usageReset', () => {
  it('says how long until the reset, and when', () => {
    expect(usageReset(new Date(2026, 8, 23, 12, 45).toISOString(), NOW)).toBe(
      'resets in 45m (Wed 23 Sep 12:45)',
    );
    expect(usageReset(new Date(2026, 8, 23, 14, 5).toISOString(), NOW)).toBe(
      'resets in 2h 5m (Wed 23 Sep 14:05)',
    );
    expect(usageReset(new Date(2026, 8, 26, 15, 0).toISOString(), NOW)).toBe(
      'resets in 3d 3h (Sat 26 Sep 15:00)',
    );
    expect(usageReset(new Date(2026, 8, 23, 11, 0).toISOString(), NOW)).toMatch(/^resets in now/);
    expect(usageReset(undefined, NOW)).toBe('');
  });
});

describe('formatMoney', () => {
  it('uses the currency symbol it knows, and the code otherwise', () => {
    expect(formatMoney(123456, 2, 'USD')).toBe('$1,234.56');
    expect(formatMoney(500, 2, 'EUR')).toBe('€5.00');
    expect(formatMoney(5, 0, 'CHF')).toBe('CHF 5.00');
  });
});

describe('usageRows', () => {
  it('lists every window, the fullest first, under the account and its tier', () => {
    const rows = usageRows(
      'work',
      {
        usage: {
          rate_limit_tier: 'max_20x',
          five_hour: { utilization: 12, resets_at: inHours(1) },
          seven_day: { utilization: 64.4, resets_at: inHours(24) },
          seven_day_opus: null,
          something_new: { utilization: 3 },
        },
      },
      NOW,
    );
    expect(rows.map((row) => row.title)).toEqual([
      `Weekly (all models)   64%  ${usageBar(64.4)}  pace 86%`,
      `Session (5h)          12%  ${usageBar(12)}  pace 80%`,
      `Something new          3%  ${usageBar(3)}`,
    ]);
    expect(rows[0]).toMatchObject({ group: 'work · max_20x', url: CLAUDE_USAGE_URL });
    expect(rows[1]?.subtitle).toMatch(/^resets in 1h 0m/);
  });

  it('adds spend when it is on, with a severity worth mentioning', () => {
    const [spend] = usageRows(
      'me',
      {
        usage: {
          spend: {
            enabled: true,
            percent: 90,
            severity: 'warning',
            used: { amount_minor: 9000, exponent: 2, currency: 'USD' },
            limit: { amount_minor: 10000, exponent: 2, currency: 'USD' },
          },
        },
      },
      NOW,
    );
    expect(spend?.title).toContain('Monthly spend');
    expect(spend?.subtitle).toBe('$90.00 of $100.00  [warning]');
  });

  it('shows extra usage when there is no spend', () => {
    const [extra] = usageRows(
      'me',
      {
        usage: {
          extra_usage: {
            is_enabled: true,
            utilization: 10,
            used_credits: 250,
            monthly_limit: 2500,
          },
        },
      },
      NOW,
    );
    expect(extra?.title).toContain('Extra credits');
    expect(extra?.subtitle).toBe('$2.50 of $25.00');
  });

  it('says when there is nothing to report, or why there is no answer', () => {
    expect(usageRows('me', { usage: {} }, NOW)[0]?.title).toBe(
      'No usage limits reported for this account',
    );
    expect(usageRows('me', { error: 'no credentials in ~/.claude' }, NOW)[0]).toMatchObject({
      title: 'Could not load usage',
      subtitle: 'no credentials in ~/.claude',
      group: 'me',
    });
  });
});
