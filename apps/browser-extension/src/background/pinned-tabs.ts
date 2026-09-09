/** Repo file holding every saved group of pinned tabs. */
export const PINNED_TABS_PATH = '.kh/browser.pinnedtabs.json';

/** A window counts as running a group once more than this share of the group is pinned in it. */
export const GROUP_MATCH_THRESHOLD = 0.5;

const LEGACY_GROUP_ID = 'default';
const LEGACY_GROUP_NAME = 'Pinned tabs';

export interface PinnedTab {
  url: string;
  title: string;
}

export interface PinnedTabGroup {
  id: string;
  name: string;
  createdAt: string;
  tabs: PinnedTab[];
}

export interface PinnedTabsConfig {
  groups: PinnedTabGroup[];
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

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function parseTabs(raw: unknown[]): PinnedTab[] {
  return raw
    .filter((tab): tab is PinnedTab => typeof (tab as PinnedTab)?.url === 'string')
    .map((tab) => ({ url: tab.url, title: asString(tab.title) }));
}

function parseGroup(raw: unknown, index: number): PinnedTabGroup {
  const group = raw as Partial<PinnedTabGroup>;
  if (!group?.id) {
    throw new Error(`${PINNED_TABS_PATH}: group ${index} is missing an "id"`);
  }
  if (!Array.isArray(group.tabs)) {
    throw new Error(`${PINNED_TABS_PATH}: group "${group.id}" is missing a "tabs" array`);
  }
  return {
    id: group.id,
    name: asString(group.name) || group.id,
    createdAt: asString(group.createdAt),
    tabs: parseTabs(group.tabs),
  };
}

export function parsePinnedTabs(content: string): PinnedTabsConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`${PINNED_TABS_PATH} is not valid JSON`);
  }
  const root = parsed as { groups?: unknown; tabs?: unknown; updatedAt?: unknown };
  const updatedAt = asString(root?.updatedAt);

  // The first release stored a single unnamed `tabs` array. Fold it into one group so
  // files written by that version keep working.
  if (root?.groups === undefined && Array.isArray(root?.tabs)) {
    return {
      groups: [
        {
          id: LEGACY_GROUP_ID,
          name: LEGACY_GROUP_NAME,
          createdAt: updatedAt,
          tabs: parseTabs(root.tabs),
        },
      ],
      updatedAt,
    };
  }

  if (!Array.isArray(root?.groups)) {
    throw new Error(`${PINNED_TABS_PATH} is missing a "groups" array`);
  }
  return { groups: root.groups.map(parseGroup), updatedAt };
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

function missingGroup(groupId: string): Error {
  return new Error(`Tab group "${groupId}" no longer exists in ${PINNED_TABS_PATH}`);
}

export function findGroup(config: PinnedTabsConfig, groupId: string): PinnedTabGroup {
  const group = config.groups.find((candidate) => candidate.id === groupId);
  if (!group) throw missingGroup(groupId);
  return group;
}

/** Shared by saving a new group and renaming an existing one. */
export function normalizeGroupName(name: string | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) throw new Error('Give the tab group a name');
  return trimmed;
}

/** Replaces the group carrying the same id, or appends it when it is new. */
export function putGroup(
  config: PinnedTabsConfig,
  group: PinnedTabGroup,
  updatedAt: string,
): PinnedTabsConfig {
  const exists = config.groups.some((candidate) => candidate.id === group.id);
  return {
    groups: exists
      ? config.groups.map((candidate) => (candidate.id === group.id ? group : candidate))
      : [...config.groups, group],
    updatedAt,
  };
}

export function removeGroup(
  config: PinnedTabsConfig,
  groupId: string,
  updatedAt: string,
): PinnedTabsConfig {
  const groups = config.groups.filter((group) => group.id !== groupId);
  if (groups.length === config.groups.length) throw missingGroup(groupId);
  return { groups, updatedAt };
}

/**
 * Moves a group one slot towards the front (offset -1) or back (offset 1). Returns the config
 * untouched when the group is already at that end, so callers can skip an empty write.
 */
export function moveGroup(
  config: PinnedTabsConfig,
  groupId: string,
  offset: number,
  updatedAt: string,
): PinnedTabsConfig {
  const index = config.groups.findIndex((group) => group.id === groupId);
  if (index === -1) throw missingGroup(groupId);
  const target = index + offset;
  if (target < 0 || target >= config.groups.length) return config;
  const groups = [...config.groups];
  [groups[index], groups[target]] = [groups[target], groups[index]];
  return { groups, updatedAt };
}

/** Group tabs that are safe to open and not pinned in the window yet. */
export function tabsToOpen(stored: PinnedTab[], pinnedUrls: string[]): PinnedTab[] {
  const seen = new Set(pinnedUrls.map(normalizeUrl));
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

/**
 * Pinned tabs of the window that the group does not contain. Loading a group makes the
 * window's pinned set match it, so these get unpinned — never closed, so nothing is lost.
 */
export function tabsToUnpin<T extends { url?: string }>(pinned: T[], stored: PinnedTab[]): T[] {
  const wanted = new Set(stored.map((tab) => normalizeUrl(tab.url)));
  return pinned.filter((tab) => !wanted.has(normalizeUrl(tab.url ?? '')));
}

/**
 * Best guess at which group a window is running, from its pinned tabs alone. Used when the
 * extension has no record of the last load — window ids do not survive a browser restart.
 * Ties keep the earlier group so the answer is stable.
 */
export function matchGroup(groups: PinnedTabGroup[], pinnedUrls: string[]): string | null {
  const open = new Set(pinnedUrls.map(normalizeUrl));
  let bestId: string | null = null;
  let bestScore = 0;
  for (const group of groups) {
    if (group.tabs.length === 0) continue;
    const hits = group.tabs.filter((tab) => open.has(normalizeUrl(tab.url))).length;
    const score = hits / group.tabs.length;
    if (score > bestScore) {
      bestScore = score;
      bestId = group.id;
    }
  }
  return bestScore > GROUP_MATCH_THRESHOLD ? bestId : null;
}
