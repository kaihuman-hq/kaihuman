import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { presentTile, type TileKind } from '../../components/widgets/tile-controllers.js';
import { Tile } from '../tile-view.js';
import { ADD_ENTRIES, AddEntrySheet, addEntryFor } from './add-entry.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 9, 12);
const LOG = 'actions.actionlog.md';

const renderTile = (props: { adding?: boolean; onAddingChange?: (open: boolean) => void } = {}) => {
  const onWrite = vi.fn();
  const tile = presentTile(LOG, '', NOW);
  if (!tile) throw new Error('no tile');
  render(<Tile path={LOG} tile={tile} content="" now={NOW} onWrite={onWrite} {...props} />);
  return onWrite;
};

describe('add entry registry', () => {
  it('covers every kind that adds entries, and only those', () => {
    expect(Object.keys(ADD_ENTRIES).sort()).toEqual(
      [
        'actionlog',
        'bookmarks',
        'budget',
        'commands',
        'consumption',
        'datacollection',
        'events',
        'prompts',
        'readitlater',
        'rss',
        'stocks',
        'timezones',
        'todos',
        'travel',
        'vacation',
      ].sort(),
    );
    for (const kind of ['habit', 'timetracking', 'boardoverview', 'palettesettings'] as TileKind[])
      expect(addEntryFor(kind, '', NOW)).toBeNull();
  });

  it('asks for a meter before a consumption file has one', () => {
    expect(addEntryFor('consumption', '', NOW)?.label).toBe('Add meter');
    expect(addEntryFor('consumption', 'created,Gas[unit:m³]\n2026-11-01,10', NOW)?.label).toBe(
      'Add reading',
    );
  });

  it('offers no ＋ for a collection without input columns', () => {
    expect(addEntryFor('datacollection', '', NOW)).toBeNull();
    expect(addEntryFor('datacollection', 'name::Weight,type::number', NOW)?.label).toBe(
      'Add entry',
    );
  });
});

describe('Tile ＋', () => {
  it('opens the add sheet from the card header, saves and closes', () => {
    const onWrite = renderTile();
    expect(screen.queryByTestId('add-entry-sheet')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add log entry' }));
    expect(screen.getByTestId('add-entry-sheet')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What did you do?'), { target: { value: 'Ran 5k' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log action' }));
    expect(onWrite.mock.calls[0]?.[1]).toContain('Ran 5k');
    expect(screen.queryByTestId('add-entry-sheet')).toBeNull();
  });

  it('keeps the sheet open with the error when the entry is rejected', () => {
    const onWrite = renderTile();
    fireEvent.click(screen.getByRole('button', { name: 'Add log entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Log action' }));
    expect(onWrite).not.toHaveBeenCalled();
    expect(screen.getByTestId('add-entry-sheet')).toBeTruthy();
  });

  it('cancel closes the sheet without writing', () => {
    const onWrite = renderTile();
    fireEvent.click(screen.getByRole('button', { name: 'Add log entry' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByTestId('add-entry-sheet')).toBeNull();
    expect(onWrite).not.toHaveBeenCalled();
  });

  it('leaves the ＋ to the screen header when the screen controls it', () => {
    const onAddingChange = vi.fn();
    renderTile({ adding: true, onAddingChange });
    expect(screen.queryByTestId('tile-add')).toBeNull();
    expect(screen.getByTestId('add-entry-sheet')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onAddingChange).toHaveBeenCalledWith(false);
  });

  it('has no inline add form at the bottom of the body', () => {
    renderTile();
    expect(screen.queryByLabelText('What did you do?')).toBeNull();
  });
});

describe('AddEntrySheet', () => {
  // Regression: a form that threw inside the sheet's Modal took the whole tile (or, outside a
  // tile boundary, the app) down. The sheet now keeps its own boundary for all kinds.
  it('shows a failing form as an error card inside the sheet, which still closes', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const onClose = vi.fn();
    const Broken = () => {
      throw new Error('form broke');
    };
    render(
      <AddEntrySheet
        entry={{ label: 'Add', title: 'New thing', Form: Broken }}
        ctx={{ content: '', now: NOW, apply: () => true, error: null, path: LOG }}
        onClose={onClose}
      />,
    );
    const sheet = within(screen.getByTestId('add-entry-sheet'));
    expect(sheet.getByText("Couldn't show this form")).toBeTruthy();
    expect(sheet.getByTestId('inline-error').textContent).toBe('form broke');
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('add sheet header (iOS HIG)', () => {
  const NOW2 = new Date(2026, 10, 9, 12);
  const open = (kind: TileKind, content: string, apply = vi.fn(() => true)) => {
    const entry = addEntryFor(kind, content, NOW2);
    if (!entry) throw new Error('no entry');
    const onClose = vi.fn();
    render(
      <AddEntrySheet
        entry={entry}
        ctx={{ content, now: NOW2, apply, error: null }}
        onClose={onClose}
      />,
    );
    return { apply, onClose };
  };

  it('puts Cancel left and a disabled confirm right, with no bottom Save button', () => {
    open('consumption', 'created,Gas[unit:m³]\n2026-11-01,10');
    const action = screen.getByTestId('form-header-action');
    expect(action.textContent).toBe('Save reading');
    expect(action.hasAttribute('disabled')).toBe(true);
    expect(screen.getAllByRole('button', { name: 'Save reading' })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Cancel' })).toHaveLength(1);
  });

  it('enables the confirm once the form is valid and saves through it', () => {
    const { apply, onClose } = open('consumption', 'created,Gas[unit:m³]\n2026-11-01,10');
    fireEvent.change(screen.getByLabelText(/Gas/), { target: { value: '12' } });
    const action = screen.getByTestId('form-header-action');
    expect(action.hasAttribute('disabled')).toBe(false);
    fireEvent.click(action);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });

  it('Cancel closes the sheet without writing', () => {
    const { apply, onClose } = open('consumption', 'created,Gas[unit:m³]\n2026-11-01,10');
    fireEvent.click(screen.getByTestId('form-header-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(apply).not.toHaveBeenCalled();
  });
});
