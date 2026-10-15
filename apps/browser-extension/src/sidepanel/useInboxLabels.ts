import { useEffect, useState } from 'preact/hooks';
import { AI_CACHE_KEY, peek } from '../background/ai/cache.js';
import { INBOX_LABELS_CACHE, mutedKeys } from '../background/ai/labels.js';
import { AI_SETTINGS_KEY, type InboxLabel, readAiSettings } from '../background/ai/settings.js';

export interface InboxLabels {
  labels: InboxLabel[];
  /** row key → label name, as the worker last assigned them. */
  assigned: Record<string, string>;
  muted: Set<string>;
}

const EMPTY: InboxLabels = { labels: [], assigned: {}, muted: new Set() };

/** The user's inbox labels and the worker's cached assignments, re-read when either changes. */
export function useInboxLabels(): InboxLabels {
  const [state, setState] = useState<InboxLabels>(EMPTY);
  useEffect(() => {
    let live = true;
    const refresh = async () => {
      try {
        const { inboxLabels: labels } = await readAiSettings();
        const assigned = (await peek<Record<string, string>>(INBOX_LABELS_CACHE)) ?? {};
        if (live) setState({ labels, assigned, muted: mutedKeys(assigned, labels) });
      } catch {
        // Labels are optional: the inbox shows without them.
      }
    };
    const onChanged = (changes: Record<string, unknown>, area: string) => {
      if (area === 'local' && (AI_SETTINGS_KEY in changes || AI_CACHE_KEY in changes)) {
        void refresh();
      }
    };
    void refresh();
    chrome.storage.onChanged.addListener(onChanged);
    return () => {
      live = false;
      chrome.storage.onChanged.removeListener(onChanged);
    };
  }, []);
  return state;
}
