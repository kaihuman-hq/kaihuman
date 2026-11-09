import {
  notificationSettings,
  openSystemSettings,
  setNotificationsEnabled,
  updateNotificationSettings,
} from '../../../src/notifications/index.js';
import { NotificationsView } from '../../../src/views/notifications-view.js';
import { useSignalValue } from '../../../src/views/use-signal.js';

export default function Notifications() {
  const settings = useSignalValue(notificationSettings);
  return (
    <NotificationsView
      settings={settings}
      onChange={(next) => void updateNotificationSettings(() => next)}
      onToggleEnabled={setNotificationsEnabled}
      onOpenSettings={() => void openSystemSettings()}
    />
  );
}
