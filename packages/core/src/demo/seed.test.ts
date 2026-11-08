import {
  commandParameters,
  paletteSettingsProblems,
  parseCommands,
  parsePrompts,
  parseTodos,
  parseTravel,
  readPaletteSettings,
} from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import { decrypt } from '../utils/crypto.js';
import { buildDemoSeed, SECRET_NOTE_PLAINTEXT } from './seed.js';

const DAY_MS = 86_400_000;

describe('demo seed todos', () => {
  it('gives done items past completion dates spread across at least four recent weeks', () => {
    const now = new Date(2026, 10, 6, 12, 0, 0);
    const { files } = buildDemoSeed(now);
    const done = Object.entries(files)
      .filter(([path]) => path.endsWith('.todos.md'))
      .flatMap(([, content]) => parseTodos(content).items)
      .filter((i) => i.status === 'done');

    expect(done.length).toBeGreaterThanOrEqual(8);
    expect(done.length).toBeLessThanOrEqual(20);
    for (const item of done) {
      expect(item.updatedAt).toBeDefined();
      expect(item.updatedAt as number).toBeLessThan(now.getTime());
      expect(item.updatedAt as number).toBeGreaterThan(now.getTime() - 60 * DAY_MS);
    }
    // Monday-based week buckets are enough to count distinct weeks.
    const weeks = new Set(done.map((i) => Math.floor(((i.updatedAt as number) / DAY_MS + 3) / 7)));
    expect(weeks.size).toBeGreaterThanOrEqual(4);
  });
});

describe('demo seed file kinds', () => {
  const now = new Date(2026, 10, 6, 12, 0, 0);
  const { files } = buildDemoSeed(now);

  it('has one file per kind', () => {
    const suffixes = [
      '.todos.md',
      '.timetracking.csv',
      '.habit.csv',
      '.events.csv',
      '.actionlog.md',
      '.timezones.json',
      '.board-overview.json',
      '.budget.csv',
      '.stocks.csv',
      '.consumption.csv',
      '.data-collection.csv',
      '.readitlater.json',
      '.bookmarks.json',
      '.rss.json',
      '.travel.json',
      '.prompts.md',
      '.commands.md',
      '.settings.json',
      '.csv',
      '.json',
      '.svg',
      '.txt',
      '.drawio',
      '.md.enc',
      '.md',
    ];
    for (const suffix of suffixes) {
      expect(
        Object.keys(files).some((p) => p.endsWith(suffix)),
        suffix,
      ).toBe(true);
    }
  });

  it('parses the tools files', () => {
    const trips = parseTravel(files['.kh/trips.travel.json'] as string).trips;
    expect(trips).toHaveLength(2);
    expect(trips.every((t) => t.steps.length > 0)).toBe(true);
    expect(trips.some((t) => (t.start as string) > '2026-11-06')).toBe(true);
    expect(trips.some((t) => (t.end as string) < '2026-11-06')).toBe(true);
    expect(parsePrompts(files['.kh/ai.prompts.md'] as string)).toHaveLength(3);
    const commands = parseCommands(files['.kh/shell.commands.md'] as string);
    expect(commands).toHaveLength(3);
    expect(commands.some((c) => commandParameters(c.command).length > 0)).toBe(true);
    const palette = readPaletteSettings(files['.kh/command-palette.settings.json']);
    expect(palette.error).toBeUndefined();
    expect(paletteSettingsProblems(palette.settings)).toEqual([]);
    expect(palette.settings.tools).toHaveLength(1);
  });

  it('decrypts the secret note with the demo passphrase', async () => {
    expect(await decrypt(files['notes/secret.md.enc'] as string, 'demo')).toBe(
      SECRET_NOTE_PLAINTEXT,
    );
  });
});
