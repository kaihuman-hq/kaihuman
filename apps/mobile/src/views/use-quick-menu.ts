import { useCallback, useMemo, useState } from 'react';
import { Alert } from 'react-native';
import { githubContentFiles } from '../screens/file-editor-screen.js';
import { updateLoadedTile, useLoadedTiles } from '../screens/loaded-tiles.js';
import {
  CAPTURE_ACTIONS,
  lastAction,
  loadUsage,
  performQuickAction,
  type QuickMenuAction,
  recordUse,
  saveUsage,
  trackActions,
  usageCaption,
  usesToday,
} from '../screens/quick-menu.js';
import { haptics } from '../ui/index.js';
import { glanceForFile } from './glance-for-file.js';
import type { QuickMenuProps } from './quick-menu.js';

/** State and actions behind the ＋ tab and its menu; `navigate` is the router push. */
export function useQuickMenu(navigate: (href: string) => void) {
  const files = useLoadedTiles();
  const [open, setOpen] = useState(false);
  const [usage, setUsage] = useState(() => loadUsage(new Date()));
  // Glances depend on the clock (habit done today, timer running); re-read on each open.
  const [openedAt, setOpenedAt] = useState(() => new Date());

  const track = useMemo(
    () => trackActions(files, (f) => glanceForFile(f, openedAt)),
    [files, openedAt],
  );
  const last = lastAction(usage, [...CAPTURE_ACTIONS, ...track]);

  const run = useCallback(
    async (action: QuickMenuAction) => {
      setOpen(false);
      const now = new Date();
      const outcome = await performQuickAction(action, {
        navigate,
        files: githubContentFiles,
        glanceFor: (f) => glanceForFile(f, now),
        now,
      });
      if (outcome.kind === 'failed') {
        haptics.error();
        Alert.alert(`Could not run “${action.label}”`, outcome.error);
        return;
      }
      if (outcome.kind === 'written') {
        updateLoadedTile(outcome.path, outcome.content);
        haptics.success();
      }
      setUsage((prev) => {
        const next = recordUse(prev, action.id, now);
        saveUsage(next);
        return next;
      });
    },
    [navigate],
  );

  const toggle = useCallback(() => {
    setOpen((was) => {
      if (!was) setOpenedAt(new Date());
      return !was;
    });
  }, []);
  const close = useCallback(() => setOpen(false), []);
  /** Long-press ＋: the last action, or the menu when there is none yet. */
  const repeatLast = useCallback(() => {
    if (last) void run(last);
    else toggle();
  }, [last, run, toggle]);

  const menu: Omit<QuickMenuProps, 'bottomOffset'> = {
    open,
    capture: CAPTURE_ACTIONS,
    track,
    last: last && { action: last, caption: usageCaption(usesToday(usage, last.id, new Date())) },
    onRun: (a) => void run(a),
    onClose: close,
  };
  return { open, toggle, close, repeatLast, menu };
}
