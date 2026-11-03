/**
 * The palette wiring every surface shares.
 *
 * Everything here goes through an `ActionPort`, so it behaves the same wherever the palette runs —
 * a content script, the extension's start page, or the desktop app. Actions that read the page
 * around them — bookmarking it, pinning it, clipping a selection — stay with the content script,
 * since nothing else has such a page.
 */

import {
  type BraindumpId,
  braindumpTitle,
  commandParameters,
  fillCommand,
  parseCommands,
  parsePrompts,
  usablePaletteSettings,
} from '@kaihuman/formats';
import { loadBusinessCapture } from './business.js';
import { usageNeedsSync, usageRows, usageStatusRow } from './claude-usage.js';
import type {
  EditableText,
  ModeItem,
  PaletteAction,
  PaletteHandlers,
  PaletteMode,
  RepoResult,
} from './command-palette.js';
import { conversionItems } from './convert.js';
import { type EntryKind, entryKindOf } from './entries.js';
import { ideasMode } from './ideas.js';
import { knowledgeNote } from './knowledge.js';
import type { ActionPort, GithubWorkFilter, PaletteResponse } from './protocol.js';
import { symbolItems } from './symbols.js';
import { parseTranslationQuery, usefulTranslations } from './translate.js';

/** The kaihuman console — where a repo file is opened, rather than on GitHub. */
export const CONSOLE_URL = 'https://app.kaihuman.com';

export const splitTags = (input: string) =>
  input
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

export const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/**
 * Reads the file, adds the entry and writes it back over the version read — a change made in the
 * console meanwhile fails the write rather than being overwritten.
 */
const addEntry = async (port: ActionPort, path: string, kind: EntryKind, answers: string[]) => {
  const { content, sha } = await port.send({ type: 'READ_ENTRY_FILE', path });
  const next = kind.add(content, answers, new Date());
  await port.send({ type: 'WRITE_ENTRY_FILE', path, content: next, ...(sha ? { sha } : {}) });
};

/** Targets for a note: the repo's quick-note files, plus the default dump. */
const noteTargets = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { quickNotes } = await port.send({ type: 'FETCH_QUICK_NOTES' });
  const paths = ['.lifeos/dump.md', ...(quickNotes ?? [])];
  return Array.from(new Set(paths)).map((path) => {
    // A widget's file — an action log, a todo list — takes an entry the way its widget adds one.
    const kind = entryKindOf(path);
    return {
      id: `note:${path}`,
      title: path,
      prompts: kind?.prompts ?? [{ label: 'Note' }],
      run: async (answers: string[]) => {
        if (kind) await addEntry(port, path, kind, answers);
        else {
          const note = answers[0] ?? '';
          if (!note.trim()) throw new Error('Nothing to add');
          await port.send({ type: 'DUMP_NOTE', path, note });
        }
        return `Added to ${path}`;
      },
    };
  });
};

/** Each saved group, with everything the popup can do to it. */
const pinnedTabGroups = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { groups } = await port.send({ type: 'LIST_PINNED_TAB_GROUPS' });
  return groups.map((group) => ({
    id: `tabs:${group.id}`,
    title: group.name,
    subtitle: plural(group.tabCount, 'tab'),
    children: async () => [
      {
        id: `tabs:${group.id}:load`,
        title: `Load ${group.name}`,
        subtitle: 'Pins what is missing and unpins what the group does not have',
        run: async () => {
          const { opened, unpinned } = await port.send({
            type: 'LOAD_PINNED_TAB_GROUP',
            groupId: group.id,
          });
          if (!opened && !unpinned) return `${group.name} is already loaded`;
          return `${group.name}: pinned ${opened}, unpinned ${unpinned}`;
        },
      },
      {
        id: `tabs:${group.id}:update`,
        title: `Update ${group.name} with this window's pinned tabs`,
        run: async () => {
          const { count } = await port.send({ type: 'SAVE_PINNED_TAB_GROUP', groupId: group.id });
          return `Updated ${group.name} with ${plural(count, 'tab')}`;
        },
      },
      {
        id: `tabs:${group.id}:rename`,
        title: `Rename ${group.name}…`,
        prompts: [{ label: 'New name', initial: () => group.name }],
        run: async ([input = '']: string[]) => {
          const { name } = await port.send({
            type: 'RENAME_PINNED_TAB_GROUP',
            groupId: group.id,
            name: input,
          });
          return `Renamed to ${name}`;
        },
      },
      {
        id: `tabs:${group.id}:up`,
        title: `Move ${group.name} up`,
        run: async () => {
          const { moved } = await port.send({
            type: 'MOVE_PINNED_TAB_GROUP',
            groupId: group.id,
            offset: -1,
          });
          return moved ? `Moved ${group.name} up` : `${group.name} is already first`;
        },
      },
      {
        id: `tabs:${group.id}:down`,
        title: `Move ${group.name} down`,
        run: async () => {
          const { moved } = await port.send({
            type: 'MOVE_PINNED_TAB_GROUP',
            groupId: group.id,
            offset: 1,
          });
          return moved ? `Moved ${group.name} down` : `${group.name} is already last`;
        },
      },
      {
        id: `tabs:${group.id}:delete`,
        title: `Delete ${group.name}`,
        // Deleting is one keystroke away, so it asks rather than assuming.
        prompts: [{ label: `Type DELETE to forget ${group.name}` }],
        run: async ([input = '']: string[]) => {
          if (input.trim().toUpperCase() !== 'DELETE') return 'Left alone';
          const { name } = await port.send({ type: 'DELETE_PINNED_TAB_GROUP', groupId: group.id });
          return `Deleted ${name}`;
        },
      },
    ],
  }));
};

const repoChoices = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { repo, repos } = await port.send({ type: 'GET_REPOS' });
  return repos.map((candidate) => ({
    id: `repo:${candidate.full_name}`,
    title: candidate.full_name,
    subtitle: candidate.full_name === repo ? 'current' : '',
    run: async () => {
      await port.send({ type: 'SET_REPO', repo: candidate.full_name });
      return `Now using ${candidate.full_name}`;
    },
  }));
};

/** Everything the extension can do that needs no page around it. */
export const repoActions = (port: ActionPort): PaletteAction[] => [
  { id: 'note', title: 'Add a note…', children: () => noteTargets(port) },
  { id: 'tabs', title: 'Pinned tab groups…', children: () => pinnedTabGroups(port) },
  {
    id: 'tabs-save',
    title: 'Save this window’s pinned tabs as a new group…',
    prompts: [{ label: 'Group name' }],
    run: async ([input = '']: string[]) => {
      const { count, name } = await port.send({ type: 'SAVE_PINNED_TAB_GROUP', name: input });
      return `Saved ${name} with ${plural(count, 'tab')}`;
    },
  },
  {
    id: 'import-chrome-bookmarks',
    title: 'Import the browser’s bookmarks',
    subtitle: 'Copies them into the repo, skipping pages already there',
    run: async () => {
      const { imported, skipped } = await port.send({ type: 'IMPORT_CHROME_BOOKMARKS' });
      return `Imported ${plural(imported, 'bookmark')}, skipped ${skipped}`;
    },
  },
  { id: 'switch-repo', title: 'Switch repository…', children: () => repoChoices(port) },
  {
    id: 'sync-now',
    title: 'Sync with GitHub now',
    subtitle: 'Ignores the hourly budget and pushes what has been counted',
    run: async () => {
      const { synced, bookmarks } = await port.send({ type: 'SYNC_NOW', force: true });
      return synced ? `Synced ${bookmarks} bookmarks` : 'Nothing to sync — log in first';
    },
  },
  {
    id: 'set-translation-key',
    title: 'Set the DeepL API key…',
    subtitle: 'For >t translations — free keys at deepl.com/pro-api; empty forgets the key',
    prompts: [{ label: 'DeepL API key' }],
    run: async ([key = '']: string[]) => {
      await port.send({ type: 'SET_TRANSLATION_KEY', key: key.trim() });
      return key.trim() ? 'Saved the DeepL API key' : 'Forgot the DeepL API key';
    },
  },
  {
    id: 'open-console',
    title: 'Open the kaihuman console',
    run: async () => {
      await port.send({ type: 'OPEN_URL', url: CONSOLE_URL });
      return 'Opening the console';
    },
  },
];

/** A repository's pages on GitHub, offered with ⇥ on a repository in the `>r` mode. */
export const GITHUB_REPO_VIEWS: readonly { title: string; path: string }[] = [
  { title: 'Issues', path: '/issues' },
  { title: 'Pull requests', path: '/pulls' },
  { title: 'Actions', path: '/actions' },
  { title: 'Releases', path: '/releases' },
  { title: 'Discussions', path: '/discussions' },
  { title: 'Commits', path: '/commits/HEAD' },
  { title: 'Branches', path: '/branches' },
  { title: 'Tags', path: '/tags' },
  { title: 'Wiki', path: '/wiki' },
  { title: 'Projects', path: '/projects' },
  { title: 'Insights', path: '/pulse' },
  { title: 'Settings', path: '/settings' },
];

const promptItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const { files } = await port.send({ type: 'LIST_PROMPT_FILES' });
  if (!files.length) throw new Error('No .prompts.md files in this repository yet');
  return files.flatMap((file) =>
    parsePrompts(file.content).map((prompt, index) => ({
      id: `prompt:${file.path}:${index}`,
      title: prompt.title,
      subtitle: [
        ...prompt.tags.map((tag) => `#${tag}`),
        prompt.body.split('\n').find((line) => line.trim()) ?? '',
      ].join(' '),
      keywords: [...prompt.tags, prompt.body].join(' '),
      copy: prompt.body,
    })),
  );
};

const translationItems = async (port: ActionPort, query: string): Promise<ModeItem[]> => {
  const { text, targets } = parseTranslationQuery(query);
  if (!text) return [];
  const { translations } = await port.send({ type: 'TRANSLATE', text, targets });
  // Kept as typed, `fr:` and all, so choosing it again asks for the same languages.
  await port
    .send({ type: 'ADD_TRANSLATION_HISTORY', text: query.trim() })
    .catch((e) => console.warn('LifeOS palette: could not remember the translation', e));
  return usefulTranslations(translations).map((translation) => ({
    id: `translation:${translation.target}`,
    title: translation.text,
    subtitle: `${translation.detectedSource} → ${translation.target} · ⏎ copies`,
    copy: translation.text,
  }));
};

/** Saves the text to the knowledge base's inbox; the one entry left opens the new file. */
const captureItems = async (port: ActionPort, text: string): Promise<ModeItem[]> => {
  const { path, content } = knowledgeNote(text, new Date());
  const { url } = await port.send({ type: 'CAPTURE_KNOWLEDGE', path, content });
  return [
    {
      id: `capture:${path}`,
      title: `Captured “${text.trim().split('\n')[0]}”`,
      subtitle: `${path} · ⏎ opens it in Kaihuman`,
      url,
    },
  ];
};

const githubRepoItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const { repos } = await port.send({ type: 'LIST_GITHUB_REPOS' });
  return repos.map((repo) => {
    const url = `https://github.com/${repo.fullName}`;
    return {
      id: `github:${repo.fullName}`,
      title: repo.fullName,
      subtitle: repo.description ?? '',
      url,
      children: GITHUB_REPO_VIEWS.map((view) => ({
        id: `github:${repo.fullName}${view.path}`,
        title: `${repo.fullName} · ${view.title}`,
        url: `${url}${view.path}`,
      })),
    };
  });
};

/** What `>g` searches in a repository, as GitHub's own search filters name them. */
const GITHUB_SEARCHES = [
  { path: 'issues', title: 'Issues', filter: 'is:issue' },
  { path: 'pulls', title: 'Pull requests', filter: 'is:pr' },
] as const;

/** The repository's issues or pull requests matching `term`; with no term, the plain list. */
export const githubSearchUrl = (repo: string, path: 'issues' | 'pulls', term: string) => {
  const base = `https://github.com/${repo}/${path}`;
  const filter = GITHUB_SEARCHES.find((search) => search.path === path)?.filter;
  return term.trim() ? `${base}?${new URLSearchParams({ q: `${filter} ${term.trim()}` })}` : base;
};

/** Choosing a repository lists what to search in it; choosing one of those asks for the term. */
const githubSearchItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const { repos } = await port.send({ type: 'LIST_GITHUB_REPOS' });
  return repos.map((repo) => ({
    id: `github-search:${repo.fullName}`,
    title: repo.fullName,
    subtitle: repo.description ?? '',
    children: GITHUB_SEARCHES.map((search) => ({
      id: `github-search:${repo.fullName}/${search.path}`,
      title: search.title,
      subtitle: `Search the ${search.title.toLowerCase()} of ${repo.fullName}`,
      action: {
        id: `github-search:${repo.fullName}/${search.path}`,
        title: `${repo.fullName} · ${search.title}`,
        prompts: [{ label: 'Search term' }],
        opens: ([term = '']: string[]) => ({
          id: `github-search:${repo.fullName}/${search.path}:${term.trim()}`,
          title: term.trim() ? `${search.title} “${term.trim()}”` : search.title,
          subtitle: repo.fullName,
          url: githubSearchUrl(repo.fullName, search.path, term),
        }),
      },
    })),
  }));
};

/** `>gw`'s searches, in the order its groups are listed. */
const GITHUB_WORK: { filter: GithubWorkFilter; group: string }[] = [
  { filter: 'review-requested', group: 'Review requested' },
  { filter: 'assigned', group: 'Assigned to you' },
  { filter: 'failing', group: 'Your pull requests with failing checks' },
];

/** Each open issue or pull request once, under the first search that found it. */
const githubWorkItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const answers = await Promise.all(
    GITHUB_WORK.map((search) => port.send({ type: 'LIST_GITHUB_WORK', filter: search.filter })),
  );
  const seen = new Set<string>();
  const items = GITHUB_WORK.flatMap((search, index) =>
    (answers[index]?.items ?? []).flatMap((work): ModeItem[] => {
      if (seen.has(work.url)) return [];
      seen.add(work.url);
      return [
        {
          id: `github-work:${work.url}`,
          title: work.title,
          subtitle: `${work.repo}#${work.number} · ${work.pullRequest ? 'pull request' : 'issue'} · updated ${work.updatedAt.slice(0, 10)}`,
          url: work.url,
          group: search.group,
        },
      ];
    }),
  );
  if (!items.length) throw new Error('Nothing on GitHub is waiting on you');
  return items;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** `2026-09-23 10:30`, in local time. */
export const formatStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** A dump's first non-empty line, as its title. Dumps were `>d` before braindumps. */
const dumpTitle = (text: string) => {
  const line =
    text
      .split('\n')
      .find((candidate) => candidate.trim())
      ?.trim() ?? '';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line || '(blank)';
};

/** An open dump. Its id came from its first save, back when `>d` still created dumps. */
const dumpEditor = (port: ActionPort, dump: { id: string; text: string }): EditableText => {
  let id: string | undefined = dump.id;
  return {
    title: dumpTitle(dump.text),
    text: dump.text,
    save: async (text) => {
      ({ id } = await port.send({ type: 'SAVE_DUMP', ...(id ? { id } : {}), text }));
    },
    saveAs: {
      suggestedPath: () => `~/Documents/dump-${formatStamp(new Date()).replace(/[ :]/g, '-')}.txt`,
      save: async (path, text) => (await port.send({ type: 'EXPORT_DUMP', path, text })).path,
    },
  };
};

/** Hands over to the braindump window; the backend hides the palette for it. */
const openBraindump = (port: ActionPort, id?: BraindumpId) => async () => {
  await port.send({ type: 'OPEN_BRAINDUMP', ...(id ? { id } : {}) });
  return '';
};

/** Deleting is one keystroke away from opening, so it asks for the word, as tab groups do. */
const confirmDelete = (title: string) => [{ label: `Type DELETE to delete “${title}”` }];

const confirmed = (input = '') => input.trim().toUpperCase() === 'DELETE';

/**
 * Deletes a braindump here, then syncs so the repo follows at once. The sync deletes only the
 * version this machine last saw: an edit made elsewhere since comes back instead of being lost.
 */
const deleteBraindump = (port: ActionPort, id: BraindumpId, title: string): PaletteAction => ({
  id: `braindump:${id}:delete`,
  title: `Delete ${title}`,
  prompts: confirmDelete(title),
  recent: false,
  run: async ([input]: string[]) => {
    if (!confirmed(input)) return 'Left alone';
    await port.send({ type: 'SAVE_BRAINDUMP', id, text: '' });
    try {
      await port.send({ type: 'SYNC_BRAINDUMPS' });
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return `Deleted ${title} here; the repo follows on the next sync (${reason})`;
    }
    return `Deleted ${title}`;
  },
});

const braindumpItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const [{ braindumps }, { dumps }] = await Promise.all([
    port.send({ type: 'LIST_BRAINDUMPS' }),
    port.send({ type: 'LIST_DUMPS' }),
  ]);
  return [
    {
      id: 'braindump:new',
      title: 'New braindump',
      subtitle: 'Opens the braindump window — saved as you type, in the repo once you stop',
      action: {
        id: 'braindump:new',
        title: 'New braindump',
        run: openBraindump(port),
        closes: true,
      },
    },
    ...braindumps.map((dump): ModeItem => {
      const title = braindumpTitle(dump.text);
      const open: PaletteAction = {
        id: `braindump:${dump.id}`,
        title,
        run: openBraindump(port, dump.id),
        closes: true,
        recent: false,
      };
      return {
        id: `braindump:${dump.id}`,
        title,
        subtitle: `${formatStamp(new Date(dump.updatedAt))} · ${plural(dump.text.split('\n').length, 'line')}${dump.synced ? '' : ' · not synced yet'}`,
        keywords: dump.text,
        action: open,
        children: [
          {
            id: `braindump:${dump.id}:open`,
            title: 'Open in the braindump window',
            action: open,
          },
          {
            id: `braindump:${dump.id}:delete`,
            title: 'Delete…',
            subtitle: 'Here and in the repo — git history keeps it',
            action: deleteBraindump(port, dump.id, title),
          },
        ],
      };
    }),
    // Dumps from before braindumps: still here to copy or clear, but never sent anywhere.
    ...dumps.map(
      (dump): ModeItem => ({
        id: `dump:${dump.id}`,
        title: dumpTitle(dump.text),
        subtitle: `${formatStamp(new Date(dump.updatedAt))} · ${plural(dump.text.split('\n').length, 'line')}`,
        keywords: dump.text,
        group: 'Old dumps — on this machine only',
        edit: () => dumpEditor(port, dump),
        children: [
          {
            id: `dump:${dump.id}:delete`,
            title: 'Delete…',
            subtitle: 'From this machine — it was never anywhere else',
            action: {
              id: `dump:${dump.id}:delete`,
              title: `Delete ${dumpTitle(dump.text)}`,
              prompts: confirmDelete(dumpTitle(dump.text)),
              recent: false,
              run: async ([input]: string[]) => {
                if (!confirmed(input)) return 'Left alone';
                await port.send({ type: 'SAVE_DUMP', id: dump.id, text: '' });
                return `Deleted ${dumpTitle(dump.text)}`;
              },
            },
          },
        ],
      }),
    ),
  ];
};

/**
 * `>d` — braindumps, for the desktop: a new one or an existing one opens in the braindump window.
 * Old local dumps are listed below them until they are cleared.
 */
export const dumpMode = (port: ActionPort): PaletteMode => ({
  prefix: 'd',
  title: 'Braindumps',
  placeholder: 'Search braindumps — ⏎ opens one in the braindump window, ⇥ to delete it',
  description: 'Braindumps: a window that saves as you type and keeps each one in the repo',
  load: () => braindumpItems(port),
});

/**
 * What can be done with a filled-in command. Copying comes first, so a quick second ⏎ copies rather
 * than runs; the command itself is listed in full below, so what runs is always in sight.
 */
const commandChoices = (port: ActionPort, command: string, canRun: boolean): ModeItem[] => {
  const run = (where: 'terminal' | 'background', title: string, done: string): ModeItem => ({
    id: `command:${where}`,
    title,
    group: 'Choose',
    action: {
      id: `command:${where}`,
      title,
      recent: false,
      closes: true,
      run: async () => {
        await port.send({ type: 'RUN_COMMAND', command, where });
        return done;
      },
    },
  });
  return [
    { id: 'command:copy', title: 'Copy', group: 'Choose', copy: command },
    ...(canRun
      ? [
          run('terminal', 'Run in terminal', 'Running in ghostty'),
          run('background', 'Run in the background', 'Running — a notification says how it ended'),
        ]
      : []),
    { id: 'command:text', title: command, group: 'The command', copy: command },
  ];
};

const commandItems = async (port: ActionPort, canRun: boolean): Promise<ModeItem[]> => {
  const { files } = await port.send({ type: 'LIST_COMMAND_FILES' });
  if (!files.length) throw new Error('No .commands.md files in this repository yet');
  return files.flatMap((file) =>
    parseCommands(file.content).map((entry, index) => {
      const parameters = commandParameters(entry.command);
      return {
        id: `command:${file.path}:${index}`,
        title: entry.title,
        subtitle: [...entry.tags.map((tag) => `#${tag}`), entry.command.split('\n')[0]].join(' '),
        keywords: [...entry.tags, entry.command, entry.note].join(' '),
        action: {
          id: `command:${file.path}:${index}`,
          title: entry.title,
          subtitle: entry.command,
          recent: false as const,
          prompts: parameters.map((name) => ({ label: name })),
          choices: (values: string[]) =>
            commandChoices(
              port,
              fillCommand(
                entry.command,
                Object.fromEntries(parameters.map((name, n) => [name, values[n] ?? ''])),
              ),
              canRun,
            ),
        },
      };
    }),
  );
};

/**
 * `>x` — the repository's `.commands.md` files: ⏎ asks for each `{{name}}`, then offers to copy
 * the filled-in command or, where the surface can (`canRun`, the desktop), to run it.
 */
export const commandsMode = (port: ActionPort, { canRun }: { canRun: boolean }): PaletteMode => ({
  prefix: 'x',
  title: 'Commands',
  placeholder: 'Search commands — ⏎ asks for its {{parameters}}',
  description: canRun
    ? 'Commands from the repository’s .commands.md files — fill in each {{parameter}}, then copy or run (terminal or background)'
    : 'Commands from the repository’s .commands.md files — fill in each {{parameter}}, then copy (the desktop palette can also run them)',
  load: () => commandItems(port, canRun),
});

/** Where `>c` sends a prompt: a new Claude Code session on claude.ai. */
export const CLAUDE_CODE_URL = 'https://claude.ai/code';

/**
 * The new-session link for `repo`, encoded as omarchy's script encodes it: spaces in the prompt as
 * `+`, the repository's slash kept.
 */
export const claudeCodeUrl = (repo: string, prompt: string, branch = 'main') => {
  const plus = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
  const repoPath = repo.split('/').map(encodeURIComponent).join('/');
  return `${CLAUDE_CODE_URL}?prompt=${plus(prompt)}&repo=${repoPath}&branch=${plus(branch)}`;
};

const claudeCodeItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const { repos } = await port.send({ type: 'LIST_CLAUDE_CODE_REPOS' });
  return repos.map((repo) => ({
    id: `claude-code:${repo}`,
    title: repo,
    subtitle: '⏎ then type the prompt',
    action: {
      id: `claude-code:${repo}`,
      title: `Claude Code: ${repo}`,
      prompts: [{ label: 'Prompt' }],
      opens: ([prompt = '']: string[]) => {
        if (!prompt.trim()) throw new Error('Type a prompt for Claude Code');
        return {
          id: `claude-code:${repo}:${prompt.trim()}`,
          title: `Claude Code: ${prompt.trim()}`,
          subtitle: repo,
          url: claudeCodeUrl(repo, prompt.trim()),
        };
      },
    },
  }));
};

/** `>c` — a new Claude Code session in the browser, for a repository and a prompt. Desktop only. */
export const claudeCodeMode = (port: ActionPort): PaletteMode => ({
  prefix: 'c',
  title: 'Claude Code',
  placeholder: 'Search repositories — ⏎ then type the prompt',
  description:
    'Start a Claude Code session in the browser: pick a repository, type the prompt, ⏎ opens claude.ai/code',
  load: () => claudeCodeItems(port),
});

type UsageAnswer = PaletteResponse<'GET_CLAUDE_USAGE'>;

const usageAccountRows = (answer: UsageAnswer, now: Date) =>
  answer.accounts.flatMap((account) => usageRows(account.name, account, now));

/**
 * `>u` — Claude usage for each configured account. Desktop only: it reads the local credentials.
 *
 * The last fetch is cached by the backend and shown at once, its age on the first row; a cache 5
 * minutes old or older is synced behind it, and the fresh rows replace it when they arrive.
 */
export const claudeUsageMode = (port: ActionPort): PaletteMode => {
  /** What the last load showed, so a sync that fails leaves it in place. */
  let shown: (UsageAnswer & { fetchedAt: number }) | null = null;

  return {
    prefix: 'u',
    title: 'Claude usage',
    placeholder: 'Filter usage — ⏎ opens the usage page',
    description:
      'Claude rate limits and spend per account, with pace and reset times — as the claude.ai usage page shows them; cached, synced in the background once 5 min old',
    // The rows are a status view; choosing one only opens the usage page.
    recents: false,
    load: async () => {
      const now = new Date();
      const cached = await port.send({ type: 'GET_CLAUDE_USAGE', cached: true });
      if (cached.fetchedAt === undefined) {
        // Nothing cached yet: this once, the palette waits for the endpoint.
        const fresh = await port.send({ type: 'GET_CLAUDE_USAGE' });
        const fetchedAt = fresh.fetchedAt ?? now.getTime();
        shown = null;
        return [
          usageStatusRow(fetchedAt, now.getTime(), 'synced'),
          ...usageAccountRows(fresh, now),
        ];
      }
      shown = { ...cached, fetchedAt: cached.fetchedAt };
      const state = usageNeedsSync(shown.fetchedAt, now.getTime()) ? 'syncing' : 'cached';
      return [
        usageStatusRow(shown.fetchedAt, now.getTime(), state),
        ...usageAccountRows(shown, now),
      ];
    },
    refresh: () => {
      const base = shown;
      if (!base || !usageNeedsSync(base.fetchedAt, Date.now())) return null;
      return (async () => {
        let failed: string;
        try {
          const fresh = await port.send({ type: 'GET_CLAUDE_USAGE' });
          const now = new Date();
          if (fresh.accounts.some((account) => account.usage)) {
            return [
              usageStatusRow(fresh.fetchedAt ?? now.getTime(), now.getTime(), 'synced'),
              ...usageAccountRows(fresh, now),
            ];
          }
          failed = fresh.accounts.find((account) => account.error)?.error ?? 'no usage came back';
        } catch (e: any) {
          failed = e?.message || 'the usage endpoint did not answer';
        }
        const now = new Date();
        return [
          usageStatusRow(base.fetchedAt, now.getTime(), { failed }),
          ...usageAccountRows(base, now),
        ];
      })();
    },
  };
};

/**
 * What can be done with a repo file whose widget can add to it: open it in the console, or add an
 * entry as the widget's Add form would. None for any other file, which is simply opened.
 */
export const fileChoices = (port: ActionPort, file: RepoResult): ModeItem[] => {
  const kind = entryKindOf(file.path);
  if (!kind) return [];
  return [
    {
      id: `repo:${file.path}`,
      title: `Open ${file.name} in Kaihuman`,
      subtitle: file.path,
      url: file.url,
    },
    {
      id: `entry:${file.path}`,
      title: `Add ${kind.entry}…`,
      subtitle: file.path,
      action: {
        id: `entry:${file.path}`,
        title: `Add ${kind.entry} to ${file.name}`,
        subtitle: file.path,
        prompts: kind.prompts,
        // Recent replays actions by id from the top-level list, which this is not in.
        recent: false,
        run: async (answers) => {
          await addEntry(port, file.path, kind, answers);
          return `Added ${kind.entry} to ${file.path}`;
        },
      },
    },
  ];
};

const entryFileItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const { files } = await port.send({ type: 'LIST_ENTRY_FILES' });
  if (!files.length) throw new Error('No todo lists, action logs, events, prompts or commands yet');
  return files.map((file) => ({
    id: `entry-file:${file.path}`,
    title: file.name,
    subtitle: file.path,
    action: {
      id: `entry-file:${file.path}`,
      title: file.name,
      recent: false as const,
      choices: () => fileChoices(port, file),
    },
  }));
};

/**
 * The prefix modes every surface offers: `>p` prompts, `>t` translate, `>r` GitHub repositories,
 * `>g` a search in one of them, `>gw` GitHub work waiting on you, `>f` the files widgets add to,
 * `>q` a knowledge capture, `>id` ideas, `>k` conversions and `>s` symbols. Link tools like `>l` come from the
 * repository's palette settings instead (`loadSettings`).
 */
export const paletteModes = (port: ActionPort): PaletteMode[] => [
  {
    prefix: 'p',
    title: 'Prompts',
    placeholder: 'Search prompts — ⏎ copies one',
    description: 'The prompts in the repository’s .prompts.md files — ⏎ copies one',
    load: () => promptItems(port),
  },
  {
    prefix: 't',
    title: 'Translate',
    placeholder: 'Text to translate — “fr: …” for one language',
    description:
      'DeepL into English and German, “>t fr: …” for one language; with nothing typed, the last 20 texts',
    submit: (query) => translationItems(port, query),
    history: async () => (await port.send({ type: 'GET_TRANSLATION_HISTORY' })).texts,
  },
  {
    prefix: 'r',
    title: 'Repos',
    placeholder: 'Search GitHub repositories — ⇥ for issues, pull requests…',
    description: 'Open one of your GitHub repositories — ⇥ for its issues, pull requests, actions…',
    load: () => githubRepoItems(port),
  },
  {
    prefix: 'g',
    title: 'GitHub search',
    placeholder: 'Search GitHub repositories — ⏎ then issues or pull requests',
    description:
      'Search a GitHub repository: pick it, then issues or pull requests, then type the search term',
    load: () => githubSearchItems(port),
  },
  {
    prefix: 'gw',
    title: 'GitHub work',
    placeholder: 'Filter what waits on you on GitHub — ⏎ opens it',
    description:
      'Open pull requests waiting for your review, issues and pull requests assigned to you, and your pull requests with failing checks',
    load: () => githubWorkItems(port),
  },
  {
    prefix: 'f',
    title: 'Files',
    placeholder: 'Search todo lists, logs, events… — ⏎ opens or adds',
    description:
      'The repository’s todo lists, action logs, events, prompts and commands — ⏎ opens one in Kaihuman or adds an entry, as its widget does',
    load: () => entryFileItems(port),
  },
  {
    prefix: 'q',
    title: 'Capture',
    placeholder: 'A thought, a link, a quote — ⏎ saves it to the knowledge base',
    description:
      'Saves what is typed to the knowledge base’s inbox (.kh/raw/) for /kb-ingest, as kaihuman capture does; any text typed outside the mode is offered too',
    // A capture is done once; there is nothing to choose again.
    recents: false,
    submit: (text) => captureItems(port, text),
  },
  ideasMode(port),
  {
    prefix: 'k',
    title: 'Convert',
    placeholder: 'A color, number, sum, date, quantity (5 km) or text — ⏎ copies',
    description:
      'Colors (#hex, rgb, hsl), number bases, arithmetic, timestamps, metric ⇄ US units (5 km, 350 °F, 5 km in ft), letter case and Lorem ipsum (“lorem 3”) — ⏎ copies',
    recents: false,
    links: (query) => conversionItems(query, true),
  },
  {
    prefix: 's',
    title: 'Symbols',
    placeholder: 'Search arrows, math, currency, emoji, kaomoji… — ⏎ copies',
    description: 'Symbols, emoji and kaomoji by name — ⏎ copies one',
    load: async () => symbolItems(),
  },
];

/** The handlers that only talk to the backend; the rest differ per surface. */
export const portHandlers = (
  port: ActionPort,
): Omit<PaletteHandlers, 'actions' | 'open' | 'copy' | 'modes'> => ({
  loadBookmarks: async () => (await port.send({ type: 'GET_BOOKMARKS' })).bookmarks,
  loadSettings: async () =>
    usablePaletteSettings((await port.send({ type: 'GET_PALETTE_SETTINGS' })).content),
  searchRepo: async (query) => (await port.send({ type: 'SEARCH_REPO', query })).results,
  loadCapture: () => loadBusinessCapture(port, CONSOLE_URL),
  fileChoices: (file) => fileChoices(port, file),
  loadRecents: async () => (await port.send({ type: 'GET_RECENTS' })).recents,
  rememberRecent: (entry) => {
    port
      .send({ type: 'ADD_RECENT', entry })
      .catch((e) => console.warn('LifeOS palette: could not record', entry, e));
  },
  loadModeRecents: async (prefix) => (await port.send({ type: 'GET_MODE_RECENTS', prefix })).ids,
  rememberModeRecent: (prefix, id) => {
    port
      .send({ type: 'ADD_MODE_RECENT', prefix, id })
      .catch((e) => console.warn('LifeOS palette: could not record', prefix, id, e));
  },
  countBookmarkUse: (bookmarkId) => {
    port
      .send({ type: 'RECORD_BOOKMARK_USE', bookmarkId })
      .catch((e) => console.warn('LifeOS palette: could not count use of', bookmarkId, e));
  },
});
