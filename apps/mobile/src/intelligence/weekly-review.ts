import {
  calculateDurationMinutes,
  calculateStats,
  localDate,
  parseHabitData,
  parseTimeTracking,
  parseTodos,
} from '@kaihuman/formats';
import { BUDGET_CATEGORIES } from '../components/widgets/budget-tile.js';
import { parseBudgetCsv } from '../components/widgets/tile-controllers.js';
import { bestTarget, type LanguageModel, type ModelTarget } from './model.js';
import { type CaptureFiles, habitName } from './save-capture.js';

export interface WeeklyReviewData {
  /** Local dates, inclusive: the seven days ending today. */
  start: string;
  end: string;
  done: { text: string; tags: string[] }[];
  habits: { name: string; streak: number; daysThisWeek: number }[];
  timeMinutes: number;
  spend: { total: number; byCategory: { category: string; amount: number }[] };
  openLoops: { text: string; reason: 'in progress' | 'overdue' }[];
}

export interface SourceFile {
  path: string;
  content: string;
}

const MAX_LIST = 15;
const OUT = new Set(BUDGET_CATEGORIES.filter((c) => c.type === 'out').map((c) => c.id));
const label = (id: string) => BUDGET_CATEGORIES.find((c) => c.id === id)?.label ?? id;

/** Pure: everything the review says comes from here, so the template and the model agree on facts. */
export function buildWeeklyReview(files: readonly SourceFile[], now: Date): WeeklyReviewData {
  const end = localDate(now);
  const start = localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6));
  const inWeek = (d: string | undefined) => !!d && d >= start && d <= end;
  const done: WeeklyReviewData['done'] = [];
  const openLoops: WeeklyReviewData['openLoops'] = [];
  const habits: WeeklyReviewData['habits'] = [];
  const byCategory = new Map<string, number>();
  let timeMinutes = 0;

  for (const { path, content } of files) {
    if (path.endsWith('.todos.md')) {
      for (const item of parseTodos(content).items) {
        const doneDay = item.updatedAt ? localDate(new Date(item.updatedAt)) : undefined;
        if ((item.status === 'done' && inWeek(doneDay)) || item.doneLog?.some(inWeek)) {
          done.push({ text: item.text, tags: item.tags });
        } else if (item.status === 'in-progress') {
          openLoops.push({ text: item.text, reason: 'in progress' });
        } else if (item.status === 'backlog' && item.dueDate && item.dueDate < end) {
          openLoops.push({ text: item.text, reason: 'overdue' });
        }
      }
    } else if (path.endsWith('.habit.csv')) {
      const data = parseHabitData(content);
      habits.push({
        name: habitName(path),
        streak: calculateStats(data, now).currentStreak,
        daysThisWeek: data.entries.filter((e) => e.reached && inWeek(e.date)).length,
      });
    } else if (path.endsWith('.timetracking.csv')) {
      for (const day of parseTimeTracking(content).entries) {
        if (inWeek(day.date)) timeMinutes += calculateDurationMinutes(day);
      }
    } else if (path.endsWith('.budget.csv')) {
      for (const t of parseBudgetCsv(content)) {
        if (inWeek(t.date) && OUT.has(t.category)) {
          byCategory.set(t.category, (byCategory.get(t.category) ?? 0) + Math.abs(t.value));
        }
      }
    }
  }
  const round = (n: number) => Math.round(n * 100) / 100;
  const cats = [...byCategory].map(([category, amount]) => ({ category, amount: round(amount) }));
  cats.sort((a, b) => b.amount - a.amount);
  return {
    start,
    end,
    done,
    habits,
    timeMinutes: Math.round(timeMinutes),
    spend: { total: round(cats.reduce((s, c) => s + c.amount, 0)), byCategory: cats },
    openLoops,
  };
}

const hours = (min: number) => `${Math.floor(min / 60)}h ${String(min % 60).padStart(2, '0')}m`;
const more = (n: number) => (n > MAX_LIST ? [`- …and ${n - MAX_LIST} more`] : []);

export const reviewTitle = (d: WeeklyReviewData) => `# Weekly review ${d.start} – ${d.end}`;

/** The no-model summary: the same facts as a fixed template. */
export function templateReview(d: WeeklyReviewData): string {
  const lines = [reviewTitle(d), '', `## Done (${d.done.length})`];
  lines.push(
    ...(d.done.length
      ? d.done.slice(0, MAX_LIST).map((t) => `- ${t.text}`)
      : ['- Nothing marked done.']),
    ...more(d.done.length),
  );
  lines.push('', '## Habits');
  lines.push(
    ...(d.habits.length
      ? d.habits.map((h) => `- ${h.name}: ${h.daysThisWeek}/7 days, streak ${h.streak}`)
      : ['- No habits tracked.']),
  );
  lines.push('', '## Time', `- ${hours(d.timeMinutes)} tracked`);
  lines.push(
    '',
    '## Spend',
    `- Total ${d.spend.total}`,
    ...d.spend.byCategory.map((c) => `- ${label(c.category)}: ${c.amount}`),
  );
  lines.push('', `## Open loops (${d.openLoops.length})`);
  lines.push(
    ...(d.openLoops.length
      ? d.openLoops.slice(0, MAX_LIST).map((o) => `- ${o.text} (${o.reason})`)
      : ['- None.']),
    ...more(d.openLoops.length),
  );
  lines.push('', '## Notes', '', '');
  return lines.join('\n');
}

export const REVIEW_INSTRUCTIONS =
  'You write a short weekly review in Markdown for the user, in the second person. Use only the facts given. Sections: Highlights, Habits, Time and money, Open loops, One suggestion for next week. No title. Under 250 words.';

/** Compact facts for the prompt; lists are capped so a busy week fits the on-device context. */
export const reviewPrompt = (d: WeeklyReviewData): string =>
  JSON.stringify({
    week: `${d.start} to ${d.end}`,
    done: d.done.slice(0, MAX_LIST).map((t) => t.text),
    doneCount: d.done.length,
    habits: d.habits,
    timeTracked: hours(d.timeMinutes),
    spend: {
      total: d.spend.total,
      byCategory: d.spend.byCategory.map((c) => ({ [label(c.category)]: c.amount })),
    },
    openLoops: d.openLoops.slice(0, MAX_LIST),
  });

export interface ReviewText {
  markdown: string;
  /** Which model wrote it, or `template` when none could. */
  source: ModelTarget | 'template';
}

export async function generateReview(
  d: WeeklyReviewData,
  model: LanguageModel | null,
): Promise<ReviewText> {
  const target = bestTarget(model);
  const fallback: ReviewText = { markdown: templateReview(d), source: 'template' };
  if (!model || !target) return fallback;
  try {
    const body = (await model.text(reviewPrompt(d), REVIEW_INSTRUCTIONS, target)).trim();
    if (!body) return fallback;
    // The facts stay in the file below the prose, so the review stays checkable and editable.
    const facts = templateReview(d).split('\n').slice(1).join('\n');
    return { markdown: `${reviewTitle(d)}\n\n${body}\n\n---\n${facts}`, source: target };
  } catch {
    return fallback;
  }
}

export const REVIEW_DIR = 'logs';

/** Never overwrites: an earlier review the same day may already hold the user's edits. */
export function reviewPath(d: WeeklyReviewData, exists: (path: string) => boolean): string {
  const base = `${REVIEW_DIR}/weekly-review-${d.end}`;
  let path = `${base}.md`;
  for (let n = 2; exists(path); n++) path = `${base}-${n}.md`;
  return path;
}

export async function writeWeeklyReview(deps: {
  files: CaptureFiles;
  model: LanguageModel | null;
  now: Date;
}): Promise<{ path: string; source: ReviewText['source'] }> {
  const { files, now } = deps;
  const paths = [
    ...files.todoPaths(),
    ...files.list('.habit.csv'),
    ...files.list('.timetracking.csv'),
    ...files.list('.budget.csv'),
  ];
  const sources: SourceFile[] = [];
  for (const path of paths) {
    const content = await files.read(path);
    if (content !== null) sources.push({ path, content });
  }
  const data = buildWeeklyReview(sources, now);
  const { markdown, source } = await generateReview(data, deps.model);
  const path = reviewPath(data, (p) => files.exists(p));
  await files.write(path, markdown);
  return { path, source };
}
