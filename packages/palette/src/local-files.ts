import type { ModeItem, PaletteMode } from './command-palette.js';
import type { ActionPort, LocalFileHit, PaletteProtocol } from './protocol.js';

type OpenWith = PaletteProtocol['OPEN_LOCAL_FILE']['request']['with'];

/**
 * Leading `c:` searches the contents too and `a:` the whole file system instead of the home
 * directory, in either order (`a: c: nginx`); anything else is the text to search for.
 */
export function parseLocalFileQuery(query: string): {
  text: string;
  contents: boolean;
  everywhere: boolean;
} {
  let text = query.trim();
  let contents = false;
  let everywhere = false;
  for (let flag = /^([ac]):\s*/i.exec(text); flag; flag = /^([ac]):\s*/i.exec(text)) {
    if (flag[1]?.toLowerCase() === 'c') contents = true;
    else everywhere = true;
    text = text.slice(flag[0].length);
  }
  return { text: text.trim(), contents, everywhere };
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
 * `>o` — files and folders in the home directory, by name; `>o c: …` searches their contents too
 * and `>o a: …` the whole file system. ⏎ opens one with its default app, ⇥ offers the folder it is
 * in in the file manager or a terminal. Desktop only: the backend searches the disk.
 */
export const localFilesMode = (port: ActionPort): PaletteMode => ({
  prefix: 'o',
  title: 'Search files',
  placeholder: 'A file name — “c: …” contents too, “a: …” the whole disk · ⏎ searches',
  description:
    'Files and folders in your home directory by name, “>o c: …” by contents too, “>o a: …” on the whole file system — ⏎ opens one with its default app, ⇥ opens its folder in the file manager or a terminal',
  // What is found depends on what is typed; there is nothing to choose again.
  recents: false,
  submit: async (query) => {
    const { text, contents, everywhere } = parseLocalFileQuery(query);
    if (!text) return [];
    const { home, hits } = await port.send({
      type: 'SEARCH_LOCAL_FILES',
      query: text,
      contents,
      everywhere,
    });
    return hits.map((hit) => hitItem(port, hit, home, contents));
  },
});
