import { defineManifest } from '@crxjs/vite-plugin'

export default defineManifest({
  manifest_version: 3,
  name: 'Lifosy Browser Extension',
  version: '1.0.0',
  description: 'Interact with your Lifosy repo from anywhere.',
  action: {
    default_popup: 'index.html',
    default_icon: {
      "16": "src/assets/icon-16.png",
      "32": "src/assets/icon-32.png",
      "48": "src/assets/icon-48.png",
      "128": "src/assets/icon-128.png"
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
  permissions: ['contextMenus', 'storage', 'activeTab', 'scripting'],
  host_permissions: ['<all_urls>'],
})
