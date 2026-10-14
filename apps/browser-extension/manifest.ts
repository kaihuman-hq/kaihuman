import { defineManifest } from '@crxjs/vite-plugin';
import pkg from './package.json' with { type: 'json' };

export default defineManifest({
  manifest_version: 3,
  name: 'kaihuman Browser Extension',
  // package.json holds the version; `pnpm run package` checks the built manifest against it.
  version: pkg.version,
  description: 'Interact with your kaihuman repo from anywhere.',
  icons: {
    '16': 'icon-16.png',
    '32': 'icon-32.png',
    '48': 'icon-48.png',
    '128': 'icon-128.png',
  },
  action: {
    default_popup: 'index.html',
    default_icon: {
      '16': 'icon-16.png',
      '32': 'icon-32.png',
      '48': 'icon-48.png',
      '128': 'icon-128.png',
    },
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
    'open-work-panel': {
      suggested_key: { default: 'Alt+Shift+W' },
      description: 'Open the kaihuman work panel',
    },
    'pin-current-tab': {
      suggested_key: { default: 'Alt+Shift+P' },
      description: 'Pin the current tab to a kaihuman work stream',
    },
  },
  // The work streams panel.
  side_panel: { default_path: 'sidepanel.html' },
  background: {
    service_worker: 'src/background/service-worker.ts',
    type: 'module',
  },
  // Only the console's token handoff runs on its own. The palette and article extraction are
  // injected into a tab when the user acts on it (shortcut, popup, context menu), which `activeTab`
  // allows without standing access to every site.
  content_scripts: [
    {
      matches: ['https://app.kaihuman.com/*'],
      js: ['src/content/console-bridge.ts'],
    },
  ],
  // nativeMessaging: the desktop palette's host, to keep both on the same repository.
  permissions: [
    'contextMenus',
    'storage',
    'activeTab',
    'scripting',
    'alarms',
    'tabs',
    'nativeMessaging',
    'sidePanel',
  ],
  // Reading the browser's own bookmarks is only needed for the import, so it is asked for from the
  // popup when the user runs it rather than warned about on install.
  optional_permissions: ['bookmarks'],
  // GitHub (the repository), DeepL (translation, with the user's own key) and the status pages the
  // start page watches by default.
  host_permissions: [
    'https://api.github.com/*',
    'https://api.deepl.com/*',
    'https://api-free.deepl.com/*',
    'https://www.githubstatus.com/*',
    'https://status.claude.com/*',
    'https://www.cloudflarestatus.com/*',
    'https://health.aws.amazon.com/*',
    'https://status.cloud.google.com/*',
  ],
  // Asked for when first needed: a status page the user added (that site only), and downloading a
  // saved page's images, which can come from any host.
  // @ts-expect-error CRXJS's manifest type predates `optional_host_permissions` (Chrome 102+); the
  // key is passed through to the built manifest as written.
  optional_host_permissions: ['<all_urls>'],
});
