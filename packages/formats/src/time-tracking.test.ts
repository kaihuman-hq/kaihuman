import { describe, expect, it } from 'vitest';
import { parseTimeTracking, serializeTimeTracking, toggleStartStop } from './time-tracking.js';

const NOW = new Date(2026, 8, 23, 10, 30);
const toggle = (csv: string) => serializeTimeTracking(toggleStartStop(parseTimeTracking(csv), NOW));

describe('toggleStartStop', () => {
  it('stops a running timer, and starts a new day newest first', () => {
    expect(toggle('iso date;time\n2026-09-23;08:00,12:00,12:30\n2026-09-22;08:00,17:00\n')).toBe(
      'iso date;time\n2026-09-23;08:00,12:00,12:30,10:30\n2026-09-22;08:00,17:00\n',
    );
    expect(toggle('iso date;time\n2026-09-22;08:00,17:00\n')).toBe(
      'iso date;time\n2026-09-23;10:30\n2026-09-22;08:00,17:00\n',
    );
  });
});
