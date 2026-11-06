import { describe, expect, it, vi } from 'vitest';
import { FOCUS_MINUTES, FocusSessionController } from './focus-session.js';

const native = (id: string | null = 'a1') => ({
  startFocusActivity: vi.fn(() => id),
  updateFocusActivity: vi.fn(),
  endFocusActivity: vi.fn(),
});

describe('FocusSessionController', () => {
  it('is unavailable without the native methods (Android, Expo Go)', () => {
    for (const n of [null, undefined, {}]) {
      const c = new FocusSessionController(n);
      expect(c.available).toBe(false);
      expect(c.start('f#0', 'x')).toBe(false);
      expect(() => {
        c.extend(1);
        c.end();
      }).not.toThrow();
    }
  });

  it('starts a 25 minute activity for the todo', () => {
    const n = native();
    const c = new FocusSessionController(n);
    expect(c.available).toBe(true);
    expect(c.start('f#0', 'write')).toBe(true);
    expect(n.startFocusActivity).toHaveBeenCalledWith('f#0', 'write', FOCUS_MINUTES);
    expect(FOCUS_MINUTES).toBe(25);
    expect(c.active).toBe(true);
  });

  it('ends the previous activity before starting another', () => {
    const n = native();
    const c = new FocusSessionController(n);
    c.start('f#0', 'a');
    c.start('f#1', 'b');
    expect(n.endFocusActivity).toHaveBeenCalledWith('a1');
    expect(n.startFocusActivity).toHaveBeenCalledTimes(2);
  });

  it('reports a refused activity and ignores extend', () => {
    const n = native(null);
    const c = new FocusSessionController(n);
    expect(c.start('f#0', 'a')).toBe(false);
    expect(c.active).toBe(false);
    c.extend(5);
    expect(n.updateFocusActivity).not.toHaveBeenCalled();
  });

  it('extends and ends the running activity', () => {
    const n = native();
    const c = new FocusSessionController(n);
    c.start('f#0', 'a');
    c.extend(99);
    expect(n.updateFocusActivity).toHaveBeenCalledWith('a1', 99);
    c.end();
    expect(n.endFocusActivity).toHaveBeenCalledWith('a1');
    expect(c.active).toBe(false);
  });
});
