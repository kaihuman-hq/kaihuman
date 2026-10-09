import { describe, expect, it } from 'vitest';
import { releaseProblems } from './release-checks.mjs';

const ok = {
  manifest_version: 3,
  version: '1.2.3',
  host_permissions: ['https://api.github.com/*'],
  optional_host_permissions: ['<all_urls>'],
  content_scripts: [{ matches: ['https://app.kaihuman.com/*'], js: ['a.js'] }],
};

describe('releaseProblems', () => {
  it('passes a narrow manifest whose version matches package.json', () => {
    expect(releaseProblems(ok, '1.2.3')).toEqual([]);
  });

  it('catches a manifest built from another version', () => {
    expect(releaseProblems(ok, '1.2.4')).toEqual([
      "manifest version 1.2.3 is not package.json's 1.2.4",
    ]);
  });

  it('rejects a version Chrome would not accept', () => {
    expect(releaseProblems({ ...ok, version: '1.0.0-beta' }, '1.0.0-beta')).toContain(
      '1.0.0-beta is not a version Chrome accepts (1 to 4 dot-separated integers)',
    );
  });

  it('refuses standing access to every site, by permission or by content script', () => {
    expect(
      releaseProblems(
        {
          ...ok,
          host_permissions: ['<all_urls>'],
          content_scripts: [{ matches: ['<all_urls>'], js: ['a.js'] }],
        },
        '1.2.3',
      ),
    ).toEqual([
      'host_permissions include <all_urls>',
      'a content script runs on every site: <all_urls>',
    ]);
  });

  it('refuses a development key', () => {
    expect(releaseProblems({ ...ok, key: 'MIIB' }, '1.2.3')).toEqual([
      'the manifest carries a "key", which the store rejects',
    ]);
  });
});
