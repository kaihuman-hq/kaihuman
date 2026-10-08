# Lifosy Console

The primary web console application for Lifosy, providing a comprehensive interface to manage your repositories, files, and tasks.

## Overview

The console allows you to:
- Access and edit your markdown knowledge base with a built-in rich text editor.
- Manage Todos, Habits, and Cash tracking via integrated widgets.
- Seamlessly interact with your connected GitHub repositories to sync data.

## Development

The application is built with Preact, Vite, and Tailwind CSS.

### Prerequisites

You need Node.js and `pnpm` installed. Make sure to run `pnpm install` from the root of the monorepo first.

### Commands

Run the following commands from within the `apps/console` directory:

- `pnpm dev`: Starts the local Vite development server.
- `pnpm build`: Builds the application for production.
- `pnpm prod`: Starts the development server in production mode.
- `pnpm build:prod`: Increments the version and builds the application for production.
- `pnpm preview`: Previews the production build locally.
- `pnpm lint`: Runs Biome to check the code for potential errors.
- `pnpm format`: Runs Biome to format the codebase.
- `pnpm check-types`: Runs the TypeScript compiler to check for type errors without emitting files.

### Code Editor Subsystem

The console edits files with `CodeEditor` from `@cascivo/editor`, wrapped in `src/components/editor/CodeMirrorEditor.tsx`. `src/components/editor/language.ts` picks the syntax highlighting from the file path, and zen mode overrides the editor's `--cascivo-editor-*` colours.
