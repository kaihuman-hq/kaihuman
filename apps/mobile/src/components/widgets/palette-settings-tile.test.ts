import { DEFAULT_PALETTE_SETTINGS, readPaletteSettings } from '@kaihuman/formats';
import { describe, expect, it } from 'vitest';
import {
  addDefaultEntry,
  blankEntry,
  entryProblem,
  missingDefaults,
  movePaletteEntry,
  paletteEntry,
  previewLink,
  removePaletteEntry,
  savePaletteEntry,
} from './palette-settings-tile.js';

const FILE = JSON.stringify({
  searchEngines: [
    { name: 'A', url: 'https://a.test/?q={query}', params: [] },
    { name: 'B', url: 'https://b.test/?q={query}', params: [] },
  ],
  assistants: [],
  tools: [{ prefix: 'l', name: 'Logs', url: 'https://l.test', params: [] }],
});

const out = (r: { ok: boolean; content?: string; error?: string }) => {
  if (!r.ok) throw new Error(r.error);
  return readPaletteSettings(r.content).settings;
};

describe('palette settings edits', () => {
  it('replaces and appends entries', () => {
    const edited = out(
      savePaletteEntry(FILE, 'searchEngines', 1, {
        name: ' B2 ',
        url: 'https://b.test',
        params: [],
      }),
    );
    expect(edited.searchEngines.map((e) => e.name)).toEqual(['A', 'B2']);
    const added = out(savePaletteEntry(FILE, 'assistants', null, blankEntry('assistants')));
    expect(added.assistants).toHaveLength(1);
  });
  it('normalises tool prefix and drops a blank description', () => {
    const r = out(
      savePaletteEntry(FILE, 'tools', 0, {
        prefix: ' L2 ',
        name: 'Logs',
        description: '  ',
        url: 'https://l.test',
        params: [],
      }),
    );
    expect(r.tools[0]).toEqual({ prefix: 'l2', name: 'Logs', url: 'https://l.test', params: [] });
  });
  it('deletes and reorders within bounds', () => {
    expect(
      out(removePaletteEntry(FILE, 'searchEngines', 0)).searchEngines.map((e) => e.name),
    ).toEqual(['B']);
    expect(
      out(movePaletteEntry(FILE, 'searchEngines', 0, 1)).searchEngines.map((e) => e.name),
    ).toEqual(['B', 'A']);
    expect(
      out(movePaletteEntry(FILE, 'searchEngines', 0, -1)).searchEngines.map((e) => e.name),
    ).toEqual(['A', 'B']);
  });
  it('rejects a stale index and an invalid file', () => {
    expect(savePaletteEntry(FILE, 'tools', 5, blankEntry('tools')).ok).toBe(false);
    expect(removePaletteEntry('{x', 'tools', 0)).toMatchObject({ ok: false });
    expect(savePaletteEntry('{x', 'tools', null, blankEntry('tools')).ok).toBe(false);
  });
  it('reads one entry as a copy', () => {
    const e = paletteEntry(FILE, 'searchEngines', 0);
    expect(e?.name).toBe('A');
    expect(paletteEntry(FILE, 'searchEngines', 9)).toBeUndefined();
  });
  it('reports problems against the tools listed before it', () => {
    const dup = { prefix: 'l', name: 'Other', url: 'https://o.test', params: [] };
    expect(entryProblem(FILE, 'tools', null, dup)).toMatch(/already taken/);
    expect(entryProblem(FILE, 'tools', 0, dup)).toBeNull();
    expect(entryProblem(FILE, 'assistants', null, blankEntry('assistants'))).toMatch(
      /needs a name/,
    );
  });
  it('previews the link for a sample query', () => {
    expect(previewLink({ name: 'A', url: 'https://a.test/?q={query}', params: [] })).toBe(
      'https://a.test/?q=example',
    );
  });
  it('offers removed defaults back, by URL', () => {
    const none = JSON.stringify({ searchEngines: [], assistants: [], tools: [] });
    const missing = missingDefaults(none, 'searchEngines');
    expect(missing).toHaveLength(DEFAULT_PALETTE_SETTINGS.searchEngines.length);
    const added = out(addDefaultEntry(none, 'searchEngines', missing[0] as never));
    expect(missingDefaults(JSON.stringify(added), 'searchEngines')).toHaveLength(
      missing.length - 1,
    );
  });
});
