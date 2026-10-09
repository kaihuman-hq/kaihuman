import { describe, expect, it } from 'vitest';
import { CONSOLE_URL, consoleFileUrl, isConsolePage } from './console';

describe('consoleFileUrl', () => {
  it('carries the repository when one is given', () => {
    expect(consoleFileUrl('a/b.md', 'owner/name')).toBe(
      `${CONSOLE_URL}/files/a/b.md?repo=owner%2Fname`,
    );
  });

  it('omits the parameter when no repository is given', () => {
    expect(consoleFileUrl('a/b.md')).toBe(`${CONSOLE_URL}/files/a/b.md`);
  });

  it('hands the repository back intact through URLSearchParams, as the console reads it', () => {
    const url = new URL(consoleFileUrl('a/b.md', 'owner/name'));
    expect(url.searchParams.get('repo')).toBe('owner/name');
  });

  it('points at the console route that opens a file', () => {
    expect(consoleFileUrl('.kh/projects.todos.md')).toBe(
      `${CONSOLE_URL}/files/.kh/projects.todos.md`,
    );
  });

  it('keeps slashes as separators and encodes within each segment', () => {
    expect(consoleFileUrl('notes/my ideas.md')).toBe(`${CONSOLE_URL}/files/notes/my%20ideas.md`);
    expect(consoleFileUrl('a/b/c.md')).toBe(`${CONSOLE_URL}/files/a/b/c.md`);
  });

  it('encodes characters that would otherwise change the url', () => {
    expect(consoleFileUrl('notes/a?b#c.md')).toBe(`${CONSOLE_URL}/files/notes/a%3Fb%23c.md`);
  });

  // The console decodes the whole remainder after /files/ in one go, so a round-trip
  // through decodeURIComponent has to give the path back unchanged.
  it('round-trips through the console’s decoding', () => {
    for (const path of ['.kh/projects.todos.md', 'notes/my ideas.md', 'notes/a?b#c.md']) {
      const url = new URL(consoleFileUrl(path));
      expect(decodeURIComponent(url.pathname.replace('/files/', ''))).toBe(path);
    }
  });
});

describe('isConsolePage', () => {
  it('accepts the console and its pages', () => {
    expect(isConsolePage(CONSOLE_URL)).toBe(true);
    expect(isConsolePage(`${CONSOLE_URL}/extension-onboarded`)).toBe(true);
  });

  it('rejects other sites, including look-alike hosts', () => {
    expect(isConsolePage('https://evil.example/')).toBe(false);
    expect(isConsolePage('https://app.kaihuman.com.evil.example/')).toBe(false);
    expect(isConsolePage('http://app.kaihuman.com/')).toBe(false);
  });

  it('rejects a missing or malformed url', () => {
    expect(isConsolePage(undefined)).toBe(false);
    expect(isConsolePage('not a url')).toBe(false);
  });
});
