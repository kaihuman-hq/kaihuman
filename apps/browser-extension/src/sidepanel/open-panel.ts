import { useEffect, useState } from 'preact/hooks';

/**
 * A click handler that opens the side panel of this window. `sidePanel.open` only works inside
 * the user gesture, and an await before it can lose that, so the window is resolved on mount and
 * the click calls it synchronously. `after` runs once the open has settled.
 */
export function useOpenSidePanel(after?: () => void): () => void {
  const [windowId, setWindowId] = useState<number>();
  useEffect(() => {
    let live = true;
    chrome.windows
      .getCurrent()
      .then((window) => {
        if (live) setWindowId(window.id);
      })
      .catch((error) => console.warn('kaihuman: finding this window failed', error));
    return () => {
      live = false;
    };
  }, []);
  return () => {
    if (windowId === undefined) return;
    chrome.sidePanel
      .open({ windowId })
      .catch((error) => console.warn('kaihuman: opening the side panel failed', error))
      .finally(() => after?.());
  };
}
