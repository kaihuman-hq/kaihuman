/**
 * Opens the work panel in a window. Called straight from the shortcut or message handler, with
 * nothing awaited first: `sidePanel.open` only works while Chrome still counts the key press or
 * click as the user's, and an await before it would lose that.
 */
export function openWorkPanel(windowId: number | undefined): Promise<void> {
  if (windowId === undefined) {
    return Promise.reject(new Error('There is no window to open the work panel in.'));
  }
  return chrome.sidePanel.open({ windowId });
}
