import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KanbanBoardController } from '../screens/kanban-board.js';
import type { RepoFiles } from '../screens/quick-capture.js';
import { initialSyncStatus, syncRevision, syncStatus } from '../sync/status.js';
import { Screen, Text } from '../ui/index.js';
import { KanbanView } from './kanban-view.js';

afterEach(() => {
  cleanup();
  syncStatus.value = initialSyncStatus;
});

const files: RepoFiles = {
  appFolder: () => '.kh',
  exists: () => false,
  todoPaths: () => [],
  read: async () => null,
  write: async () => {},
};

describe('sync revision', () => {
  it('re-runs a view load when the revision bumps, without a loading skeleton', async () => {
    const controller = new KanbanBoardController(files);
    const load = vi.spyOn(controller, 'load');
    render(<KanbanView controller={controller} />);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await act(async () => {
      syncRevision.value += 1;
    });
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));
  });
});

describe('Screen sync status', () => {
  it('shows the error banner by default and hides it with syncStatus={false}', () => {
    syncStatus.value = { ...initialSyncStatus, phase: 'error', error: 'Rate limited' };
    const { rerender } = render(
      <Screen>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.getByText('Rate limited')).toBeTruthy();
    rerender(
      <Screen syncStatus={false}>
        <Text>body</Text>
      </Screen>,
    );
    expect(screen.queryByText('Rate limited')).toBeNull();
  });
});
