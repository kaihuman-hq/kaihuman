import type { SearchTarget } from './documents.js';

export interface OpenDeps {
  push: (href: string) => void;
  openUrl: (url: string) => void;
}

/** Kept separate from the screen so each result kind's routing is testable without a navigator. */
export function openTarget(target: SearchTarget, { push, openUrl }: OpenDeps): void {
  if (target.type === 'route') push(target.href);
  else openUrl(target.url);
}
