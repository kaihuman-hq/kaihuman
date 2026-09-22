/** The Lifosy console — where a repo file is opened, rather than on GitHub. */
export const CONSOLE_URL = 'https://app.kaihuman.com';

/**
 * Deep link that opens a repo file in the console.
 *
 * The console routes `/files/<path>` with every segment percent-encoded and the slashes left
 * as separators — see `parseUrlState` in packages/ui/src/LifeOS/Layouts/MainApp.tsx, which
 * decodes the whole remainder after `/files/`.
 */
export function consoleFileUrl(path: string): string {
  const encoded = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
  return `${CONSOLE_URL}/files/${encoded}`;
}
