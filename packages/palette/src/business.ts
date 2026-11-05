/**
 * Client targets for quick capture — `todo acme: send draft`, `log acme: called`, `timer
 * acme/website`, `stop timer` — as the console's Quick pages and palette read them. Parsing and
 * the file change are `@kaihuman/formats/business`', so a capture here writes what the console
 * would; the backend only reads and writes the files.
 */
import {
  buildCapture,
  type Capture,
  capturePath,
  loadBusinessRepo,
  parseCapture,
} from '@kaihuman/formats/business';
import type { ModeItem } from './command-palette.js';
import type { ActionPort } from './protocol.js';

/** Turns a typed line into its capture row, or null when it is not one. */
export type CaptureLookup = (query: string) => ModeItem | null;

const describe = (c: Capture): string => {
  switch (c.kind) {
    case 'todo':
      return `Add todo for ${c.client}: ${c.text}`;
    case 'log':
      return `Log for ${c.client}: ${c.text}`;
    case 'start-timer':
      return `Start timer for ${c.client}${c.project ? `/${c.project}` : ''}`;
    case 'stop-timer':
      return 'Stop timer (opens form)';
  }
};

const DONE = {
  todo: (client: string) => `Todo added for ${client}`,
  log: (client: string) => `Logged for ${client}`,
  'start-timer': (client: string) => `Timer started for ${client}`,
} as const;

/**
 * Reads the clients once; null when business is not set up, so the palette offers nothing new.
 * Each capture reads its file fresh and writes over that version, in one commit.
 */
export async function loadBusinessCapture(
  port: ActionPort,
  consoleUrl: string,
  now: () => Date = () => new Date(),
): Promise<CaptureLookup | null> {
  const { files } = await port.send({ type: 'READ_BUSINESS_CONTEXT' });
  if (files.length === 0) return null;
  const contents = new Map(files.map((file) => [file.path, file.content]));
  const repo = loadBusinessRepo(contents, [...contents.keys()]);
  const clients = repo.clients.map((client) => client.slug);
  if (clients.length === 0) return null;

  return (query) => {
    const capture = parseCapture(query, clients);
    if (!capture) return null;
    const title = describe(capture);
    if (capture.kind === 'stop-timer') {
      return {
        id: 'business:stop-timer',
        title,
        subtitle: 'The console’s time form, filled from the running timer',
        url: `${consoleUrl}/business/time/new?from=timer`,
      };
    }
    const path = capturePath(capture);
    return {
      id: `business:${capture.kind}`,
      title,
      subtitle: path,
      action: {
        id: `business:${capture.kind}`,
        title,
        recent: false,
        run: async () => {
          const { content, sha } = await port.send({ type: 'READ_BUSINESS_FILE', path });
          const built = buildCapture(repo, capture, content, now());
          if (!built.ok) throw new Error(built.issues[0]?.message ?? 'Nothing was saved.');
          await port.send({
            type: 'WRITE_BUSINESS_FILE',
            path,
            content: built.value.content,
            message: built.value.message,
            ...(sha ? { sha } : {}),
          });
          return DONE[capture.kind](capture.client);
        },
      },
    };
  };
}
