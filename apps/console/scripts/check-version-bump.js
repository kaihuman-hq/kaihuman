#!/usr/bin/env node

/**
 * Version Bump Check
 *
 * Usage:
 *   node scripts/check-version-bump.js <base-ref>
 *
 * Fails unless version.json is higher than on <base-ref>. CI runs it on pull requests that
 * change the console: the deploy cannot push to main, so the bump has to be part of the PR
 * (`pnpm --filter @kaihuman/app-console version:bump`).
 */

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

/** Negative, zero or positive, like a sort comparator. */
function compareVersions(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

const format = (v) => `${v.major}.${v.minor}.${v.patch}`;

module.exports = { compareVersions };

if (require.main === module) {
  const baseRef = process.argv[2];
  if (!baseRef) {
    console.error('Usage: node scripts/check-version-bump.js <base-ref>');
    process.exit(2);
  }
  const versionPath = path.join(__dirname, '..', 'version.json');
  const head = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
  const base = JSON.parse(
    execFileSync('git', ['show', `${baseRef}:apps/console/version.json`], { encoding: 'utf-8' }),
  );
  if (compareVersions(head, base) <= 0) {
    console.error(
      `apps/console/version.json is ${format(head)}, base has ${format(base)}. ` +
        'Run `pnpm --filter @kaihuman/app-console version:bump` and commit version.json and src/version.ts.',
    );
    process.exit(1);
  }
  console.log(`✓ Console version bumped: ${format(base)} -> ${format(head)}`);
}
