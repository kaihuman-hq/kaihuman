import { CONSOLE_URL } from '@kaihuman/palette';

// Defined with the shared palette, whose "Open the kaihuman console" action needs it too.
export { CONSOLE_URL };

/**
 * Deep link that opens a repo file in the console.
 *
 * The console routes `/files/<path>` with every segment percent-encoded and the slashes left
 * as separators — see `parseUrlState` in packages/ui/src/LifeOS/Layouts/MainApp.tsx, which
 * decodes the whole remainder after `/files/`. `repo` names the repository the path belongs to,
 * so a hit found while the extension points at one repo does not open the console's other repo's
 * file of the same name; the console selects it and drops the parameter again.
 */
export function consoleFileUrl(path: string, repo?: string): string {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  const query = repo ? `?${new URLSearchParams({ repo }).toString()}` : '';
  return `${CONSOLE_URL}/files/${encoded}${query}`;
}

/**
 * Whether `url` is a page of the console. The content script runs on every site, so only the
 * console may hand the extension a GitHub token; anything else could swap in its own account.
 */
export function isConsolePage(url: string | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).origin === new URL(CONSOLE_URL).origin;
  } catch {
    return false;
  }
}
