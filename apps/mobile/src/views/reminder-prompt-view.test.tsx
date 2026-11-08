import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReminderPromptView } from './reminder-prompt-view.js';

afterEach(cleanup);

describe('ReminderPromptView', () => {
  it('Enable and Not now call their handlers', () => {
    const onEnable = vi.fn().mockResolvedValue(undefined);
    const onSkip = vi.fn();
    render(<ReminderPromptView onEnable={onEnable} onSkip={onSkip} />);
    expect(screen.getByText('Get reminded when todos are due')).toBeTruthy();
    fireEvent.click(screen.getByTestId('reminder-skip'));
    expect(onSkip).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByTestId('reminder-enable'));
    expect(onEnable).toHaveBeenCalledOnce();
  });
});
