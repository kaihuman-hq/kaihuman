import { describe, expect, it } from 'vitest';
// @ts-expect-error plain ESM script without type declarations
import { bumpBuildNumber } from './release.mjs';

const base = {
  expo: {
    ios: { bundleIdentifier: 'x', buildNumber: '7' },
    android: { package: 'x', versionCode: 3 },
  },
};

describe('bumpBuildNumber', () => {
  it('raises the iOS build number and keeps it a string', () => {
    const { next, appJson } = bumpBuildNumber(base, 'ios');
    expect(next).toBe(8);
    expect(appJson.expo.ios).toEqual({ bundleIdentifier: 'x', buildNumber: '8' });
    expect(base.expo.ios.buildNumber).toBe('7');
  });

  it('raises the Android versionCode', () => {
    expect(bumpBuildNumber(base, 'android').appJson.expo.android.versionCode).toBe(4);
  });

  it('starts at 1 when no number is set', () => {
    expect(bumpBuildNumber({ expo: { ios: {} } }, 'ios').next).toBe(1);
  });

  it('rejects an unknown platform and a non-integer number', () => {
    expect(() => bumpBuildNumber(base, 'web')).toThrow(/Unknown platform/);
    expect(() => bumpBuildNumber({ expo: { ios: { buildNumber: 'abc' } } }, 'ios')).toThrow(
      /not an integer/,
    );
  });
});
