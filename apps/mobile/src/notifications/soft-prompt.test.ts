import { configureCoreStorage, InMemoryStorageAdapter } from '@kaihuman/core';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  markReminderPromptShown,
  reminderPromptShown,
  shouldShowReminderPrompt,
} from './soft-prompt.js';

describe('shouldShowReminderPrompt', () => {
  it('shows once, only while reminders are off', () => {
    expect(shouldShowReminderPrompt({ shown: false, enabled: false })).toBe(true);
    expect(shouldShowReminderPrompt({ shown: true, enabled: false })).toBe(false);
    expect(shouldShowReminderPrompt({ shown: false, enabled: true })).toBe(false);
  });
});

describe('reminder prompt flag', () => {
  beforeEach(() => configureCoreStorage(new InMemoryStorageAdapter()));
  it('is unseen until marked, then stays seen', () => {
    expect(reminderPromptShown()).toBe(false);
    markReminderPromptShown();
    expect(reminderPromptShown()).toBe(true);
  });
});
