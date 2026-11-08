import { useRouter } from 'expo-router';
import { setNotificationsEnabled } from '../src/notifications/index.js';
import { markReminderPromptShown } from '../src/notifications/soft-prompt.js';
import { ReminderPromptView } from '../src/views/reminder-prompt-view.js';

export default function Reminders() {
  const router = useRouter();
  // Marked before leaving, so the guard sees the card as done and lets Today through.
  const finish = () => {
    markReminderPromptShown();
    router.replace('/dashboard');
  };
  return (
    <ReminderPromptView
      onEnable={async () => {
        await setNotificationsEnabled(true);
        finish();
      }}
      onSkip={finish}
    />
  );
}
