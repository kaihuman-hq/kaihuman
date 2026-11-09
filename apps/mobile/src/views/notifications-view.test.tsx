import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_SETTINGS } from '../notifications/planner.js';
import { NotificationsView } from './notifications-view.js';

afterEach(cleanup);

const props = (over: Partial<Parameters<typeof NotificationsView>[0]> = {}) => ({
  settings: { ...DEFAULT_NOTIFICATION_SETTINGS, enabled: true },
  onChange: vi.fn(),
  onToggleEnabled: vi.fn(async () => 'granted' as const),
  onOpenSettings: vi.fn(),
  ...over,
});

describe('NotificationsView', () => {
  it('shows only the master toggle while reminders are off', () => {
    render(<NotificationsView {...props({ settings: DEFAULT_NOTIFICATION_SETTINGS })} />);
    expect(screen.getByLabelText('Reminders')).toBeTruthy();
    expect(screen.queryByText('Overdue summary')).toBeNull();
  });

  it('saves chip and kind changes', () => {
    const p = props();
    render(<NotificationsView {...p} />);
    fireEvent.click(screen.getByText('30 min'));
    expect(p.onChange).toHaveBeenLastCalledWith({ ...p.settings, minutesBefore: 30 });
    fireEvent.click(screen.getByText('07:00'));
    expect(p.onChange).toHaveBeenLastCalledWith({ ...p.settings, morningTime: '07:00' });
    fireEvent.click(screen.getByLabelText('Overdue summary'));
    expect(p.onChange).toHaveBeenLastCalledWith({
      ...p.settings,
      kinds: { ...p.settings.kinds, overdue: false },
    });
  });

  it('offers system settings when permission is denied', async () => {
    const p = props({
      settings: DEFAULT_NOTIFICATION_SETTINGS,
      onToggleEnabled: vi.fn(async () => 'denied' as const),
    });
    render(<NotificationsView {...p} />);
    fireEvent.click(screen.getByLabelText('Reminders'));
    await waitFor(() => expect(screen.getByTestId('notifications-denied')).toBeTruthy());
    fireEvent.click(screen.getByTestId('notifications-open-settings'));
    expect(p.onOpenSettings).toHaveBeenCalled();
  });
});
