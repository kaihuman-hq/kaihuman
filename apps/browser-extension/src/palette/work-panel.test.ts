import { describe, expect, it, vi } from 'vitest';
import { openWorkPanelAction } from './work-panel';

describe('openWorkPanelAction', () => {
  it('asks the worker to open the panel and closes the palette', async () => {
    const send = vi.fn(async () => ({ success: true }));
    const action = openWorkPanelAction(send);
    expect(action.title).toBe('Open work panel');
    expect(action.closes).toBe(true);
    await expect(action.run?.([])).resolves.toBe('Opened the work panel');
    expect(send).toHaveBeenCalledWith({ type: 'OPEN_WORK_PANEL' });
  });

  it('passes the worker’s refusal on to the palette', async () => {
    const send = vi.fn(async () => {
      throw new Error('needs a user gesture');
    });
    await expect(openWorkPanelAction(send).run?.([])).rejects.toThrow('needs a user gesture');
  });
});
