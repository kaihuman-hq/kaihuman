import { describe, expect, it } from 'vitest';
import { isSafeUrl, itemRefOf, normalizeItemUrl } from './streams.js';

describe('itemRefOf', () => {
  it('reads PRs and issues, with any suffix', () => {
    expect(itemRefOf('https://github.com/acme/api/pull/412/files')).toEqual({
      kind: 'github-pr',
      owner: 'acme',
      repo: 'api',
      number: 412,
      key: 'acme/api#412',
    });
    expect(itemRefOf('https://github.com/acme/api/issues/7#issuecomment-1')?.kind).toBe(
      'github-issue',
    );
  });

  it('treats Slack, Claude and other pages as links', () => {
    expect(itemRefOf('https://acme.slack.com/archives/C04/p1728896')).toEqual({
      kind: 'link',
      host: 'acme.slack.com',
    });
    expect(itemRefOf('https://claude.ai/code/session_01')).toEqual({
      kind: 'link',
      host: 'claude.ai',
    });
    expect(itemRefOf('https://github.com/acme/api')).toEqual({
      kind: 'link',
      host: 'github.com',
    });
  });

  it('refuses javascript:, file: and garbage', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url']) {
      expect(itemRefOf(url)).toBeNull();
    }
  });
});

describe('isSafeUrl', () => {
  it('accepts only http and https', () => {
    expect(isSafeUrl('https://example.com')).toBe(true);
    expect(isSafeUrl('http://example.com')).toBe(true);
    expect(isSafeUrl('javascript:alert(1)')).toBe(false);
  });
});

describe('normalizeItemUrl', () => {
  it('normalizes every spelling of one PR to the same key', () => {
    const spellings = [
      'https://github.com/acme/api/pull/12',
      'https://github.com/acme/api/pull/12/',
      'https://github.com/acme/api/pull/12/files',
      'https://github.com/acme/api/pull/12#discussion_r1',
      'https://github.com/acme/api/pull/12?w=1',
      'https://www.github.com/Acme/API/pull/12',
    ];
    expect(new Set(spellings.map(normalizeItemUrl))).toEqual(
      new Set(['https://github.com/acme/api/pull/12']),
    );
  });

  it('drops the fragment, tracking parameters and a trailing slash from links', () => {
    expect(normalizeItemUrl('https://example.com/a/?utm_source=x&id=3&fbclid=y#top')).toBe(
      'https://example.com/a?id=3',
    );
  });

  it('keeps Slack thread parameters', () => {
    const url = 'https://acme.slack.com/archives/C04/p1728896?thread_ts=1728896.1&cid=C04';
    expect(normalizeItemUrl(url)).toBe(url);
  });

  it('returns unsafe URLs unchanged', () => {
    expect(normalizeItemUrl('javascript:alert(1)')).toBe('javascript:alert(1)');
  });
});
