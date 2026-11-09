/**
 * The palette settings tile (`.kh/command-palette.settings.json`): the read-only view plus the
 * edits the web widget offers: add, edit, delete and reorder search engines, assistants and
 * tools, and restore defaults that were removed. Edits are one write each; entries that cannot
 * be used are kept in the file and listed as problems, as on the web.
 */
import {
  buildLinkUrl,
  type CommandPaletteSettings,
  DEFAULT_PALETTE_SETTINGS,
  type PaletteToolSetting,
  readPaletteSettings,
  type SearchEngineSetting,
  searchEngineProblem,
  serializePaletteSettings,
  toolProblem,
} from '@kaihuman/formats';
import type { TileResult } from './tile-controllers.js';
import { moveItem } from './travel-tile.js';

export interface PaletteEntryRow {
  prefix: string;
  name: string;
  detail: string;
  enabled: boolean;
  problem: string | null;
}

export interface PaletteSettingsView {
  engines: PaletteEntryRow[];
  assistants: PaletteEntryRow[];
  tools: PaletteEntryRow[];
  problems: string[];
  /** Set when the file is not valid JSON; editing would replace it with the defaults. */
  invalid?: boolean;
}

export const paletteSettingsView = (content: string): PaletteSettingsView => {
  const { settings, error } = readPaletteSettings(content);
  const row = (
    prefix: string,
    name: string,
    detail: string,
    problem: string | null,
  ): PaletteEntryRow => ({ prefix, name, detail, enabled: problem === null, problem });
  const engines = settings.searchEngines.map((e) => row('', e.name, e.url, searchEngineProblem(e)));
  const assistants = settings.assistants.map((a) =>
    row('', a.name, a.url, searchEngineProblem(a, 'An assistant')),
  );
  const tools = settings.tools.map((t, i) =>
    row(t.prefix, t.name, t.description ?? t.url, toolProblem(t, settings.tools.slice(0, i))),
  );
  const problems = [...engines, ...assistants, ...tools]
    .map((r) => r.problem)
    .filter((p): p is string => p !== null);
  return {
    engines,
    assistants,
    tools,
    problems: error ? [error, ...problems] : problems,
    ...(error ? { invalid: true } : {}),
  };
};

export type PaletteSection = 'searchEngines' | 'assistants' | 'tools';
export type PaletteEntry = SearchEngineSetting | PaletteToolSetting;

export const SECTION_META: Record<
  PaletteSection,
  { title: string; noun: string; placeholder: string; note: string }
> = {
  searchEngines: {
    title: 'Search engines',
    noun: 'Search engine',
    placeholder: 'https://example.com/search?q={query}',
    note: 'Offered for anything typed, in this order. {query} in the URL is what is typed.',
  },
  assistants: {
    title: 'Assistants',
    noun: 'Assistant',
    placeholder: 'https://example.com/chat?q={query}',
    note: 'What >a offers a question to, in this order. {query} in the URL is the question.',
  },
  tools: {
    title: 'Tools',
    noun: 'Tool',
    placeholder: 'https://example.com/explorer',
    note: 'A link behind a prefix: >l then a term opens the link built from it.',
  },
};

const INVALID = 'The settings file is not valid JSON; fix it in the code view first';
const SAMPLE_QUERY = 'example';

const fail = (error: string): TileResult => ({ ok: false, error });
const write = (settings: CommandPaletteSettings): TileResult => ({
  ok: true,
  content: serializePaletteSettings(settings),
});

/** A blank entry for the section's "Add" form. */
export const blankEntry = (section: PaletteSection): PaletteEntry =>
  section === 'tools'
    ? { prefix: '', name: '', url: '', params: [] }
    : { name: '', url: '', params: [] };

export const paletteEntry = (
  content: string,
  section: PaletteSection,
  index: number,
): PaletteEntry | undefined =>
  structuredClone(readPaletteSettings(content).settings[section][index]);

/** Why the entry cannot be used yet, given the entries listed before it; null when it can. */
export const entryProblem = (
  content: string,
  section: PaletteSection,
  index: number | null,
  entry: PaletteEntry,
): string | null => {
  if (section === 'tools') {
    const tools = readPaletteSettings(content).settings.tools;
    const before = index === null ? tools : tools.slice(0, index);
    return toolProblem(entry as PaletteToolSetting, before);
  }
  return searchEngineProblem(entry, section === 'assistants' ? 'An assistant' : undefined);
};

/** The link the entry builds for a sample query, so a template can be checked before saving. */
export const previewLink = (entry: PaletteEntry): string => buildLinkUrl(entry, SAMPLE_QUERY);

const normalise = (section: PaletteSection, entry: PaletteEntry): PaletteEntry => {
  const base = { ...entry, name: entry.name.trim(), url: entry.url.trim() };
  if (section !== 'tools') return base;
  const tool = base as PaletteToolSetting;
  const { description, ...rest } = tool;
  return {
    ...rest,
    prefix: tool.prefix.trim().toLowerCase(),
    ...(description?.trim() ? { description: description.trim() } : {}),
  };
};

/** Replaces the entry at `index`, or appends when `index` is null. */
export const savePaletteEntry = (
  content: string,
  section: PaletteSection,
  index: number | null,
  entry: PaletteEntry,
): TileResult => {
  const { settings, error } = readPaletteSettings(content);
  if (error) return fail(INVALID);
  const list = [...settings[section]] as PaletteEntry[];
  const next = normalise(section, entry);
  if (index === null) list.push(next);
  else if (index >= 0 && index < list.length) list[index] = next;
  else return fail('That entry no longer exists');
  return write({ ...settings, [section]: list });
};

export const removePaletteEntry = (
  content: string,
  section: PaletteSection,
  index: number,
): TileResult => {
  const { settings, error } = readPaletteSettings(content);
  if (error) return fail(INVALID);
  return write({ ...settings, [section]: settings[section].filter((_, i) => i !== index) });
};

export const movePaletteEntry = (
  content: string,
  section: PaletteSection,
  index: number,
  dir: -1 | 1,
): TileResult => {
  const { settings, error } = readPaletteSettings(content);
  if (error) return fail(INVALID);
  return write({ ...settings, [section]: moveItem(settings[section], index, dir) });
};

/** Built-in entries the section no longer has (matched by URL), to offer as "add back". */
export const missingDefaults = (content: string, section: PaletteSection): PaletteEntry[] => {
  const have = readPaletteSettings(content).settings[section] as PaletteEntry[];
  return (DEFAULT_PALETTE_SETTINGS[section] as PaletteEntry[])
    .filter((d) => !have.some((e) => e.url === d.url))
    .map((d) => structuredClone(d));
};

export const addDefaultEntry = (
  content: string,
  section: PaletteSection,
  entry: PaletteEntry,
): TileResult => savePaletteEntry(content, section, null, entry);
