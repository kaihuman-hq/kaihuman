import type { PaletteAction } from '@kaihuman/palette';

/**
 * The palette's way into the work side panel; the worker opens it in the palette's window. Sent
 * outside the shared palette protocol, which the desktop palette speaks too and has no side panel.
 */
export const openWorkPanelAction = (
  send: (message: object) => Promise<unknown>,
): PaletteAction => ({
  id: 'open-work-panel',
  title: 'Open work panel',
  subtitle: 'What waits on you in GitHub, your open PRs and your streams',
  closes: true,
  run: async () => {
    await send({ type: 'OPEN_WORK_PANEL' });
    return 'Opened the work panel';
  },
});
