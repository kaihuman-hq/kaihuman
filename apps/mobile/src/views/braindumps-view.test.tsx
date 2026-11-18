import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BraindumpsScreenController } from '../screens/braindumps-screen.js';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { BraindumpsView } from './braindumps-view.js';

afterEach(cleanup);

const controller = (contents: Record<string, string>) =>
  new BraindumpsScreenController({
    files: {
      refresh: async () => {},
      tree: () => Object.keys(contents).map((path) => ({ path, type: 'blob' })),
      read: async (p: string) => contents[p] ?? '',
    } as unknown as ContentFiles,
  });

describe('BraindumpsView', () => {
  it('opens a braindump and starts a new one', async () => {
    const onOpen = vi.fn();
    const onNew = vi.fn();
    render(
      <BraindumpsView
        controller={controller({ '.kh/braindumps/9.md': 'Plan the trip' })}
        onOpen={onOpen}
        onNew={onNew}
      />,
    );
    fireEvent.click(await screen.findByText('Plan the trip'));
    expect(onOpen).toHaveBeenCalledWith('.kh/braindumps/9.md');
    fireEvent.click(screen.getByTestId('braindump-new'));
    expect(onNew).toHaveBeenCalledOnce();
  });

  it('offers a new braindump when there are none', async () => {
    const onNew = vi.fn();
    render(<BraindumpsView controller={controller({})} onOpen={vi.fn()} onNew={onNew} />);
    fireEvent.click(await screen.findByText('New braindump'));
    expect(onNew).toHaveBeenCalledOnce();
  });
});
