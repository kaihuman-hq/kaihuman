import { addActionLogEntry, addTodoEntry, splitInlineTags } from '../../entries.js';
import { slugifyWords } from '../../ideas.js';
import { asSlug, type Slug } from '../ids.js';
import type { FileChanges } from '../issue.js';
import { clientDir } from '../paths.js';
import { type Client, KEY_ORDER, type Project } from '../records.js';
import type { BusinessRepo } from '../repo.js';
import { validateClient, validateProject } from '../validate.js';
import type { Issue, Result } from '../validate-kit.js';
import { stringifyYaml } from '../yaml.js';

type Action = Result<{ changes: FileChanges; message: string }>;

const refuse = (path: string, message: string): { ok: false; issues: Issue[] } => ({
  ok: false,
  issues: [{ path, message }],
});

/**
 * The slug a client or project name suggests (the ideas rule), or `null` when the name has fewer
 * than two letters or digits: the form then asks for a slug instead of inventing one.
 */
export const slugifyName = (name: string): Slug | null => asSlug(slugifyWords(name));

/** `client.slug` is the folder, so it is not part of the file. */
const withoutSlug = <T extends { slug: Slug }>({ slug: _slug, ...rest }: T) => rest;

export const createClient = (repo: BusinessRepo, client: Client): Action => {
  if (repo.clients.some((c) => c.slug === client.slug)) {
    return refuse('slug', `A client "${client.slug}" already exists.`);
  }
  const body = withoutSlug(client);
  const checked = validateClient(body, client.slug);
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: { [`${clientDir(client.slug)}/client.yaml`]: stringifyYaml(body, KEY_ORDER.client) },
      message: `business: new client ${client.slug}`,
    },
  };
};

export const createProject = (repo: BusinessRepo, project: Project): Action => {
  if (!repo.clients.some((c) => c.slug === project.client)) {
    return refuse('client', `unknown client "${project.client}"`);
  }
  if (repo.projects.some((p) => p.client === project.client && p.slug === project.slug)) {
    return refuse('slug', `A project "${project.slug}" already exists for ${project.client}.`);
  }
  const body = withoutSlug(project);
  const checked = validateProject(body, project.slug, project.client);
  if (!checked.ok) return checked;
  return {
    ok: true,
    value: {
      changes: {
        [`${clientDir(project.client)}/projects/${project.slug}.yaml`]: stringifyYaml(
          body,
          KEY_ORDER.project,
        ),
      },
      message: `business: new project ${project.slug} for ${project.client}`,
    },
  };
};

const refusal = (repo: BusinessRepo, client: Slug, text: string): Issue[] | null => {
  if (!repo.clients.some((c) => c.slug === client)) {
    return [{ path: 'client', message: `unknown client "${client}"` }];
  }
  return text.trim() ? null : [{ path: 'text', message: 'Enter some text.' }];
};

/** `todosText` is the file's current text, or `null` when the client has no todo file yet. */
export const addClientTodo = (
  repo: BusinessRepo,
  todosText: string | null,
  client: Slug,
  text: string,
  now: Date,
): Action => {
  const issues = refusal(repo, client, text);
  // `#tags` alone leave no text, which `addTodoEntry` refuses by throwing.
  if (issues || !splitInlineTags(text).text) {
    return { ok: false, issues: issues ?? [{ path: 'text', message: 'Enter some text.' }] };
  }
  return {
    ok: true,
    value: {
      changes: {
        [`${clientDir(client)}/todos.todos.md`]: addTodoEntry(todosText ?? '', { text }, now),
      },
      message: `business: todo for ${client}`,
    },
  };
};

/** `logText` is the file's current text, or `null` when the client has no log yet. */
export const addClientLog = (
  repo: BusinessRepo,
  logText: string | null,
  client: Slug,
  text: string,
  now: Date,
): Action => {
  const issues = refusal(repo, client, text);
  if (issues) return { ok: false, issues };
  return {
    ok: true,
    value: {
      changes: {
        [`${clientDir(client)}/log.actionlog.md`]: addActionLogEntry(
          logText ?? '',
          { description: text },
          now,
        ),
      },
      message: `business: log for ${client}`,
    },
  };
};
