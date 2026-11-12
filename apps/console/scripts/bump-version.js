#!/usr/bin/env node

/**
 * Version Bumping Script
 *
 * Usage:
 *   node scripts/bump-version.js [patch|minor|major]
 *
 * Default: patch
 *
 * This script updates the version.json file and runs generate-version.js
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');

// Get bump type from command line argument
const bumpType = process.argv[2] || 'patch';

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Invalid bump type. Use: patch, minor, or major');
  process.exit(1);
}

// Read current version
const versionPath = path.join(__dirname, '..', 'version.json');
const version = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));

// Store old version for logging
const oldVersion = `${version.major}.${version.minor}.${version.patch}`;

// Bump version
switch (bumpType) {
  case 'major':
    version.major += 1;
    version.minor = 0;
    version.patch = 0;
    break;
  case 'minor':
    version.minor += 1;
    version.patch = 0;
    break;
  case 'patch':
    version.patch += 1;
    break;
}

// Write updated version
fs.writeFileSync(versionPath, `${JSON.stringify(version, null, 2)}\n`, 'utf-8');

const newVersion = `${version.major}.${version.minor}.${version.patch}`;
console.log(`✓ Bumped version from ${oldVersion} to ${newVersion}`);

// Run generate-version script
console.log('Generating version info...');
execSync('node scripts/generate-version.js --force', {
  stdio: 'inherit',
  cwd: path.join(__dirname, '..'),
});
