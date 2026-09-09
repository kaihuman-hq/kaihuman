import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Lifosy Browser Extension',
  version: '1.0.1',
  description: 'Interact with your Lifosy repo from anywhere.',
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
  permissions: ['contextMenus', 'storage', 'activeTab', 'scripting', 'alarms', 'tabs'],
  host_permissions: ['<all_urls>'],
})
