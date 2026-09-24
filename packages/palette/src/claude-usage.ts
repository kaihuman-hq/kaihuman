/**
 * The `>u` mode's rows: Claude usage as Anthropic's OAuth usage endpoint reports it — the numbers
 * the claude.ai usage page and Claude Code's `/usage` show. A port of the formatting in omarchy's
 * `omarchy-claude-usage`; the desktop backend only fetches.
 */
import type { ModeItem, Tone } from './command-palette.js';

/** Where ⏎ on a usage row goes. */
export const CLAUDE_USAGE_URL = 'https://claude.ai/settings/usage';

/** The endpoint's answer, as far as the palette reads it. */
export interface ClaudeUsage {
  rate_limit_tier?: string;
  spend?: {
    enabled?: boolean;
    percent?: number;
    severity?: string;
    used?: Money;
    limit?: Money;
  };
  extra_usage?: {
    is_enabled?: boolean;
    utilization?: number;
    used_credits?: number;
    monthly_limit?: number;
    currency?: string;
    decimal_places?: number;
  };
  [window: string]: unknown;
}

interface Money {
  amount_minor?: number;
  exponent?: number;
  currency?: string;
}

const WINDOW_LABELS: Record<string, string> = {
  five_hour: 'Session (5h)',
  seven_day: 'Weekly (all models)',
  seven_day_opus: 'Weekly (Opus)',
  seven_day_sonnet: 'Weekly (Sonnet)',
  seven_day_oauth_apps: 'Weekly (OAuth apps)',
  seven_day_cowork: 'Weekly (Cowork)',
};

const HOUR = 3600;
const DAY = 24 * HOUR;
/** Each window's length, so how much of it has passed — its pace — can be set against usage. */
const WINDOW_SECONDS: Record<string, number> = {
  five_hour: 5 * HOUR,
  seven_day: 7 * DAY,
  seven_day_opus: 7 * DAY,
  seven_day_sonnet: 7 * DAY,
  seven_day_oauth_apps: 7 * DAY,
  seven_day_cowork: 7 * DAY,
};

const NOT_WINDOWS = new Set(['limits', 'spend', 'extra_usage']);

const clamp = (value: number) => Math.max(0, Math.min(100, value));

export const usageBar = (percent: number, width = 12) => {
  const filled = Math.round((clamp(percent) / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

const humanize = (key: string) => {
  const words = key.replace(/_/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** How much of the window's time has passed, in percent; unknown for windows of no fixed length. */
export function usagePace(key: string, resetsAt: string | undefined, now: Date): number | null {
  const length = WINDOW_SECONDS[key];
  const resets = resetsAt ? Date.parse(resetsAt) : Number.NaN;
  if (!length || Number.isNaN(resets)) return null;
  const remaining = (resets - now.getTime()) / 1000;
  return clamp(((length - remaining) / length) * 100);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pad = (value: number) => String(value).padStart(2, '0');

/** `resets in 2h 5m (Tue 23 Sep 14:00)`, in local time. */
export function usageReset(resetsAt: string | undefined, now: Date): string {
  const resets = resetsAt ? new Date(resetsAt) : null;
  if (!resets || Number.isNaN(resets.getTime())) return '';
  const seconds = Math.floor((resets.getTime() - now.getTime()) / 1000);
  let relative: string;
  if (seconds <= 0) relative = 'now';
  else if (seconds < HOUR) relative = `${Math.floor(seconds / 60)}m`;
  else if (seconds < DAY)
    relative = `${Math.floor(seconds / HOUR)}h ${Math.floor((seconds % HOUR) / 60)}m`;
  else relative = `${Math.floor(seconds / DAY)}d ${Math.floor((seconds % DAY) / HOUR)}h`;
  const at =
    `${DAYS[resets.getDay()]} ${pad(resets.getDate())} ${MONTHS[resets.getMonth()]} ` +
    `${pad(resets.getHours())}:${pad(resets.getMinutes())}`;
  return `resets in ${relative} (${at})`;
}

const SYMBOLS: Record<string, string> = { USD: '$', EUR: '€', GBP: '£' };

export const formatMoney = (minor: number, exponent: number, currency: string) =>
  `${SYMBOLS[currency] ?? `${currency} `}${(minor / 10 ** exponent).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const money = (value: Money | undefined) =>
  formatMoney(value?.amount_minor ?? 0, value?.exponent ?? 2, value?.currency ?? 'USD');

/** A row title: the label padded so the percentages line up in the palette's monospace font. */
const meter = (label: string, percent: number, pace: number | null) =>
  `${label.padEnd(20)} ${percent.toFixed(0).padStart(3)}%  ${usageBar(percent)}` +
  (pace === null ? '' : `  pace ${pace.toFixed(0)}%`);

/** Every populated rate-limit window, the fullest first. */
function usageWindows(usage: ClaudeUsage) {
  return Object.entries(usage)
    .filter(([key]) => !NOT_WINDOWS.has(key))
    .flatMap(([key, value]) => {
      const window = value as { utilization?: number | null; resets_at?: string } | null;
      if (typeof window !== 'object' || window?.utilization == null) return [];
      return [
        {
          key,
          label: WINDOW_LABELS[key] ?? humanize(key),
          percent: Number(window.utilization),
          resetsAt: window.resets_at,
        },
      ];
    })
    .sort((a, b) => b.percent - a.percent);
}

/** One account's rows, under a heading naming it (and its plan tier). */
export function usageRows(
  account: string,
  result: { usage?: ClaudeUsage; error?: string },
  now: Date,
): ModeItem[] {
  const { usage } = result;
  const group = usage?.rate_limit_tier ? `${account} · ${usage.rate_limit_tier}` : account;
  const row = (id: string, title: string, subtitle = '') => ({
    id: `usage:${account}:${id}`,
    title,
    subtitle,
    group,
    url: CLAUDE_USAGE_URL,
  });
  if (!usage) {
    return [row('error', 'Could not load usage', result.error ?? 'No answer')];
  }

  const rows: ModeItem[] = usageWindows(usage).map((window) =>
    row(
      window.key,
      meter(window.label, window.percent, usagePace(window.key, window.resetsAt, now)),
      usageReset(window.resetsAt, now),
    ),
  );

  const { spend, extra_usage: extra } = usage;
  if (spend?.enabled) {
    const severity = spend.severity && spend.severity !== 'normal' ? `  [${spend.severity}]` : '';
    rows.push(
      row(
        'spend',
        meter('Monthly spend', spend.percent ?? 0, null),
        `${money(spend.used)} of ${money(spend.limit)}${severity}`,
      ),
    );
  } else if (extra?.is_enabled) {
    const currency = extra.currency ?? 'USD';
    const places = extra.decimal_places ?? 2;
    rows.push(
      row(
        'extra',
        meter('Extra credits', extra.utilization ?? 0, null),
        `${formatMoney(extra.used_credits ?? 0, places, currency)} of ${formatMoney(extra.monthly_limit ?? 0, places, currency)}`,
      ),
    );
  }

  return rows.length ? rows : [row('none', 'No usage limits reported for this account')];
}

/** A cached answer younger than this is shown as it is; an older one is synced behind it. */
export const USAGE_SYNC_AFTER_MS = 5 * 60 * 1000;

const MINUTE_MS = 60 * 1000;

export const usageNeedsSync = (fetchedAt: number, now: number) =>
  now - fetchedAt >= USAGE_SYNC_AFTER_MS;

/** `just now`, `12 min ago`, `2h 5m ago`, `3 days ago`. */
export function usageAge(fetchedAt: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - fetchedAt) / MINUTE_MS));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** Green under 15 minutes, yellow up to an hour, red beyond. */
export function usageAgeTone(fetchedAt: number, now: number): Tone {
  const minutes = (now - fetchedAt) / MINUTE_MS;
  if (minutes < 15) return 'good';
  if (minutes <= 60) return 'warn';
  return 'bad';
}

/**
 * The first row of `>u`: how old the usage below it is, and whether it is being synced. `failed`
 * is why the last sync did not replace it.
 */
export function usageStatusRow(
  fetchedAt: number,
  now: number,
  state: 'cached' | 'syncing' | 'synced' | { failed: string },
): ModeItem {
  const age = usageAge(fetchedAt, now);
  let subtitle: string;
  if (state === 'synced') subtitle = 'Synced — cached for the next 5 min';
  else if (state === 'syncing') subtitle = 'Syncing in the background…';
  else if (state === 'cached') subtitle = 'Fresh — synced again once it is 5 min old';
  else subtitle = `Sync failed: ${state.failed}`;
  return {
    id: 'usage:status',
    title: state === 'synced' ? `Usage synced ${age}` : `Cached usage from ${age}`,
    subtitle,
    group: 'Usage',
    tone: usageAgeTone(fetchedAt, now),
  };
}
