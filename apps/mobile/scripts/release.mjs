#!/usr/bin/env node
// Bumps the store build number in app.json, commits and pushes it, then runs EAS Build with
// auto-submit. The number is committed before the build starts, so git always holds the last
// number sent to a store and a failed build at worst skips one number.
// Usage: node scripts/release.mjs ios|android
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/** Returns a copy of the app.json object with the platform's build number raised by one. */
export function bumpBuildNumber(appJson, platform) {
  const expo = appJson.expo;
  if (platform === 'ios') {
    const current = Number.parseInt(expo.ios?.buildNumber ?? '0', 10);
    if (!Number.isInteger(current) || current < 0)
      throw new Error('ios.buildNumber is not an integer');
    const next = current + 1;
    return {
      next,
      appJson: { ...appJson, expo: { ...expo, ios: { ...expo.ios, buildNumber: String(next) } } },
    };
  }
  if (platform === 'android') {
    const current = expo.android?.versionCode ?? 0;
    if (!Number.isInteger(current) || current < 0)
      throw new Error('android.versionCode is not an integer');
    const next = current + 1;
    return {
      next,
      appJson: { ...appJson, expo: { ...expo, android: { ...expo.android, versionCode: next } } },
    };
  }
  throw new Error(`Unknown platform "${platform}", expected ios or android`);
}

function run(cmd, args) {
  execFileSync(cmd, args, { stdio: 'inherit' });
}

function main() {
  const platform = process.argv[2];
  const appJsonPath = fileURLToPath(new URL('../app.json', import.meta.url));

  const dirty = execFileSync('git', ['status', '--porcelain', '--', appJsonPath], {
    encoding: 'utf8',
  });
  if (dirty.trim())
    throw new Error('app.json has uncommitted changes; commit or discard them first');
  run('git', ['pull', '--ff-only']);

  const { next, appJson } = bumpBuildNumber(
    JSON.parse(readFileSync(appJsonPath, 'utf8')),
    platform,
  );
  writeFileSync(appJsonPath, `${JSON.stringify(appJson, null, 2)}\n`);
  run('git', ['add', appJsonPath]);
  run('git', ['commit', '-m', `chore(mobile): ${platform} build ${next}`]);
  run('git', ['push']);

  run('npx', ['eas-cli', 'build', '-p', platform, '--profile', 'production', '--auto-submit']);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
