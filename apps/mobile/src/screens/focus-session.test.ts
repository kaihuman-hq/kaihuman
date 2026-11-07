import { describe, expect, it, vi } from 'vitest';
import {
  FOCUS_MINUTES,
  FocusSessionController,
  NOTIFICATIONS_DENIED_MESSAGE,
} from './focus-session.js';

const native = (id: string | null = 'a1') => ({
  startFocusActivity: vi.fn(() => id),
  updateFocusActivity: vi.fn(),
  endFocusActivity: vi.fn(),
});

describe('FocusSessionController', () => {
  it('is unavailable without the native methods (Android, Expo Go)', async () => {
    for (const n of [null, undefined, {}]) {
      const c = new FocusSessionController(n);
      expect(c.available).toBe(false);
      expect(await c.start('f#0', 'x')).toEqual({ started: false, reason: 'unsupported' });
      expect(() => {
        c.extend(1);
        c.end();
      }).not.toThrow();
    }
  });

  it('starts a 25 minute activity for the todo', async () => {
    const n = native();
    const c = new FocusSessionController(n);
    expect(c.available).toBe(true);
    expect(await c.start('f#0', 'write')).toEqual({ started: true });
    expect(n.startFocusActivity).toHaveBeenCalledWith('f#0', 'write', FOCUS_MINUTES);
    expect(FOCUS_MINUTES).toBe(25);
    expect(c.active).toBe(true);
  });

  it('ends the previous activity before starting another', async () => {
    const n = native();
    const c = new FocusSessionController(n);
    await c.start('f#0', 'a');
    await c.start('f#1', 'b');
    expect(n.endFocusActivity).toHaveBeenCalledWith('a1');
    expect(n.startFocusActivity).toHaveBeenCalledTimes(2);
  });

  it('reports a refused activity and ignores extend', async () => {
    const n = native(null);
    const c = new FocusSessionController(n);
    expect(await c.start('f#0', 'a')).toEqual({ started: false, reason: 'refused' });
    expect(c.active).toBe(false);
    c.extend(5);
    expect(n.updateFocusActivity).not.toHaveBeenCalled();
  });

  it('extends and ends the running activity', async () => {
    const n = native();
    const c = new FocusSessionController(n);
    await c.start('f#0', 'a');
    c.extend(99);
    expect(n.updateFocusActivity).toHaveBeenCalledWith('a1', 99);
    c.end();
    expect(n.endFocusActivity).toHaveBeenCalledWith('a1');
    expect(c.active).toBe(false);
  });

  it('asks for notification permission first and starts when granted', async () => {
    const order: string[] = [];
    const n = {
      ...native(),
      requestNotificationPermission: vi.fn(async () => {
        order.push('ask');
        return true;
      }),
    };
    n.startFocusActivity.mockImplementation(() => {
      order.push('start');
      return 'a1';
    });
    const c = new FocusSessionController(n);
    expect(await c.start('f#0', 'a')).toEqual({ started: true });
    expect(order).toEqual(['ask', 'start']);
  });

  it('does not start when notifications are denied, and keeps the running session', async () => {
    const n = { ...native(), requestNotificationPermission: vi.fn(async () => false) };
    const c = new FocusSessionController(n);
    expect(await c.start('f#0', 'a')).toEqual({ started: false, reason: 'notifications-denied' });
    expect(n.startFocusActivity).not.toHaveBeenCalled();
    expect(c.active).toBe(false);
    expect(NOTIFICATIONS_DENIED_MESSAGE).toMatch(/Allow notifications/);
    expect(NOTIFICATIONS_DENIED_MESSAGE).toMatch(/Settings/);
  });
});
