import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ActionLogFull } from './actionlog-full.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 9, 12, 0, 0);
const FILE = `---\n---\n\n# Action Log\n\n- 2026-11-08 08:00:00 Ran 5k #run\n- 2026-11-09 07:30:00 Wrote notes\n- 2026-11-09 09:15:00 Read book #read\n`;

const setup = (content = FILE) => {
  const onWrite = vi.fn();
  render(<ActionLogFull content={content} now={NOW} onWrite={onWrite} />);
  return onWrite;
};
const written = (onWrite: ReturnType<typeof vi.fn>): string => onWrite.mock.calls[0]?.[0] as string;

describe('ActionLogFull', () => {
  it('lists newest first under day headers with times and tag chips', () => {
    setup();
    const headers = screen.getAllByRole('heading').map((h) => h.textContent);
    expect(headers).toEqual(['Today', 'Yesterday']);
    const texts = screen.getAllByText(/^\d\d:\d\d$/).map((t) => t.textContent);
    expect(texts).toEqual(['09:15', '07:30', '08:00']);
    expect(screen.getByText('Read book')).toBeTruthy();
    expect(screen.getAllByText('#read')).toHaveLength(2); // filter chip + entry badge
  });

  it('puts the entry field before the log and logs on return', () => {
    const onWrite = setup();
    const field = screen.getByLabelText('What did you do?');
    expect(field.compareDocumentPosition(screen.getByText('Today'))).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    fireEvent.change(field, { target: { value: 'Stretched #health' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(written(onWrite)).toContain('2026-11-09 12:00:00 Stretched #health');
  });

  it('rejects an empty entry', () => {
    const onWrite = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Log action' }));
    expect(onWrite).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toContain('Enter what you did');
  });

  it('filters by search text and tag', () => {
    setup();
    fireEvent.change(screen.getByLabelText('Search log'), { target: { value: 'notes' } });
    expect(screen.queryByText('Read book')).toBeNull();
    expect(screen.getByText('Wrote notes')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search log'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching entries.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search log'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Filter by run' }));
    expect(screen.getByText('Ran 5k')).toBeTruthy();
    expect(screen.queryByText('Wrote notes')).toBeNull();
  });

  it('edits an entry in the top field, keeping its time', () => {
    const onWrite = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Wrote notes, 07:30' }));
    const field = screen.getByLabelText('Edit entry') as HTMLInputElement;
    expect(field.value).toBe('Wrote notes');
    fireEvent.change(field, { target: { value: 'Wrote essay #writing' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save entry' }));
    expect(written(onWrite)).toContain('2026-11-09 07:30:00 Wrote essay #writing');
    expect(written(onWrite)).not.toContain('Wrote notes');
  });

  it('cancels an edit', () => {
    const onWrite = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Wrote notes, 07:30' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel edit' }));
    expect(screen.getByLabelText('What did you do?')).toBeTruthy();
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('deletes an entry from the swipe actions', () => {
    const onWrite = setup();
    const row = screen.getByTestId('log-2026-11-09 07:30:00-swipeable');
    fireEvent.click(within(row).getByTestId('swipe-action-Delete'));
    expect(written(onWrite)).not.toContain('Wrote notes');
    expect(written(onWrite)).toContain('Read book');
  });

  it('shows the empty state', () => {
    setup('');
    expect(screen.getByText('Nothing logged yet.')).toBeTruthy();
  });
});
