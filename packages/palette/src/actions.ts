/**
 * The palette wiring every surface shares.
 *
 * Everything here goes through an `ActionPort`, so it behaves the same wherever the palette runs —
 * a content script, the extension's start page, or the desktop app. Actions that read the page
 * around them — bookmarking it, pinning it, clipping a selection — stay with the content script,
 * since nothing else has such a page.
 */

import { usageRows } from './claude-usage.js';
import type {
  EditableText,
  ModeItem,
  PaletteAction,
  PaletteHandlers,
  PaletteMode,
  RepoResult,
} from './command-palette.js';
import { commandParameters, fillCommand, parseCommands } from './commands.js';
import { type EntryKind, entryKindOf } from './entries.js';
import { parsePrompts } from './prompts.js';
import type { ActionPort } from './protocol.js';
import { parseTranslationQuery, usefulTranslations } from './translate.js';

/** The Lifosy console — where a repo file is opened, rather than on GitHub. */
export const CONSOLE_URL = 'https://app.kaihuman.com';

export const splitTags = (input: string) =>
  input
    .split(/[\s,]+/)
    .map((tag) => tag.replace(/^#/, '').trim())
    .filter(Boolean);

export const plural = (count: number, one: string) => `${count} ${one}${count === 1 ? '' : 's'}`;

/** Targets for a note: the repo's quick-note files, plus the default dump. */
const noteTargets = async (port: ActionPort): Promise<PaletteAction[]> => {
  const { quickNotes } = await port.send({ type: 'FETCH_QUICK_NOTES' });
  const paths = ['.lifeos/dump.md', ...(quickNotes ?? [])];
  return Array.from(new Set(paths)).map((path) => ({
    id: `note:${path}`,
    title: path,
    // The popup picks its form the same way: an action log takes a description and tags.
    prompts: [{ label: path.endsWith('.actionlog.md') ? 'What happened? #tags' : 'Note' }],
    run: async ([input = '']: string[]) => {
      if (!input.trim()) throw new Error('Nothing to add');
      if (path.endsWith('.actionlog.md')) {
        const description = input.replace(/#[\w-]+/g, '').trim();
        await port.send({
          type: 'ADD_ACTION_LOG',
          path,
          description,
          tags: splitTags(input.match(/#[\w-]+/g)?.join(' ') ?? ''),
        });
      } else {
        await port.send({ type: 'DUMP_NOTE', path, note: input });
      }
      return `Added to ${path}`;
    },
  }));
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
    title: 'Open the Lifosy console',
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

/** The console team's logs in Tsuga, which `>l` opens. */
const TSUGA_EXPLORER_URL = 'https://app.tsuga.com/explorer';
const TSUGA_TEAM_QUERY = 'context.cloud.camunda.io/owner-team:console';

/** The explorer on the team's logs, narrowed to `term` when there is one. */
export const tsugaUrl = (term: string) => {
  const params = new URLSearchParams({
    // Tsuga's own link for the team ends its query in a space; kept, so both match exactly.
    query: term.trim() ? `${TSUGA_TEAM_QUERY} AND "${term.trim()}"` : `${TSUGA_TEAM_QUERY} `,
    extraColumns: JSON.stringify(['file', 'fn', 'service']),
    clusterIds: '8v5j-x2k0n-dzk4',
  });
  return `${TSUGA_EXPLORER_URL}?${params}`;
};

const pad = (value: number) => String(value).padStart(2, '0');

/** `2026-09-23 10:30`, in local time. */
export const formatStamp = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
  `${pad(date.getHours())}:${pad(date.getMinutes())}`;

/** A dump's first non-empty line, as its title. */
const dumpTitle = (text: string) => {
  const line =
    text
      .split('\n')
      .find((candidate) => candidate.trim())
      ?.trim() ?? '';
  return line.length > 60 ? `${line.slice(0, 59)}…` : line || '(blank)';
};

/** An open dump. A new one gets its id from the first save, so it is only created once typed in. */
const dumpEditor = (port: ActionPort, dump?: { id: string; text: string }): EditableText => {
  let id = dump?.id;
  return {
    title: dump ? dumpTitle(dump.text) : 'New dump',
    text: dump?.text ?? '',
    save: async (text) => {
      ({ id } = await port.send({ type: 'SAVE_DUMP', ...(id ? { id } : {}), text }));
    },
    saveAs: {
      suggestedPath: () => `~/Documents/dump-${formatStamp(new Date()).replace(/[ :]/g, '-')}.txt`,
      save: async (path, text) => (await port.send({ type: 'EXPORT_DUMP', path, text })).path,
    },
  };
};

const dumpItems = async (port: ActionPort): Promise<ModeItem[]> => {
  const { dumps } = await port.send({ type: 'LIST_DUMPS' });
  return [
    {
      id: 'dump:new',
      title: 'New dump',
      subtitle: 'Paste, edit, copy — saved as you type, the last 25 kept',
      edit: () => dumpEditor(port),
    },
    ...dumps.map((dump) => {
      const lines = dump.text.split('\n').length;
      return {
        id: `dump:${dump.id}`,
        title: dumpTitle(dump.text),
        subtitle: `${formatStamp(new Date(dump.updatedAt))} · ${plural(lines, 'line')}`,
        keywords: dump.text,
        edit: () => dumpEditor(port, dump),
      };
    }),
  ];
};

/**
 * `>d` — a scratch text editor with a history, for the desktop: dumps are local files, which the
 * browser has no place for.
 */
export const dumpMode = (port: ActionPort): PaletteMode => ({
  prefix: 'd',
  title: 'Dump',
  placeholder: 'Search dumps — ⏎ opens one',
  description:
    'A scratch editor for pasting and copying, the last 25 kept — ⌃⏎ copies all, ⌃S saves a copy as a file',
  load: () => dumpItems(port),
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

/** `>u` — Claude usage for each configured account. Desktop only: it reads the local credentials. */
export const claudeUsageMode = (port: ActionPort): PaletteMode => ({
  prefix: 'u',
  title: 'Claude usage',
  placeholder: 'Filter usage — ⏎ opens the usage page',
  description:
    'Claude rate limits and spend per account, with pace and reset times — as the claude.ai usage page shows them',
  load: async () => {
    const { accounts } = await port.send({ type: 'GET_CLAUDE_USAGE' });
    const now = new Date();
    return accounts.flatMap((account) => usageRows(account.name, account, now));
  },
});

/**
 * Reads the file, adds the entry and writes it back over the version read — a change made in the
 * console meanwhile fails the write rather than being overwritten.
 */
const addEntry = async (port: ActionPort, path: string, kind: EntryKind, answers: string[]) => {
  const { content, sha } = await port.send({ type: 'READ_ENTRY_FILE', path });
  const next = kind.add(content, answers, new Date());
  await port.send({ type: 'WRITE_ENTRY_FILE', path, content: next, ...(sha ? { sha } : {}) });
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
 * `>g` a search in one of them, `>l` logs in Tsuga, `>f` the files widgets add to.
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
    prefix: 'l',
    title: 'Logs',
    placeholder: 'Search the console team’s logs in Tsuga — ⏎ opens them',
    description:
      'The console team’s logs in Tsuga’s explorer, filtered by what is typed — nothing typed opens them all',
    link: (term) => ({
      id: `tsuga:${term}`,
      title: term ? `Tsuga logs “${term}”` : 'Tsuga logs',
      subtitle: 'owner-team:console',
      url: tsugaUrl(term),
    }),
  },
  {
    prefix: 'f',
    title: 'Files',
    placeholder: 'Search todo lists, logs, events… — ⏎ opens or adds',
    description:
      'The repository’s todo lists, action logs, events, prompts and commands — ⏎ opens one in Kaihuman or adds an entry, as its widget does',
    load: () => entryFileItems(port),
  },
];

/** The handlers that only talk to the backend; the rest differ per surface. */
export const portHandlers = (
  port: ActionPort,
): Omit<PaletteHandlers, 'actions' | 'open' | 'copy' | 'modes'> => ({
  loadBookmarks: async () => (await port.send({ type: 'GET_BOOKMARKS' })).bookmarks,
  searchRepo: async (query) => (await port.send({ type: 'SEARCH_REPO', query })).results,
  fileChoices: (file) => fileChoices(port, file),
  loadRecents: async () => (await port.send({ type: 'GET_RECENTS' })).recents,
  rememberRecent: (entry) => {
    port
      .send({ type: 'ADD_RECENT', entry })
      .catch((e) => console.warn('LifeOS palette: could not record', entry, e));
  },
  countBookmarkUse: (bookmarkId) => {
    port
      .send({ type: 'RECORD_BOOKMARK_USE', bookmarkId })
      .catch((e) => console.warn('LifeOS palette: could not count use of', bookmarkId, e));
  },
});
