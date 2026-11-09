import type { Scope } from './business/paths.js';

export interface BoardOverviewConfig {
  showBacklog: boolean;
  showInProgress: boolean;
  showDone: boolean;
  showRejected: boolean;
  showOverdue: boolean;
  overdueDays: number;
  minAgeDays: number;
  /** Which todo files count; client files live under `.kh/business/`. */
  scope?: Scope;
}

export const DEFAULT_BOARD_OVERVIEW_CONFIG: BoardOverviewConfig = {
  showBacklog: true,
  showInProgress: true,
  showDone: false,
  showRejected: false,
  showOverdue: true,
  overdueDays: 7,
  minAgeDays: 0,
  scope: 'all',
};

export function parseBoardOverviewConfig(raw: string): BoardOverviewConfig {
  try {
    const parsed = JSON.parse(raw || '{}');
    const scope = parsed.scope === 'business' || parsed.scope === 'personal' ? parsed.scope : 'all';
    return { ...DEFAULT_BOARD_OVERVIEW_CONFIG, ...parsed, scope };
  } catch {
    return { ...DEFAULT_BOARD_OVERVIEW_CONFIG };
  }
}

export function serializeBoardOverviewConfig(cfg: BoardOverviewConfig): string {
  return JSON.stringify(cfg, null, 2);
}
