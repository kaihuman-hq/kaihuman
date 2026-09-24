import { githubFileStore, layoutStore } from '@lifosy/core';
import { parseTodos, type TodoStatus } from '@lifosy/formats';
import { CheckCircle2, Circle, Clock, ExternalLink, PlayCircle, XCircle } from 'lucide-preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../../Atoms/Typography';

// ─── Config ───────────────────────────────────────────────────────────────────

export interface BoardOverviewConfig {
  showBacklog: boolean;
  showInProgress: boolean;
  showDone: boolean;
  showRejected: boolean;
  showOverdue: boolean;
  overdueDays: number;
  minAgeDays: number;
}

const DEFAULT_CONFIG: BoardOverviewConfig = {
  showBacklog: true,
  showInProgress: true,
  showDone: false,
  showRejected: false,
  showOverdue: true,
  overdueDays: 7,
  minAgeDays: 0,
};

function parseConfig(raw: string): BoardOverviewConfig {
  try {
    const parsed = JSON.parse(raw || '{}');
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function serializeConfig(cfg: BoardOverviewConfig): string {
  return JSON.stringify(cfg, null, 2);
}

// ─── Column meta ──────────────────────────────────────────────────────────────

const COLUMN_META: Record<
  string,
  { icon: any; iconClass: string; label: string; status?: TodoStatus }
> = {
  backlog: {
    icon: Circle,
    iconClass: 'text-[var(--los-muted)]',
    label: 'Inbox',
    status: 'backlog',
  },
  inProgress: {
    icon: PlayCircle,
    iconClass: 'text-yellow-400',
    label: 'In Progress',
    status: 'in-progress',
  },
  done: {
    icon: CheckCircle2,
    iconClass: 'text-[var(--los-accent)]',
    label: 'Done',
    status: 'done',
  },
  rejected: {
    icon: XCircle,
    iconClass: 'text-red-500',
    label: 'Rejected',
    status: 'rejected',
  },
  overdue: {
    icon: Clock,
    iconClass: 'text-orange-400',
    label: 'Overdue',
  },
};

// ─── Props ────────────────────────────────────────────────────────────────────

export interface BoardOverviewWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED';
  className?: string;
  onChange?: (newContent: string) => void;
  onNavigate?: () => void;
}

// ─── Shared data hook ─────────────────────────────────────────────────────────

function useStats(cfg: BoardOverviewConfig) {
  const openFiles = githubFileStore.openFiles.value;
  const tree = githubFileStore.tree.value;
  const remoteConfig = layoutStore.remoteConfig.value;

  const todoFilePaths = useMemo(() => {
    const appFolder = githubFileStore.appFolder.peek();
    const inboxPath = `${appFolder}/inbox.todos.md`;
    let paths: string[];
    if (remoteConfig) {
      paths = [
        ...new Set(
          remoteConfig.entries.filter((e) => e.path.endsWith('.todos.md')).map((e) => e.path),
        ),
      ];
    } else {
      paths = (tree ?? []).filter((t) => t.path.endsWith('.todos.md')).map((t) => t.path);
    }
    if ((tree ?? []).some((t) => t.path === inboxPath) && !paths.includes(inboxPath)) {
      paths = [inboxPath, ...paths];
    }
    return paths;
  }, [remoteConfig, tree]);

  useEffect(() => {
    for (const path of todoFilePaths) {
      if (!openFiles[path]) {
        githubFileStore.openFile(path);
      }
    }
  }, [todoFilePaths, openFiles]);

  const stats = useMemo(() => {
    const overdueCutoff = cfg.overdueDays * 24 * 60 * 60 * 1000;
    const minAgeCutoff = cfg.minAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();

    let backlog = 0;
    let inProgress = 0;
    let done = 0;
    let rejected = 0;
    let overdue = 0;

    for (const path of todoFilePaths) {
      const file = openFiles[path];
      if (!file?.content) continue;
      const { items } = parseTodos(file.content);

      for (const item of items) {
        // Age filter: skip items newer than minAgeDays
        if (minAgeCutoff > 0) {
          const createdTs = item.createdAt ? new Date(item.createdAt).getTime() : 0;
          if (createdTs > 0 && now - createdTs < minAgeCutoff) continue;
        }

        switch (item.status) {
          case 'backlog':
            backlog++;
            break;
          case 'in-progress':
            inProgress++;
            if (cfg.showOverdue) {
              const ts =
                item.updatedAt ?? (item.createdAt ? new Date(item.createdAt).getTime() : null);
              if (!ts || now - ts >= overdueCutoff) overdue++;
            }
            break;
          case 'done':
            done++;
            break;
          case 'rejected':
            rejected++;
            break;
        }
      }
    }

    return { backlog, inProgress, done, rejected, overdue };
  }, [todoFilePaths, openFiles, cfg]);

  return stats;
}

// ─── Widget ───────────────────────────────────────────────────────────────────

export const BoardOverviewWidget = ({
  content,
  mode,
  className,
  onChange,
  onNavigate,
}: BoardOverviewWidgetProps) => {
  const cfg = useMemo(() => parseConfig(content), [content]);
  const stats = useStats(cfg);

  const isCompact = mode === 'SMALL' || mode === 'MOBILE_COLLAPSED';

  if (mode === 'FOCUS') {
    return <FocusView cfg={cfg} stats={stats} onChange={onChange} onNavigate={onNavigate} />;
  }

  const activeColumns = buildActiveColumns(cfg, stats);

  return (
    <button
      type="button"
      onClick={onNavigate}
      className={cn(
        'w-full h-full flex flex-col gap-3 p-4 text-left transition-colors hover:bg-[var(--los-accent)]/5 focus:outline-none',
        className,
      )}
    >
      <MonoHeader className="text-[var(--los-muted)] text-xs">BOARD OVERVIEW</MonoHeader>
      <div className={cn('flex gap-4', isCompact ? 'flex-row flex-wrap' : 'flex-col')}>
        {activeColumns.map(({ key, icon: Icon, iconClass, label, count, highlight }) => (
          <StatRow
            key={key}
            icon={Icon}
            iconClass={iconClass}
            label={label}
            count={count}
            compact={isCompact}
            highlight={highlight}
          />
        ))}
      </div>
    </button>
  );
};

// ─── Focus view ───────────────────────────────────────────────────────────────

const FocusView = ({
  cfg,
  stats,
  onChange,
  onNavigate,
}: {
  cfg: BoardOverviewConfig;
  stats: ReturnType<typeof useStats>;
  onChange?: (newContent: string) => void;
  onNavigate?: () => void;
}) => {
  const [localCfg, setLocalCfg] = useState<BoardOverviewConfig>(cfg);

  const update = (patch: Partial<BoardOverviewConfig>) => {
    const next = { ...localCfg, ...patch };
    setLocalCfg(next);
    onChange?.(serializeConfig(next));
  };

  const activeColumns = buildActiveColumns(localCfg, stats);

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      {/* Stats bar */}
      <div className="shrink-0 flex items-stretch border-b border-[var(--los-border)]">
        {activeColumns.map(({ key, icon: Icon, iconClass, label, count, highlight }) => (
          <div
            key={key}
            className="flex-1 flex flex-col items-center justify-center gap-1 py-5 border-r border-[var(--los-border)] last:border-r-0"
          >
            <Icon size={16} className={iconClass} />
            <MonoHeader className={cn('text-2xl tabular-nums', highlight ? 'text-orange-400' : '')}>
              {count}
            </MonoHeader>
            <MonoText className="text-[10px] text-[var(--los-muted)] uppercase">{label}</MonoText>
          </div>
        ))}
        {activeColumns.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-[var(--los-muted)] text-xs font-mono py-5">
            No columns selected
          </div>
        )}
      </div>

      {/* Settings */}
      <div className="flex-1 overflow-y-auto p-5 space-y-6">
        {/* Columns */}
        <section className="space-y-3">
          <MonoLabel className="text-[var(--los-muted)] text-[10px] uppercase">
            Visible Columns
          </MonoLabel>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ['showBacklog', 'Inbox'],
                ['showInProgress', 'In Progress'],
                ['showDone', 'Done'],
                ['showRejected', 'Rejected'],
                ['showOverdue', 'Overdue'],
              ] as [keyof BoardOverviewConfig, string][]
            ).map(([key, label]) => (
              <Toggle
                key={key}
                label={label}
                checked={localCfg[key] as boolean}
                onChange={(v) => update({ [key]: v })}
              />
            ))}
          </div>
        </section>

        {/* Overdue threshold */}
        {localCfg.showOverdue && (
          <section className="space-y-3">
            <MonoLabel className="text-[var(--los-muted)] text-[10px] uppercase">
              Overdue Threshold
            </MonoLabel>
            <NumberInput
              label="Days in progress before overdue"
              value={localCfg.overdueDays}
              min={1}
              onChange={(v) => update({ overdueDays: v })}
            />
          </section>
        )}

        {/* Age filter */}
        <section className="space-y-3">
          <MonoLabel className="text-[var(--los-muted)] text-[10px] uppercase">
            Age Filter
          </MonoLabel>
          <NumberInput
            label="Only count items older than N days (0 = show all)"
            value={localCfg.minAgeDays}
            min={0}
            onChange={(v) => update({ minAgeDays: v })}
          />
        </section>
      </div>

      {/* Footer */}
      <div className="shrink-0 border-t border-[var(--los-border)] px-5 py-3 flex justify-end">
        <button
          type="button"
          onClick={onNavigate}
          className="flex items-center gap-2 text-xs font-mono text-[var(--los-accent)] hover:opacity-80 transition-opacity"
        >
          <ExternalLink size={12} />
          Open Board
        </button>
      </div>
    </div>
  );
};

// ─── Toggle ───────────────────────────────────────────────────────────────────

const Toggle = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) => (
  <label className="flex items-center gap-2 cursor-pointer group select-none">
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative w-8 h-4 rounded-full transition-colors shrink-0 focus:outline-none',
        checked ? 'bg-[var(--los-accent)]' : 'bg-[var(--los-border)]',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 w-3 h-3 rounded-full bg-black transition-transform',
          checked ? 'translate-x-4' : 'translate-x-0',
        )}
      />
    </button>
    <MonoText
      className={cn(
        'text-xs transition-colors',
        checked ? 'text-[var(--los-fg)]' : 'text-[var(--los-muted)]',
      )}
    >
      {label}
    </MonoText>
  </label>
);

// ─── NumberInput ─────────────────────────────────────────────────────────────

const NumberInput = ({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  onChange: (v: number) => void;
}) => (
  <div className="flex items-center gap-3">
    <input
      type="number"
      value={value}
      min={min}
      onInput={(e) => {
        const v = Number.parseInt(e.currentTarget.value, 10);
        if (!Number.isNaN(v) && v >= min) onChange(v);
      }}
      className="w-16 bg-transparent border border-[var(--los-border)] focus:border-[var(--los-accent)] px-2 py-1 text-sm font-mono text-[var(--los-fg)] focus:outline-none text-center"
    />
    <MonoText className="text-xs text-[var(--los-muted)]">{label}</MonoText>
  </div>
);

// ─── StatRow (small mode) ─────────────────────────────────────────────────────

const StatRow = ({
  icon: Icon,
  iconClass,
  label,
  count,
  compact,
  highlight,
}: {
  icon: any;
  iconClass: string;
  label: string;
  count: number;
  compact: boolean;
  highlight?: boolean;
}) => (
  <div className={cn('flex items-center gap-2', compact ? 'flex-1 min-w-[80px]' : '')}>
    <Icon size={compact ? 12 : 14} className={iconClass} />
    <MonoText
      className={cn('text-xs tabular-nums', highlight ? 'text-orange-400' : 'text-[var(--los-fg)]')}
    >
      {count}
    </MonoText>
    {!compact && <MonoText className="text-xs text-[var(--los-muted)]">{label}</MonoText>}
  </div>
);

// ─── Helpers ──────────────────────────────────────────────────────────────────

type ActiveColumn = {
  key: string;
  icon: any;
  iconClass: string;
  label: string;
  count: number;
  highlight?: boolean;
};

function buildActiveColumns(
  cfg: BoardOverviewConfig,
  stats: ReturnType<typeof useStats>,
): ActiveColumn[] {
  const push = (
    key: string,
    metaKey: keyof typeof COLUMN_META,
    count: number,
    highlight?: boolean,
  ) => {
    // biome-ignore lint/style/noNonNullAssertion: metaKey is always a known key
    const m = COLUMN_META[metaKey]!;
    result.push({
      key,
      icon: m.icon,
      iconClass: m.iconClass,
      label: m.label,
      count,
      highlight,
    });
  };

  const result: ActiveColumn[] = [];
  if (cfg.showBacklog) push('backlog', 'backlog', stats.backlog);
  if (cfg.showInProgress) push('inProgress', 'inProgress', stats.inProgress);
  if (cfg.showDone) push('done', 'done', stats.done);
  if (cfg.showRejected) push('rejected', 'rejected', stats.rejected);
  if (cfg.showOverdue) push('overdue', 'overdue', stats.overdue, stats.overdue > 0);
  return result;
}
