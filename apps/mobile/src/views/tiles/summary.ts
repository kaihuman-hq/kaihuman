import {
  formatElapsed,
  type TileKind,
  type TileView,
} from '../../components/widgets/tile-controllers.js';

/**
 * compact: half-width glanceable card, medium: full-width summary card, full: the interactive
 * tile inline. Todos stay full because ticking tasks off is the main reason to open the app.
 */
export type TileSize = 'compact' | 'medium' | 'full';

export const TILE_SIZE: Record<TileKind, TileSize> = {
  habit: 'compact',
  timetracking: 'compact',
  timezones: 'compact',
  budget: 'compact',
  stocks: 'compact',
  consumption: 'compact',
  datacollection: 'compact',
  events: 'medium',
  actionlog: 'medium',
  readitlater: 'medium',
  bookmarks: 'medium',
  prompts: 'medium',
  commands: 'medium',
  todos: 'full',
};

export interface TileSummary {
  stat: string;
  statLabel: string;
  /** At most three short lines. */
  items: string[];
}

const MAX_ITEMS = 3;
const money = (n: number) => Math.round(n).toLocaleString('en-US');
const signed = (n: number) => `${n < 0 ? '-' : '+'}${money(Math.abs(n))}`;
const minutes = (m: number) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);
const plural = (n: number, one: string, many = `${one}s`) => (n === 1 ? one : many);
const out = (stat: string, statLabel: string, items: readonly string[] = []): TileSummary => ({
  stat,
  statLabel,
  items: items.slice(0, MAX_ITEMS),
});

/** Plain data for a summary card; `now` is unused today but keeps the signature stable for clocks. */
export function summarizeTile(tile: TileView, _now: Date): TileSummary {
  switch (tile.kind) {
    case 'todos':
      return out(
        String(tile.view.openCount),
        'open',
        tile.view.rows
          .filter((r) => r.status === 'backlog' || r.status === 'in-progress')
          .map((r) => r.text),
      );
    case 'habit':
      return out(
        String(tile.view.currentStreak),
        'day streak',
        [...tile.view.strip]
          .reverse()
          .map((d) => `${d.isToday ? 'Today' : d.date.slice(5)}: ${d.reached ? 'done' : 'missed'}`),
      );
    case 'timetracking':
      return tile.view.state === 'running'
        ? out(formatElapsed(tile.view.elapsedSeconds), `since ${tile.view.since}`, [
            `Today: ${minutes(tile.view.todayMinutes)}`,
          ])
        : out('Idle', 'timer', [`Today: ${minutes(tile.view.todayMinutes)}`]);
    case 'events':
      return out(
        String(tile.view.length),
        'upcoming',
        tile.view.map((e) => e.name),
      );
    case 'actionlog':
      return out(
        String(tile.view.entries.length),
        'recent entries',
        tile.view.entries.map((e) => e.description),
      );
    case 'timezones': {
      const first = tile.view[0];
      return out(
        first?.time ?? '--:--',
        first ? (first.cities[0] ?? first.name) : 'no clocks',
        tile.view.map((c) => `${c.cities[0] ?? c.name} ${c.time}`),
      );
    }
    case 'readitlater':
      return out(
        String(tile.view.unread.length),
        'unread',
        tile.view.unread.map((i) => i.name),
      );
    case 'bookmarks':
      return out(
        String(tile.view.bookmarks.length),
        plural(tile.view.bookmarks.length, 'bookmark'),
        tile.view.bookmarks.map((b) => b.title),
      );
    case 'budget':
      return out(money(tile.view.net), 'net', [
        `Income ${money(tile.view.income)}`,
        `Spent ${money(tile.view.spending)}`,
      ]);
    case 'stocks':
      return tile.view
        ? out(money(tile.view.latestValue), 'total value', [
            `${signed(tile.view.profit)} (${tile.view.profitPct.toFixed(1)}%)`,
          ])
        : out('--', 'no data');
    case 'consumption':
      return out(
        String(tile.view.length),
        plural(tile.view.length, 'meter'),
        tile.view.map((m) => `${m.title}: ${m.latestReading} ${m.unit}`.trim()),
      );
    case 'datacollection':
      return out(
        String(tile.view.rowCount),
        plural(tile.view.rowCount, 'row'),
        tile.view.series.map((s) => `${s.column}: ${s.latest} ${s.unit}`.trim()),
      );
    case 'prompts':
      return out(
        String(tile.view.rows.length),
        plural(tile.view.rows.length, 'prompt'),
        tile.view.rows.map((r) => r.title),
      );
    case 'commands':
      return out(
        String(tile.view.rows.length),
        plural(tile.view.rows.length, 'command'),
        tile.view.rows.map((r) => r.title),
      );
    default: {
      const unhandled: never = tile;
      return unhandled;
    }
  }
}
