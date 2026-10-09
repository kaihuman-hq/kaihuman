import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'kaihuman Browser Extension',
  version: '1.0.1',
  description: 'Interact with your kaihuman repo from anywhere.',
  icons: {
    "16": "icon-16.png",
    "32": "icon-32.png",
    "48": "icon-48.png",
    "128": "icon-128.png"
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    }
  },
  // Chrome runs no content script on its own New Tab page, so the palette could never open
  // there. Replacing the page with one of ours puts it back — and gives the bookmarks somewhere
  // to live.
  chrome_url_overrides: {
    newtab: 'newtab.html',
  },
  commands: {
    'toggle-command-palette': {
      suggested_key: {
        default: 'Ctrl+Shift+K',
        mac: 'Command+Shift+K',
      },
      description: 'Open the kaihuman command palette',
    },
  },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  content_scripts: [
    {
      matches: ['<all_urls>'],
      js: ['src/content/index.ts'],
    },
  ],
  // nativeMessaging: the desktop palette's host, to keep both on the same repository.
  permissions: ['contextMenus', 'storage', 'activeTab', 'scripting', 'alarms', 'tabs', 'nativeMessaging'],
  // Reading the browser's own bookmarks is only needed for the import, so it is asked for from the
  // popup when the user runs it rather than warned about on install.
  optional_permissions: ['bookmarks'],
  host_permissions: ['<all_urls>'],
})
