# Monorepo Initialization Guide

Use this guide and the accompanying agent files to bootstrap the new repository.

## 1. Setup

1.  Initialize a new folder with `pnpm init`.
2.  Setup **Turborepo** (`npx create-turbo@latest`).
3.  Copy `docs/agent/CURSORRULES.md` to `.cursorrules` in the root.
4.  Copy `docs/agent/PROJECT_CONTEXT.md` to `.agent/PROJECT_CONTEXT.md` (create `.agent` folder).

## 2. Structure Creation

Ask the Agent to:
> "Initialize the monorepo structure defined in .cursorrules."

Expected outcome:
- `packages/ui` created with a basic `package.json` and Storybook setup.
- `packages/core` created with basic TS setup.
- `apps/console` created (Vite + Preact).
- root `package.json` updated with centralized `devDependencies`.

## 3. Verification

1.  Run `pnpm install`.
2.  Run `pnpm build`.
3.  Ensure `apps/console` can import a component from `packages/ui`.
