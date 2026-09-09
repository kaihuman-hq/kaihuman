import { type Message } from '../types';
import {
  findGroup,
  matchGroup,
  normalizeGroupName,
  PINNED_TABS_PATH,
  type PinnedTabGroup,
  type PinnedTabsConfig,
  parsePinnedTabs,
  putGroup,
  removeGroup,
  serializePinnedTabs,
  tabsToOpen,
  tabsToUnpin,
  toPinnedTabs,
} from './pinned-tabs';

console.log('LifeOS Extension: Background script loaded');

// Keep the service worker alive to prevent the HMR port (crx-client-port.js)
// from disconnecting. Chrome suspends MV3 service workers after ~30s of
// inactivity; the alarm wakes it up periodically so the Vite HMR connection
// stays intact during development.
chrome.alarms.create('swKeepAlive', { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'swKeepAlive') {
    // No-op: waking the worker is sufficient.
  }
});

// Initialize Context Menu
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: 'lifosy-save-knowledge',
    title: 'Add to Knowledge Base',
    contexts: ['selection'],
  });
});

// Handle Context Menu Clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lifosy-save-knowledge' && info.selectionText) {
    saveToKnowledgeBase(info.selectionText, tab?.url || '', tab?.title || '');
  }
});

// Add comprehensive GitHub API helper
async function githubUpsertFile(token: string, repoUrl: string, filePath: string, newContentLines: string, position: 'top' | 'bottom' = 'bottom') {
  const url = `https://api.github.com/repos/${repoUrl}/contents/${filePath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };

  let fileSha = '';
  let currentContent = '';

  try {
    const getRes = await fetch(url, { headers });
    if (getRes.ok) {
      const data = await getRes.json();
      fileSha = data.sha;
      // Decode base64
      currentContent = decodeURIComponent(escape(atob(data.content || '')));
    } else if (getRes.status === 404) {
      // File doesn't exist yet, we'll create it
      currentContent = '';
    } else {
      throw new Error(`Failed to get file: ${getRes.statusText}`);
    }

    const updatedContent = currentContent
      ? (position === 'top' ? `${newContentLines}\n\n${currentContent}` : `${currentContent}\n\n${newContentLines}`)
      : newContentLines;

    // Encode base64
    const newBase64 = btoa(unescape(encodeURIComponent(updatedContent)));

    const putRes = await fetch(url, {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        message: `Append to ${filePath} via Extension`,
        content: newBase64,
        sha: fileSha || undefined,
      }),
    });

    if (!putRes.ok) {
      throw new Error(`Failed to update file: ${putRes.statusText}`);
    }
  } catch (error) {
    console.error('githubAppendToFile Error:', error);
    throw error;
  }
}

// GitHub stores file content as base64; `atob`/`btoa` only speak latin-1, so round-trip
// through UTF-8 bytes to keep non-ASCII tab titles intact.
function decodeBase64(value: string): string {
  const binary = atob(value.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
}

function encodeBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

// Unlike githubUpsertFile this replaces the file wholesale, which is what a
// snapshot-style JSON document needs.
async function githubReadFile(
  token: string,
  repoUrl: string,
  filePath: string,
): Promise<{ content: string; sha: string } | null> {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Failed to read ${filePath}: ${res.statusText}`);
  const data = await res.json();
  return { content: decodeBase64(data.content || ''), sha: data.sha };
}

async function githubWriteFile(
  token: string,
  repoUrl: string,
  filePath: string,
  content: string,
  sha?: string,
) {
  const res = await fetch(`https://api.github.com/repos/${repoUrl}/contents/${filePath}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.v3+json' },
    body: JSON.stringify({
      message: `Update ${filePath} via Extension`,
      content: encodeBase64(content),
      sha,
    }),
  });
  if (!res.ok) throw new Error(`Failed to write ${filePath}: ${res.statusText}`);
}

const EMPTY_CONFIG: PinnedTabsConfig = { groups: [], updatedAt: '' };

// Which group each window is running. Session storage is wiped when Chrome restarts,
// exactly like the window ids it is keyed by, so a stale entry can never point at the
// wrong group; after a restart we fall back to matching the window's pinned tabs.
async function readActiveGroups(): Promise<Record<string, string>> {
  const stored = await chrome.storage.session.get('activeGroups');
  return (stored.activeGroups as Record<string, string> | undefined) ?? {};
}

async function rememberActiveGroup(windowId: number, groupId: string) {
  const activeGroups = await readActiveGroups();
  await chrome.storage.session.set({ activeGroups: { ...activeGroups, [windowId]: groupId } });
}

async function recallActiveGroup(windowId: number): Promise<string | undefined> {
  return (await readActiveGroups())[windowId];
}

async function readConfig(token: string, repo: string) {
  const file = await githubReadFile(token, repo, PINNED_TABS_PATH);
  return { config: file ? parsePinnedTabs(file.content) : EMPTY_CONFIG, sha: file?.sha };
}

async function writeConfig(token: string, repo: string, config: PinnedTabsConfig, sha?: string) {
  await githubWriteFile(token, repo, PINNED_TABS_PATH, serializePinnedTabs(config), sha);
}

/** The window the popup belongs to, plus its pinned tabs in one round-trip. */
async function currentWindow() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const pinned = tabs.filter((tab) => tab.pinned);
  return { windowId: tabs[0]?.windowId, pinned };
}

async function activeGroupId(
  groups: PinnedTabGroup[],
  windowId: number | undefined,
  pinnedUrls: string[],
): Promise<string | null> {
  const remembered = windowId === undefined ? undefined : await recallActiveGroup(windowId);
  if (remembered && groups.some((group) => group.id === remembered)) return remembered;
  return matchGroup(groups, pinnedUrls);
}

async function listPinnedTabGroups(token: string, repo: string) {
  const { config } = await readConfig(token, repo);
  const { windowId, pinned } = await currentWindow();
  const activeId = await activeGroupId(
    config.groups,
    windowId,
    pinned.map((tab) => tab.url || ''),
  );
  return {
    groups: config.groups.map((group) => ({
      id: group.id,
      name: group.name,
      createdAt: group.createdAt,
      tabCount: group.tabs.length,
    })),
    activeId,
  };
}

/** Makes the window's pinned set match the group: unpin what is not in it, open what is missing. */
async function loadPinnedTabGroup(token: string, repo: string, groupId: string) {
  const { config } = await readConfig(token, repo);
  const group = findGroup(config, groupId);
  const { windowId, pinned } = await currentWindow();

  const stale = tabsToUnpin(pinned, group.tabs);
  for (const tab of stale) {
    if (tab.id !== undefined) await chrome.tabs.update(tab.id, { pinned: false });
  }
  const missing = tabsToOpen(
    group.tabs,
    pinned.filter((tab) => !stale.includes(tab)).map((tab) => tab.url || ''),
  );
  for (const tab of missing) {
    await chrome.tabs.create({ url: tab.url, pinned: true, active: false });
  }

  if (windowId !== undefined) await rememberActiveGroup(windowId, group.id);
  return { opened: missing.length, unpinned: stale.length, name: group.name };
}

/**
 * Writes the window's pinned tabs into `groupId`, or into a new group called `name`.
 * Updating keeps the group's id, name and createdAt so history is not rewritten.
 */
async function savePinnedTabGroup(
  token: string,
  repo: string,
  groupId: string | undefined,
  name: string | undefined,
) {
  const { config, sha } = await readConfig(token, repo);
  const { windowId, pinned } = await currentWindow();
  const tabs = toPinnedTabs(pinned);
  const now = new Date().toISOString();

  let group: PinnedTabGroup;
  if (groupId) {
    group = { ...findGroup(config, groupId), tabs };
  } else {
    group = { id: crypto.randomUUID(), name: normalizeGroupName(name), createdAt: now, tabs };
  }

  await writeConfig(token, repo, putGroup(config, group, now), sha);
  if (windowId !== undefined) await rememberActiveGroup(windowId, group.id);
  return { count: tabs.length, name: group.name };
}

async function renamePinnedTabGroup(token: string, repo: string, groupId: string, name: string) {
  const { config, sha } = await readConfig(token, repo);
  const group = { ...findGroup(config, groupId), name: normalizeGroupName(name) };
  await writeConfig(token, repo, putGroup(config, group, new Date().toISOString()), sha);
  return { name: group.name };
}

/** Only forgets the group; the window keeps whatever it currently has pinned. */
async function deletePinnedTabGroup(token: string, repo: string, groupId: string) {
  const { config, sha } = await readConfig(token, repo);
  const { name } = findGroup(config, groupId);
  await writeConfig(token, repo, removeGroup(config, groupId, new Date().toISOString()), sha);
  return { name };
}

// Message Handling
chrome.runtime.onMessage.addListener((message: Message | any, _sender, sendResponse) => {
  if (message.type === 'AUTH_TOKEN_UPDATE' && message.token) {
    console.log('LifeOS Extension: Received token update');
    chrome.storage.local.set({
      lifeos_token: message.token,
      lifeos_repo: message.repo,
      lifeos_repos: message.repos || []
    }, () => {
      console.log('LifeOS Extension: Token & Repo data saved');
    });
    return false;
  }

  if (message.type === 'DUMP_NOTE') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const targetPath = message.path || '.lifeos/dump.md';
        await githubUpsertFile(token, repo, targetPath, `- ${message.note?.trim()}`, 'top');
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'ADD_ACTION_LOG') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const targetPath = message.path || '.lifeos/dump.actionlog.md';

        // Generate timestamp YYYY-MM-DD HH:mm:ss
        const now = new Date();
        const pad = (n: number) => n.toString().padStart(2, '0');
        const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

        // Format description and tags
        let contentStr = `- ${timestamp} ${message.description?.trim() || ''}`;
        if (message.tags && message.tags.length > 0) {
          const tagsStr = message.tags.map((t: string) => `#${t.trim()}`).join(' ');
          contentStr += ` ${tagsStr}`;
        }

        await githubUpsertFile(token, repo, targetPath, contentStr, 'bottom');
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'FETCH_QUICK_NOTES') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const url = `https://api.github.com/repos/${repo}/contents/.lifeos/.dashboard.config.json`;
        const headers = {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
        };
        const res = await fetch(url, { headers });
        if (!res.ok) {
          sendResponse({ quickNotes: [] });
          return;
        }
        const configData = await res.json();
        const content = decodeURIComponent(escape(atob(configData.content || '')));
        const config = JSON.parse(content);
        const quickNotes = config.files?.quickNotes || [];
        sendResponse({ quickNotes });
      } catch (error: any) {
        console.error('Failed to fetch quick notes:', error);
        sendResponse({ quickNotes: [] }); // default empty gracefully
      }
    });
    return true; // Indicate async response
  }

  if (
    message.type === 'LIST_PINNED_TAB_GROUPS' ||
    message.type === 'LOAD_PINNED_TAB_GROUP' ||
    message.type === 'SAVE_PINNED_TAB_GROUP' ||
    message.type === 'RENAME_PINNED_TAB_GROUP' ||
    message.type === 'DELETE_PINNED_TAB_GROUP'
  ) {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        if (message.type === 'LIST_PINNED_TAB_GROUPS') {
          sendResponse({ success: true, ...(await listPinnedTabGroups(token, repo)) });
        } else if (message.type === 'LOAD_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await loadPinnedTabGroup(token, repo, message.groupId)),
          });
        } else if (message.type === 'SAVE_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await savePinnedTabGroup(token, repo, message.groupId, message.name)),
          });
        } else if (message.type === 'RENAME_PINNED_TAB_GROUP') {
          sendResponse({
            success: true,
            ...(await renamePinnedTabGroup(token, repo, message.groupId, message.name)),
          });
        } else {
          sendResponse({
            success: true,
            ...(await deletePinnedTabGroup(token, repo, message.groupId)),
          });
        }
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true; // Indicate async response
  }

  if (message.type === 'PIN_ARTICLE') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const { title, url, text } = message as { title: string; url: string; text: string };
        const date = new Date().toISOString().slice(0, 10);
        const slug = urlToSlug(url);
        const path = `.kh/raw/${Date.now()}-${slug}.md`;
        const escapedTitle = title.replace(/[\r\n]+/g, ' ').replace(/"/g, '\\"');
        const safeUrl = url.replace(/'/g, "''");
        const content = `---\ntitle: "${escapedTitle}"\nurl: '${safeUrl}'\ndate: ${date}\nprocessed: false\ntags: [general]\n---\n\n${text}`;
        await githubUpsertFile(token, repo, path, content);
        sendResponse({ success: true });
      } catch (error: any) {
        sendResponse({ error: error.message });
      }
    });
    return true;
  }
});

function urlToSlug(url: string): string {
  try {
    const { hostname, pathname } = new URL(url);
    const last = pathname.replace(/\/$/, '').split('/').pop() || '';
    const base = last || hostname.replace(/^www\./, '');
    return base.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40);
  } catch {
    return 'article';
  }
}

async function saveToKnowledgeBase(text: string, url: string, pageTitle: string) {
  const tokenData: any = await chrome.storage.local.get(['lifeos_token', 'lifeos_repo']);
  const token = tokenData.lifeos_token;
  const repo = tokenData.lifeos_repo || 'lifosy/monorepo';

  if (!token) {
    console.warn('LifeOS Extension: No auth token found. Please login to Console.');
    // Ideally show a notification
    return;
  }

  try {
    const formatted = `### ${pageTitle}\n[Source](${url})\n\n> ${text.trim()}`;
    await githubUpsertFile(token, repo, '.lifeos/clippings.md', formatted, 'top');
    console.log('LifeOS Extension: Successfully saved to knowledge base');
  } catch (e) {
    console.error('LifeOS Extension: Error saving clipping', e);
  }
}
