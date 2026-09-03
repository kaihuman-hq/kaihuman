/** Repo file mirroring the pinned tabs of the browser window. */
export const PINNED_TABS_PATH = '.kh/browser.pinnedtabs.json';

export interface PinnedTab {
  url: string;
  title: string;
}

export interface PinnedTabsConfig {
  tabs: PinnedTab[];
  updatedAt: string;
}

/**
 * The repo file is remote input, so only allow schemes Chrome can safely navigate
 * to — `javascript:` or `file:` entries must never be turned into a tab.
 */
export function isOpenableUrl(url: string): boolean {
  try {
    const { protocol } = new URL(url);
    return protocol === 'http:' || protocol === 'https:';
  } catch {
    return false;
  }
}

/** Chrome canonicalises URLs when it opens them (e.g. appends a trailing slash),
 * so compare canonical forms to keep repeated loads from duplicating tabs. */
export function normalizeUrl(url: string): string {
  try {
    return new URL(url).href;
  } catch {
    return url;
  }
}

export function parsePinnedTabs(content: string): PinnedTabsConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${PINNED_TABS_PATH} is not valid JSON`);
  }
  const tabs = (parsed as { tabs?: unknown })?.tabs;
  if (!Array.isArray(tabs)) {
    throw new Error(`${PINNED_TABS_PATH} is missing a "tabs" array`);
  }
  const updatedAt = (parsed as { updatedAt?: unknown }).updatedAt;
  return {
    tabs: tabs
      .filter((tab): tab is PinnedTab => typeof (tab as PinnedTab)?.url === 'string')
      .map((tab) => ({ url: tab.url, title: typeof tab.title === 'string' ? tab.title : '' })),
    updatedAt: typeof updatedAt === 'string' ? updatedAt : '',
  };
}

export function serializePinnedTabs(config: PinnedTabsConfig): string {
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** Projects `chrome.tabs.Tab` objects onto the stored shape, dropping unopenable ones. */
export function toPinnedTabs(tabs: { url?: string; title?: string }[]): PinnedTab[] {
  return tabs
    .filter((tab): tab is { url: string; title?: string } => !!tab.url && isOpenableUrl(tab.url))
    .map((tab) => ({ url: tab.url, title: tab.title ?? '' }));
}

/** Stored tabs that are safe to open and not already present in the window. */
export function tabsToOpen(stored: PinnedTab[], openUrls: string[]): PinnedTab[] {
  const seen = new Set(openUrls.map(normalizeUrl));
  const result: PinnedTab[] = [];
  for (const tab of stored) {
    if (!isOpenableUrl(tab.url)) continue;
    const key = normalizeUrl(tab.url);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(tab);
  }
  return result;
}
