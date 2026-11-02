import { clientOfPath, inScope, type Scope } from '@kaihuman/formats/business';
import { useState } from 'preact/hooks';

const CLIENTS_PREFIX = '.kh/business/clients/';

export type ScopeView = 'board' | 'analytics' | 'actionlog';

/** Splits a todo-file path into its directory prefix and display name. */
export function formatFilePath(fp: string): { dir: string; name: string } {
  const parts = fp.split('/');
  const raw = parts.pop() ?? fp;
  const dir = parts.length > 0 ? `${parts.join('/')}/` : '';
  const name = raw.replace(/\.todos\.md$/, '');
  return { dir, name };
}

/** Splits an action-log path into its directory prefix and display name. */
export function formatActionLogPath(fp: string): { dir: string; name: string } {
  const parts = fp.split('/');
  const raw = parts.pop() ?? fp;
  const name = raw.replace('.actionlog.md', '');
  const dir = parts.length > 0 ? `${parts.join('/')}/` : '';
  return { dir, name };
}

/** Client slug for client action logs, else the usual file name. */
export function actionLogLabel(path: string): string {
  return clientOfPath(path) ?? formatActionLogPath(path).name;
}

/**
 * Drops focused files that left the scoped list, so a scope change cannot leave a blank
 * board. Returns the same set when nothing changed, which keeps state updates idempotent.
 */
export function pruneFocus(focused: ReadonlySet<string>, paths: readonly string[]): Set<string> {
  const kept = new Set([...focused].filter((p) => paths.includes(p)));
  return kept.size === focused.size ? (focused as Set<string>) : kept;
}

/** Client slug for client files, else the usual file name. */
export function fileLabel(path: string): string {
  return clientOfPath(path) ?? formatFilePath(path).name;
}

/**
 * Applies the scope to a file list. Client files are added from the tree because a
 * dashboard config only lists explicitly pinned entries.
 */
export function withBusinessFiles(
  paths: readonly string[],
  tree: readonly { path: string; type: string }[],
  suffix: '.todos.md' | '.actionlog.md',
  scope: Scope,
): string[] {
  const added =
    scope === 'personal'
      ? []
      : tree
          .filter((t) => t.path.startsWith(CLIENTS_PREFIX) && t.path.endsWith(suffix))
          .map((t) => t.path);
  return [...new Set([...paths, ...added])].filter((p) => inScope(p, scope));
}

const isScope = (v: unknown): v is Scope => v === 'all' || v === 'business' || v === 'personal';

function readScope(view: ScopeView): Scope {
  try {
    const v = localStorage.getItem(`kh:scope:${view}`);
    return isScope(v) ? v : 'all';
  } catch {
    return 'all';
  }
}

/** Scope state remembered per view; storage may be unavailable, so it only ever degrades. */
export function usePersistedScope(view: ScopeView): [Scope, (next: Scope) => void] {
  const [scope, setScope] = useState<Scope>(() => readScope(view));
  const update = (next: Scope) => {
    setScope(next);
    try {
      localStorage.setItem(`kh:scope:${view}`, next);
    } catch {
      // storage unavailable: scope still applies for this session
    }
  };
  return [scope, update];
}
