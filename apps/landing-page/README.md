# kaihuman Landing Page

The promotional landing page and marketing site for kaihuman.

## Overview

This site is built using [Astro](https://astro.build/) to provide a fast, content-focused experience and features a modern design built with Tailwind CSS.

## Development

### Prerequisites

Ensure you have Node.js and `pnpm` installed. Run `pnpm install` from the root of the monorepo to install dependencies.

### Available Scripts

Navigate to the `apps/landing-page` directory and run the following commands:

- `pnpm dev`: Starts the local Astro development server at `localhost:4321`.
- `pnpm build`: Builds the production-ready site into the `./dist/` directory.
- `pnpm preview`: Serves the built site locally for previewing before deployment.
- `pnpm astro`: Exposes the Astro CLI for additional commands (e.g., `pnpm astro add`, `pnpm astro check`).

## Structure

```text
/
├── public/          # Static assets like images and fonts
├── src/
│   ├── components/  # Reusable UI components
│   ├── layouts/     # Page layout wrappers
│   └── pages/       # Astro page routes (e.g., index.astro)
└── package.json
```
