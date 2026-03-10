import { githubFileStore } from '@lifosy/core';
import { ArrowLeft, BarChart2 } from 'lucide-preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '../../utils';
import { MonoHeader, MonoLabel, MonoText } from '../Atoms/Typography';
import { DonutChart } from '../Charts/DonutChart';
import { StackedBarChart, type StackedBarData } from '../Charts/StackedBarChart';
import {
  type Milestone,
  parseTodos,
  STATUS_LABELS,
  type TodoData,
  type TodoItem,
  type TodoStatus,
} from '../Organisms/Widgets/TodoLogic';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<TodoStatus, string> = {
  backlog: '#858595',
  'in-progress': '#f0c040',
  done: '#00f0ff',
  rejected: '#f05050',
};

const CHART_COLORS = { accent: '#00f0ff', muted: '#858595', border: '#2a2a35', bg: '#0a0a0f' };

type TimeFrame = 'ALL' | '4W' | '13W' | '52W';
const TIME_FRAME_LABELS: Record<TimeFrame, string> = {
  ALL: 'ALL',
  '4W': '4 WEEKS',
  '13W': 'QUARTER',
  '52W': 'YEAR',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCutoff(tf: TimeFrame): Date | null {
  if (tf === 'ALL') return null;
  const days = tf === '4W' ? 28 : tf === '13W' ? 91 : 365;
  return new Date(Date.now() - days * 86400000);
}

function getWeekLabel(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function getWeeksBetween(start: Date, end: Date): string[] {
  const weeks: string[] = [];
  const cur = new Date(start);
  const day = cur.getDay() || 7;
  cur.setDate(cur.getDate() - day + 1); // snap to Monday
  const endMs = end.getTime();
  while (cur.getTime() <= endMs) {
    weeks.push(getWeekLabel(cur));
    cur.setDate(cur.getDate() + 7);
  }
  return weeks;
}

// ─── useResizeObserver ────────────────────────────────────────────────────────

const useResizeObserver = (ref: { current: Element | null }) => {
  const [dims, setDims] = useState({ width: 0, height: 0 });
  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setDims({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);
  return dims;
};

// ─── StatCard ─────────────────────────────────────────────────────────────────

const StatCard = ({
  label,
  value,
  color,
  sub,
}: {
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}) => (
  <div className="border border-[var(--los-border)] p-4 flex flex-col gap-1 min-w-0">
    <MonoLabel className="text-[10px] text-[var(--los-muted)]">{label}</MonoLabel>
    <span
      className="text-2xl font-mono font-bold leading-none"
      style={{ color: color ?? '#e0e0e8' }}
    >
      {value}
    </span>
    {sub && <MonoText className="text-[10px] text-[var(--los-muted)]">{sub}</MonoText>}
  </div>
);

// ─── SectionPanel ─────────────────────────────────────────────────────────────

const SectionPanel = ({
  title,
  children,
  className,
}: {
  title: string;
  children: any;
  className?: string;
}) => (
  <div className={cn('border border-[var(--los-border)] flex flex-col', className)}>
    <div className="h-8 border-b border-[var(--los-border)] flex items-center px-4 shrink-0">
      <MonoLabel className="text-[10px]">{title}</MonoLabel>
    </div>
    <div className="flex-1 p-4 min-h-0">{children}</div>
  </div>
);

// ─── TodoAnalytics ────────────────────────────────────────────────────────────

export interface TodoAnalyticsProps {
  onNavigateBack?: () => void;
}

interface FlatItem extends TodoItem {
  source: string;
}

interface FlatMilestone extends Milestone {
  source: string;
}

export const TodoAnalytics = ({ onNavigateBack }: TodoAnalyticsProps) => {
  const openFiles = githubFileStore.openFiles.value;
  const tree = githubFileStore.tree.value;
  const [timeFrame, setTimeFrame] = useState<TimeFrame>('13W');

  // Load tree if empty (direct navigation)
  useEffect(() => {
    if (githubFileStore.tree.peek().length === 0) {
      githubFileStore.loadTree();
    }
  }, []);

  const todoFilePaths = useMemo(
    () => (tree ?? []).filter((t) => t.path.endsWith('.todos.md')).map((t) => t.path),
    [tree],
  );

  useEffect(() => {
    for (const path of todoFilePaths) {
      if (!openFiles[path]) githubFileStore.openFile(path);
    }
  }, [todoFilePaths, openFiles]);

  const parsedFiles = useMemo<{ path: string; data: TodoData }[]>(
    () =>
      todoFilePaths
        .filter((p) => openFiles[p]?.content !== undefined)
        .map((p) => ({ path: p, data: parseTodos(openFiles[p]?.content ?? '') })),
    [todoFilePaths, openFiles],
  );

  // Flat list of all items + milestones
  const allItems = useMemo<FlatItem[]>(() => {
    const result: FlatItem[] = [];
    for (const { path, data } of parsedFiles) {
      for (const item of data.items) {
        result.push({ ...item, source: path });
      }
    }
    return result;
  }, [parsedFiles]);

  const allMilestones = useMemo<FlatMilestone[]>(() => {
    const seen = new Set<string>();
    const result: FlatMilestone[] = [];
    for (const { path, data } of parsedFiles) {
      for (const m of data.milestones) {
        if (!seen.has(m.id)) {
          seen.add(m.id);
          result.push({ ...m, source: path });
        }
      }
    }
    return result.sort((a, b) => ((a.dueDate ?? '') < (b.dueDate ?? '') ? -1 : 1));
  }, [parsedFiles]);

  // ── Summary stats ─────────────────────────────────────────────────────────

  const summaryStats = useMemo(() => {
    const byStatus: Record<TodoStatus, number> = {
      backlog: 0,
      'in-progress': 0,
      done: 0,
      rejected: 0,
    };
    for (const item of allItems) byStatus[item.status]++;
    const total = allItems.length;
    const closed = byStatus.done + byStatus.rejected;
    const completionRate = closed > 0 ? Math.round((byStatus.done / closed) * 100) : null;
    const withTimestamp = allItems.filter((i) => i.createdAt || i.updatedAt).length;
    return { total, byStatus, completionRate, withTimestamp };
  }, [allItems]);

  // ── Tag counts ────────────────────────────────────────────────────────────

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of allItems) {
      for (const tag of item.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([tag, count]) => ({ tag, count }));
  }, [allItems]);

  // ── Timeline: todos by state on timeline (created-week buckets) ───────────

  const timelineData = useMemo<StackedBarData[]>(() => {
    const cutoff = getCutoff(timeFrame);
    const itemsWithDate: FlatItem[] = [];
    for (const item of allItems) {
      const createdAt = item.createdAt;
      if (!createdAt) continue;
      const d = new Date(createdAt);
      if (cutoff && d < cutoff) continue;
      itemsWithDate.push(item);
    }
    if (itemsWithDate.length === 0) return [];

    const timestamps = itemsWithDate.map((i) => new Date(i.createdAt as string).getTime());
    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    const weeks = getWeeksBetween(minDate, maxDate);

    const buckets = new Map<string, Record<TodoStatus, number>>();
    for (const w of weeks) {
      buckets.set(w, { backlog: 0, 'in-progress': 0, done: 0, rejected: 0 });
    }
    for (const item of itemsWithDate) {
      const w = getWeekLabel(new Date(item.createdAt as string));
      const b = buckets.get(w);
      if (b) b[item.status]++;
    }

    return weeks.map((w) => {
      const b = buckets.get(w) ?? { backlog: 0, 'in-progress': 0, done: 0, rejected: 0 };
      return {
        label: w.slice(5), // "W01" short form
        segments: [
          { label: STATUS_LABELS.backlog, value: b.backlog, color: STATUS_COLORS.backlog },
          {
            label: STATUS_LABELS['in-progress'],
            value: b['in-progress'],
            color: STATUS_COLORS['in-progress'],
          },
          { label: STATUS_LABELS.done, value: b.done, color: STATUS_COLORS.done },
          { label: STATUS_LABELS.rejected, value: b.rejected, color: STATUS_COLORS.rejected },
        ],
      };
    });
  }, [allItems, timeFrame]);

  // ── Velocity: done items per week ─────────────────────────────────────────

  const velocityData = useMemo<{ label: string; count: number }[]>(() => {
    const cutoff = getCutoff(timeFrame);
    const doneItems: FlatItem[] = [];
    for (const item of allItems) {
      if (item.status !== 'done') continue;
      const updatedAt = item.updatedAt;
      if (!updatedAt) continue;
      const d = new Date(updatedAt);
      if (cutoff && d < cutoff) continue;
      doneItems.push(item);
    }
    if (doneItems.length === 0) return [];

    const timestamps = doneItems.map((i) => i.updatedAt as number);
    const minDate = new Date(Math.min(...timestamps));
    const maxDate = new Date(Math.max(...timestamps));
    const weeks = getWeeksBetween(minDate, maxDate);

    const counts = new Map<string, number>();
    for (const w of weeks) counts.set(w, 0);
    for (const item of doneItems) {
      const w = getWeekLabel(new Date(item.updatedAt as number));
      counts.set(w, (counts.get(w) ?? 0) + 1);
    }
    return weeks.map((w) => ({ label: w.slice(5), count: counts.get(w) ?? 0 }));
  }, [allItems, timeFrame]);

  // ── Milestone progress ────────────────────────────────────────────────────

  const milestoneProgress = useMemo(() => {
    return allMilestones.map((ms) => {
      const items = allItems.filter((i) => i.milestoneId === ms.id);
      const byStatus: Record<TodoStatus, number> = {
        backlog: 0,
        'in-progress': 0,
        done: 0,
        rejected: 0,
      };
      for (const i of items) byStatus[i.status]++;
      const total = items.length;
      const donePct = total > 0 ? Math.round((byStatus.done / total) * 100) : 0;
      return { ms, byStatus, total, donePct };
    });
  }, [allMilestones, allItems]);

  // ── Refs for responsive charts ────────────────────────────────────────────

  const timelineRef = useRef<HTMLDivElement>(null);
  const timelineDims = useResizeObserver(timelineRef);

  const velocityRef = useRef<HTMLDivElement>(null);
  const velocityDims = useResizeObserver(velocityRef);

  const isLoading = todoFilePaths.some((p) => !openFiles[p]);

  // ── Velocity inline SVG bar chart ─────────────────────────────────────────

  const VelocityChart = () => {
    const [hovered, setHovered] = useState<number | null>(null);
    const { width, height } = velocityDims;
    if (!width || !height || velocityData.length === 0) return null;

    const padding = { top: 10, right: 10, bottom: 24, left: 28 };
    const cw = width - padding.left - padding.right;
    const ch = height - padding.top - padding.bottom;
    const maxVal = Math.max(...velocityData.map((d) => d.count), 1);
    const step = cw / velocityData.length;
    const bw = Math.max(step * 0.7, 2);
    const getX = (i: number) => padding.left + i * step + (step - bw) / 2;
    const getY = (v: number) => padding.top + ch - (v / maxVal) * ch;
    const getH = (v: number) => (v / maxVal) * ch;
    const labelStep = Math.max(Math.ceil(velocityData.length / 8), 1);

    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: chart mouse tracking
      <div className="relative w-full h-full" onMouseLeave={() => setHovered(null)}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Completion velocity bar chart"
          onMouseMove={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = e.clientX - rect.left - padding.left;
            const idx = Math.floor(x / step);
            setHovered(idx >= 0 && idx < velocityData.length ? idx : null);
          }}
        >
          {[0, 1, 2, 3].map((i) => {
            const y = padding.top + (ch / 3) * i;
            return (
              <line
                key={`grid-${i}`}
                x1={padding.left}
                y1={y}
                x2={width - padding.right}
                y2={y}
                stroke={CHART_COLORS.border}
                strokeOpacity={0.5}
                strokeDasharray="3 3"
              />
            );
          })}
          {velocityData.map((d, i) => (
            <rect
              key={d.label}
              x={getX(i)}
              y={getY(d.count)}
              width={bw}
              height={getH(d.count)}
              fill={CHART_COLORS.accent}
              opacity={hovered === null || hovered === i ? 1 : 0.4}
            />
          ))}
          {velocityData.map((d, i) => {
            if (i % labelStep !== 0 && i !== velocityData.length - 1) return null;
            return (
              <text
                key={d.label}
                x={getX(i) + bw / 2}
                y={height - 6}
                textAnchor="middle"
                fill={CHART_COLORS.muted}
                fontSize="8"
                fontFamily="monospace"
              >
                {d.label}
              </text>
            );
          })}
        </svg>
        {hovered !== null && velocityData[hovered] && (
          <div
            className="absolute pointer-events-none bg-[#0a0a0f] border border-[#2a2a35] px-2 py-1.5 z-10 shadow-xl"
            style={{ left: getX(hovered) + bw + 6, top: padding.top }}
          >
            <p className="text-[10px] font-mono text-[#858595]">{velocityData[hovered].label}</p>
            <p className="text-[10px] font-mono text-[#00f0ff]">
              {velocityData[hovered].count} done
            </p>
          </div>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="h-screen w-screen flex flex-col bg-[var(--los-bg)] text-[var(--los-fg)] overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-[var(--los-border)] flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          {onNavigateBack && (
            <button
              type="button"
              onClick={onNavigateBack}
              className="flex items-center gap-1.5 text-[var(--los-muted)] hover:text-[var(--los-fg)] transition-colors"
            >
              <ArrowLeft size={14} />
              <MonoText className="text-xs">BACK</MonoText>
            </button>
          )}
          <div className="h-4 w-px bg-[var(--los-border)]" />
          <BarChart2 size={14} className="text-[var(--los-accent)]" />
          <MonoHeader>TODO ANALYTICS</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-muted)]">
            {todoFilePaths.length} file{todoFilePaths.length !== 1 ? 's' : ''} · {allItems.length}{' '}
            tasks
          </MonoText>
        </div>

        {/* Time frame selector */}
        <div className="flex items-center gap-1 border border-[var(--los-border)] p-0.5">
          {(Object.keys(TIME_FRAME_LABELS) as TimeFrame[]).map((tf) => (
            <button
              key={tf}
              type="button"
              onClick={() => setTimeFrame(tf)}
              className={cn(
                'px-3 py-1 text-[10px] font-mono transition-colors',
                timeFrame === tf
                  ? 'bg-[var(--los-accent)] text-black font-bold'
                  : 'text-[var(--los-muted)] hover:text-[var(--los-fg)]',
              )}
            >
              {TIME_FRAME_LABELS[tf]}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      {isLoading && todoFilePaths.length > 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <MonoText className="text-[var(--los-muted)]">Loading todo files…</MonoText>
        </div>
      ) : todoFilePaths.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <MonoText className="text-[var(--los-muted)]">
            No .todos.md files found in this repository.
          </MonoText>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* ── Row 1: Stat Cards ── */}
          <div className="grid grid-cols-5 gap-3">
            <StatCard label="TOTAL TASKS" value={summaryStats.total} />
            <StatCard
              label="BACKLOG"
              value={summaryStats.byStatus.backlog}
              color={STATUS_COLORS.backlog}
            />
            <StatCard
              label="IN PROGRESS"
              value={summaryStats.byStatus['in-progress']}
              color={STATUS_COLORS['in-progress']}
            />
            <StatCard label="DONE" value={summaryStats.byStatus.done} color={STATUS_COLORS.done} />
            <StatCard
              label="COMPLETION RATE"
              value={summaryStats.completionRate !== null ? `${summaryStats.completionRate}%` : '—'}
              color={STATUS_COLORS.done}
              sub="of closed tasks"
            />
          </div>

          {/* ── Row 2: Donut + Tags ── */}
          <div className="grid grid-cols-2 gap-3">
            <SectionPanel title="STATUS DISTRIBUTION">
              <div className="flex items-center gap-6">
                <DonutChart
                  segments={[
                    {
                      label: STATUS_LABELS.backlog,
                      value: summaryStats.byStatus.backlog,
                      color: STATUS_COLORS.backlog,
                    },
                    {
                      label: STATUS_LABELS['in-progress'],
                      value: summaryStats.byStatus['in-progress'],
                      color: STATUS_COLORS['in-progress'],
                    },
                    {
                      label: STATUS_LABELS.done,
                      value: summaryStats.byStatus.done,
                      color: STATUS_COLORS.done,
                    },
                    {
                      label: STATUS_LABELS.rejected,
                      value: summaryStats.byStatus.rejected,
                      color: STATUS_COLORS.rejected,
                    },
                  ]}
                  size={140}
                  thickness={28}
                  centerValue={String(summaryStats.total)}
                  centerLabel="tasks"
                />
                <div className="flex flex-col gap-2">
                  {(['backlog', 'in-progress', 'done', 'rejected'] as TodoStatus[]).map((s) => (
                    <div key={s} className="flex items-center gap-2">
                      <div
                        className="w-2 h-2 rounded-sm shrink-0"
                        style={{ background: STATUS_COLORS[s] }}
                      />
                      <MonoText className="text-xs">{STATUS_LABELS[s]}</MonoText>
                      <MonoText className="text-xs text-[var(--los-muted)] ml-auto pl-4">
                        {summaryStats.byStatus[s]}
                      </MonoText>
                    </div>
                  ))}
                </div>
              </div>
            </SectionPanel>

            <SectionPanel title="TOP TAGS">
              {tagCounts.length === 0 ? (
                <MonoText className="text-xs text-[var(--los-muted)]">No tags found.</MonoText>
              ) : (
                <div className="space-y-1.5">
                  {(() => {
                    const maxCount = tagCounts[0]?.count ?? 1;
                    return tagCounts.map(({ tag, count }) => (
                      <div key={tag} className="flex items-center gap-2">
                        <MonoText className="text-[10px] text-[var(--los-muted)] w-24 truncate shrink-0">
                          #{tag}
                        </MonoText>
                        <div className="flex-1 h-3 bg-[var(--los-border)] relative overflow-hidden">
                          <div
                            className="h-full bg-[var(--los-accent)] opacity-70 transition-all"
                            style={{ width: `${(count / maxCount) * 100}%` }}
                          />
                        </div>
                        <MonoText className="text-[10px] text-[var(--los-muted)] w-6 text-right shrink-0">
                          {count}
                        </MonoText>
                      </div>
                    ));
                  })()}
                </div>
              )}
            </SectionPanel>
          </div>

          {/* ── Row 3: Timeline (stacked bar) ── */}
          <SectionPanel title="TODOS BY STATE ON TIMELINE" className="h-64">
            {timelineData.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <MonoText className="text-xs text-[var(--los-muted)]">
                  {summaryStats.withTimestamp === 0
                    ? 'No creation dates available. Tasks added in legacy format lack timestamps.'
                    : 'No data for selected time frame.'}
                </MonoText>
              </div>
            ) : (
              <div className="w-full h-full" ref={timelineRef}>
                <StackedBarChart
                  data={timelineData}
                  width={timelineDims.width}
                  height={timelineDims.height}
                  colors={CHART_COLORS}
                />
              </div>
            )}
          </SectionPanel>

          {/* Timeline legend */}
          {timelineData.length > 0 && (
            <div className="flex items-center gap-4 px-1">
              {(['backlog', 'in-progress', 'done', 'rejected'] as TodoStatus[]).map((s) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div
                    className="w-2.5 h-2.5 rounded-sm"
                    style={{ background: STATUS_COLORS[s] }}
                  />
                  <MonoText className="text-[10px] text-[var(--los-muted)]">
                    {STATUS_LABELS[s]}
                  </MonoText>
                </div>
              ))}
              <MonoText className="text-[9px] text-[var(--los-muted)] ml-auto">
                grouped by creation week · current status
              </MonoText>
            </div>
          )}

          {/* ── Row 4: Velocity + Milestone Progress ── */}
          <div className="grid grid-cols-2 gap-3">
            <SectionPanel title="COMPLETION VELOCITY (DONE / WEEK)" className="h-52">
              {velocityData.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <MonoText className="text-xs text-[var(--los-muted)]">
                    No completion data for this time frame.
                  </MonoText>
                </div>
              ) : (
                <div className="w-full h-full" ref={velocityRef}>
                  <VelocityChart />
                </div>
              )}
            </SectionPanel>

            <SectionPanel title="MILESTONE PROGRESS" className="h-52">
              {milestoneProgress.length === 0 ? (
                <div className="flex items-center justify-center h-full">
                  <MonoText className="text-xs text-[var(--los-muted)]">No milestones.</MonoText>
                </div>
              ) : (
                <div className="space-y-3 overflow-y-auto max-h-full">
                  {milestoneProgress.map(({ ms, byStatus, total, donePct }) => (
                    <div key={ms.id} className="space-y-1">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <MonoText className="text-xs truncate">!{ms.id}</MonoText>
                          {ms.dueDate && (
                            <MonoText className="text-[10px] text-[var(--los-muted)] shrink-0">
                              {ms.dueDate}
                            </MonoText>
                          )}
                        </div>
                        <MonoText className="text-[10px] text-[var(--los-muted)] shrink-0 pl-2">
                          {byStatus.done}/{total}
                        </MonoText>
                      </div>
                      {/* Stacked progress bar */}
                      <div className="h-2 flex overflow-hidden bg-[var(--los-border)]">
                        {total > 0 &&
                          (['done', 'in-progress', 'backlog', 'rejected'] as TodoStatus[]).map(
                            (s) => {
                              const pct = (byStatus[s] / total) * 100;
                              if (pct === 0) return null;
                              return (
                                <div
                                  key={s}
                                  style={{
                                    width: `${pct}%`,
                                    background: STATUS_COLORS[s],
                                  }}
                                  title={`${STATUS_LABELS[s]}: ${byStatus[s]}`}
                                />
                              );
                            },
                          )}
                      </div>
                      <MonoText className="text-[9px] text-[var(--los-muted)]">
                        {donePct}% done ·{' '}
                        {byStatus['in-progress'] > 0
                          ? `${byStatus['in-progress']} in progress · `
                          : ''}
                        {byStatus.backlog} backlog
                      </MonoText>
                    </div>
                  ))}
                </div>
              )}
            </SectionPanel>
          </div>
        </div>
      )}
    </div>
  );
};
