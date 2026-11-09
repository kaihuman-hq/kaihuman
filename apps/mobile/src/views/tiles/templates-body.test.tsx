import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Share } from 'react-native';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Ctx } from './bodies.js';
import { Templates } from './templates-body.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const ctx = (content: string, apply: Ctx['apply'] = vi.fn(() => true)): Ctx => ({
  content,
  now: new Date(2026, 10, 8, 12),
  apply,
  error: null,
});

const PROMPTS = `# Prompts

## Review #work
Review {{file}} for bugs

## Poem #fun
Write a poem
`;

const COMMANDS = `# Commands

## Serve #dev
\`\`\`sh
serve --port {{port}}
\`\`\`
`;

describe('Templates', () => {
  it('filters by search text and by tag chip', () => {
    render(<Templates ctx={ctx(PROMPTS)} kind="prompt" />);
    expect(screen.getByText('Review')).toBeTruthy();
    expect(screen.getByText('Poem')).toBeTruthy();

    fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'bugs' } });
    expect(screen.queryByText('Poem')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching prompts.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search prompts'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Filter by fun' }));
    expect(screen.queryByText('Review')).toBeNull();
    expect(screen.getByText('Poem')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Filter by fun' }));
    expect(screen.getByText('Review')).toBeTruthy();
  });

  it('shares the interpolated command text', () => {
    const share = vi
      .spyOn(Share, 'share')
      .mockResolvedValue({ action: 'sharedAction', activityType: undefined });
    render(<Templates ctx={ctx(COMMANDS)} kind="command" />);
    fireEvent.click(screen.getByText('Serve'));
    fireEvent.change(screen.getByLabelText('Serve: port'), { target: { value: '8080' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy Serve' }));
    expect(share).toHaveBeenCalledWith({ message: 'serve --port 8080' });
  });

  it('saves a new prompt with its tags', () => {
    const apply = vi.fn(() => true);
    render(<Templates ctx={ctx(PROMPTS, apply)} kind="prompt" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add prompt' }));
    fireEvent.change(screen.getByLabelText('New prompt title'), { target: { value: 'Haiku' } });
    fireEvent.change(screen.getByLabelText('New prompt text'), { target: { value: 'Write one' } });
    fireEvent.change(screen.getByLabelText('New prompt tags'), { target: { value: '#fun, art' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save prompt' }));
    const result = (apply.mock.calls[0] as unknown as [{ ok: true; content: string }])[0];
    expect(result.content).toContain('## Haiku #fun #art');
  });
});
