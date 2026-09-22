import { describe, expect, it } from 'vitest';
import { CONSOLE_URL, consoleFileUrl } from './console';

describe('consoleFileUrl', () => {
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
