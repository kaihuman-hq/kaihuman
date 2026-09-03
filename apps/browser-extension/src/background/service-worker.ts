import { type Message } from '../types';
import {
  PINNED_TABS_PATH,
  type PinnedTabsConfig,
  parsePinnedTabs,
  serializePinnedTabs,
  tabsToOpen,
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

async function savePinnedTabs(token: string, repo: string): Promise<number> {
  const pinned = await chrome.tabs.query({ pinned: true, currentWindow: true });
  const config: PinnedTabsConfig = {
    tabs: toPinnedTabs(pinned),
    updatedAt: new Date().toISOString(),
  };
  const existing = await githubReadFile(token, repo, PINNED_TABS_PATH);
  await githubWriteFile(token, repo, PINNED_TABS_PATH, serializePinnedTabs(config), existing?.sha);
  return config.tabs.length;
}

async function loadPinnedTabs(token: string, repo: string): Promise<number> {
  const file = await githubReadFile(token, repo, PINNED_TABS_PATH);
  if (!file) throw new Error(`No pinned tabs saved yet — ${repo}/${PINNED_TABS_PATH} not found`);
  const config = parsePinnedTabs(file.content);
  const openTabs = await chrome.tabs.query({ currentWindow: true });
  const missing = tabsToOpen(
    config.tabs,
    openTabs.map((tab) => tab.url || ''),
  );
  for (const tab of missing) {
    await chrome.tabs.create({ url: tab.url, pinned: true, active: false });
  }
  return missing.length;
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

  if (message.type === 'SAVE_PINNED_TABS' || message.type === 'LOAD_PINNED_TABS') {
    chrome.storage.local.get(['lifeos_token', 'lifeos_repo'], async (data: any) => {
      const token = data.lifeos_token;
      const repo = data.lifeos_repo || 'lifosy/monorepo';
      if (!token) {
        sendResponse({ error: 'No token found' });
        return;
      }
      try {
        const count =
          message.type === 'SAVE_PINNED_TABS'
            ? await savePinnedTabs(token, repo)
            : await loadPinnedTabs(token, repo);
        sendResponse({ success: true, count });
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
