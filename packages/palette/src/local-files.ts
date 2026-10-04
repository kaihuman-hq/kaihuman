import type { ModeItem, PaletteMode } from './command-palette.js';
import type { ActionPort, LocalFileHit, PaletteProtocol } from './protocol.js';

type OpenWith = PaletteProtocol['OPEN_LOCAL_FILE']['request']['with'];

/** `c: budget` searches the contents too; anything else only names. */
export function parseLocalFileQuery(query: string): { text: string; contents: boolean } {
  const match = /^c:\s*/i.exec(query.trim());
  return match
    ? { text: query.trim().slice(match[0].length).trim(), contents: true }
    : { text: query.trim(), contents: false };
}

/** `/home/me/Documents` → `~/Documents`. */
const tidy = (path: string, home: string) =>
  home && (path === home || path.startsWith(`${home}/`)) ? `~${path.slice(home.length)}` : path;

const split = (path: string) => {
  const cut = path.lastIndexOf('/');
  return { folder: path.slice(0, cut) || '/', name: path.slice(cut + 1) };
};

const opener = (port: ActionPort, path: string, title: string, how: OpenWith): ModeItem => ({
  id: `local-file:${how}:${path}`,
  title,
  action: {
    id: `local-file:${how}:${path}`,
    title,
    // Recent replays actions by id from the top-level list, which these are not in.
    recent: false,
    closes: true,
    run: async () => {
      await port.send({ type: 'OPEN_LOCAL_FILE', path, with: how });
      return '';
    },
  },
});

const hitItem = (
  port: ActionPort,
  hit: LocalFileHit,
  home: string,
  contents: boolean,
): ModeItem => {
  const { folder, name } = split(hit.path);
  const where = tidy(hit.folder ? hit.path : folder, home);
  const open = opener(port, hit.path, hit.folder ? 'Open in the file manager' : 'Open', 'app');
  return {
    id: `local-file:${hit.path}`,
    title: hit.folder ? `${name}/` : name,
    subtitle: [tidy(folder, home), hit.line].filter(Boolean).join(' · '),
    // Headings only tell the two searches apart.
    ...(contents ? { group: hit.line === undefined ? 'Names' : 'Contents' } : {}),
    action: open.action,
    children: [
      ...(hit.folder ? [] : [{ ...open, title: 'Open with the default app' }]),
      opener(port, hit.path, `Open ${where} in the file manager`, 'file-manager'),
      opener(port, hit.path, `Open ${where} in a terminal`, 'terminal'),
    ],
  };
};

/**
 * `>o` — files and folders on this computer, by name; `>o c: …` searches their contents too.
 * ⏎ opens one with its default app, ⇥ offers the folder it is in in the file manager or a
 * terminal. Desktop only: the backend searches the home directory.
 */
export const localFilesMode = (port: ActionPort): PaletteMode => ({
  prefix: 'o',
  title: 'Search files',
  placeholder: 'A file name — “c: …” searches contents too · ⏎ searches, ⇥ for the folder',
  description:
    'Files and folders in your home directory by name, “>o c: …” by contents too — ⏎ opens one with its default app, ⇥ opens its folder in the file manager or a terminal',
  // What is found depends on what is typed; there is nothing to choose again.
  recents: false,
  submit: async (query) => {
    const { text, contents } = parseLocalFileQuery(query);
    if (!text) return [];
    const { home, hits } = await port.send({ type: 'SEARCH_LOCAL_FILES', query: text, contents });
    return hits.map((hit) => hitItem(port, hit, home, contents));
  },
});
