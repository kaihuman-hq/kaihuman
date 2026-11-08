import { getCoreStorage } from '@kaihuman/core';

const KEY = 'kh_mobile_reminder_prompt_shown';

/** The card is offered once, and never to someone who already turned reminders on. */
export const shouldShowReminderPrompt = (s: { shown: boolean; enabled: boolean }): boolean =>
  !s.shown && !s.enabled;

export const reminderPromptShown = (): boolean => {
  try {
    return getCoreStorage().getItem(KEY) === '1';
  } catch {
    return false;
  }
};

export const markReminderPromptShown = (): void => {
  try {
    getCoreStorage().setItem(KEY, '1');
  } catch {
    // Worst case the card shows again next launch; not worth failing the tap over.
  }
};
