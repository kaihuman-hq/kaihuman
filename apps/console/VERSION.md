# Version Management

This document describes the version management system for the LifeOS Console application.

## Overview

The app displays version information in the StatusBar (visible after authentication). The version system includes:
- **Version number** (semantic versioning: major.minor.patch)
- **Build timestamp** (ISO 8601 format)
- **Git commit hash** (short form)

## Files

- `version.json` - Configuration file storing the current version (0.1.1)
- `scripts/generate-version.js` - Script that generates `src/version.ts` with build info
- `scripts/bump-version.js` - Script to increment version numbers
- `src/version.ts` - Auto-generated file (excluded from git)

## Usage

### Viewing Version

After logging into the app:
1. Hover over or tap the StatusBar at the bottom of the screen
2. Look for "VERSION" label on the right side
3. The version number is displayed (e.g., "0.1.1")
4. Hover over the version to see full build details in the tooltip

### Bumping Version

Use the npm scripts to bump the version:

```bash
# Bump patch version (0.1.1 -> 0.1.2) - Default for bug fixes
pnpm run version:bump

# Bump minor version (0.1.1 -> 0.2.0) - For new features
pnpm run version:bump:minor

# Bump major version (0.1.1 -> 1.0.0) - For breaking changes
pnpm run version:bump:major
```

Each bump command:
1. Updates `version.json`
2. Automatically runs the version generation script
3. Creates a new `src/version.ts` file

### Build Process

The version is automatically generated during every build:

```bash
# Development build (doesn't generate version by default)
pnpm run dev

# Production build (generates version automatically)
pnpm run build
pnpm run build:prod
```

The `generate-version.js` script runs before each build and creates a fresh `src/version.ts` file with:
- Current version from `version.json`
- Current timestamp in ISO format
- Git commit hash (if available)

## Deployment

During deployment (via GitHub Actions):
1. The workflow checks out the code
2. Runs `pnpm run build` or `pnpm run build:prod`
3. The version generation script executes automatically
4. The built app includes the version info with the exact deployment timestamp

## Version Display

The version appears in the StatusBar component:
- **Label**: "VERSION"
- **Value**: Version number (e.g., "0.1.1")
- **Tooltip**: Shows build time and git commit hash
- **Visibility**: Appears when hovering over the StatusBar (on desktop)

## Semantic Versioning

This project follows [Semantic Versioning](https://semver.org/):

- **MAJOR** version (X.0.0) - Incompatible API changes or major rewrites
- **MINOR** version (0.X.0) - New features, backwards compatible
- **PATCH** version (0.0.X) - Bug fixes, backwards compatible

Starting version: **0.1.1**

## Notes

- `src/version.ts` is auto-generated and should **never** be edited manually
- `version.json` should be the only file manually edited to set base version
- The patch version is incremented by default when running `version:bump`
- Version info is compiled into the build, so no runtime API calls are needed
