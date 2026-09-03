# Lifosy Browser Extension

The official browser extension for Lifosy, designed to enhance your web experience and seamlessly integrate with your Lifosy console.

## Features

- **Read-it-later**: Quickly save web pages to your "read-it-later" list.
- **Save to Knowledge Base**: Add selected text or snippets directly to your knowledge base.
- **Quick Dump Notes**: Rapidly create notes without navigating away from your current tab.
- **Context Menu Integration**: Conveniently access Lifosy features directly from the browser's context menu.
- **Pinned Tabs Sync**: Save the pinned tabs of the current window to your repo, and restore them on any machine.

## Pinned Tabs

The **Pinned Tabs** section of the popup keeps your pinned tabs in the active repo at
`.kh/browser.pinnedtabs.json`:

- **Save current** — overwrites the file with the pinned tabs of the current window.
  The file is a snapshot, so unpinning a tab and saving again removes it.
- **Load** — opens every stored tab as a pinned tab in the current window, skipping URLs
  that are already open. Loading twice is a no-op. Only `http`/`https` entries are opened.

```json
{
  "tabs": [{ "url": "https://example.com/", "title": "Example" }],
  "updatedAt": "2026-09-03T10:00:00.000Z"
}
```

Reading the URL of every tab requires the `tabs` permission, which Chrome surfaces as
"Read your browsing history" when the extension is installed or updated.

## Development

The extension is built with TypeScript, Preact, and Vite, using Tailwind CSS for styling.

### Prerequisites

Ensure you have Node.js and `pnpm` installed. Run `pnpm install` from the monorepo root to install all dependencies.

### Available Scripts

Navigate to the `apps/browser-extension` directory to run these commands:

- `pnpm dev`: Starts the Vite development server with Hot Module Replacement (HMR).
- `pnpm build`: Compiles TypeScript and builds the production-ready extension.
- `pnpm preview`: Previews the built extension.

### Loading the Extension Locally

1. Run `pnpm dev` or `pnpm build`.
2. Open your browser's extension management page (e.g., `chrome://extensions/` in Chrome).
3. Enable **Developer mode**.
4. Click **Load unpacked** and select the `apps/browser-extension/dist` directory.
