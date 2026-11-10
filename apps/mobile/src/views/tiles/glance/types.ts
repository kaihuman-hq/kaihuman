import type { WidgetFilter } from '@kaihuman/core';
import type { TileResult } from '../../../components/widgets/tile-controllers.js';
import type { IconName } from '../../../ui/index.js';

/**
 * Plain data for one square dashboard tile (docs/redesign README, "Tile anatomy"): header,
 * one hero number, one label and at most one tiny visual. Pure so it is unit-testable and
 * shared by the dashboard grid and the ＋ menu's Track group.
 */

/** Colour roles a glance may ask for; the view maps them to theme colours. */
export type GlanceTone =
  | 'accent'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'muted'
  | 'label'
  | 'cat1'
  | 'cat2'
  | 'cat3'
  | 'cat4';

/** Icon-chip tint family per tile (the soft square behind the icon). */
export type GlanceTint = 'olive' | 'orange' | 'blue' | 'red' | 'green' | 'purple' | 'yellow';

export type GlanceViz =
  /** 7 cells, oldest first; the last one is today. */
  | { kind: 'days'; days: { label: string; on: boolean; today: boolean }[] }
  /** Mini bars; `accent` marks the highlighted bar (today, current column). */
  | { kind: 'bars'; values: number[]; labels?: string[]; accent?: number }
  /** Line with optional area fill; `tone` colours line and end dot. */
  | { kind: 'spark'; values: number[]; tone: GlanceTone; fill?: boolean }
  /** Stacked share bar with an optional legend. */
  | {
      kind: 'segments';
      parts: { value: number; tone: GlanceTone }[];
      legend?: { label: string; tone: GlanceTone }[];
    }
  /** `filled` of `total` rounded pills (cups today against the target). */
  | { kind: 'pills'; total: number; filled: number }
  /** Letter chips (bookmark favicons), the last may be `+3`. */
  | { kind: 'chips'; labels: string[] }
  /** A copy chip for the most used template. */
  | { kind: 'copy'; label: string; text: string; mono?: boolean }
  /** Two-column rows (world clocks). */
  | { kind: 'rows'; rows: { left: string; right: string }[] }
  /** One highlighted line plus a caption (next event, last log entry, top unread item). */
  | { kind: 'text'; title: string; caption?: string; time?: string };

/** One-tap or one-field entry (README decision 4). */
export type QuickAction =
  | {
      kind: 'tap';
      icon: 'add' | 'check' | 'stop' | 'play';
      /** Accessibility label and the ＋ menu's Track label, e.g. "Coffee +1". */
      label: string;
      /** Filled look (habit already checked today). */
      done?: boolean;
      run: (content: string, now: Date) => string | TileResult;
    }
  | {
      kind: 'field';
      icon: 'add';
      label: string;
      placeholder: string;
      keyboard?: 'default' | 'decimal-pad' | 'url';
      submit: (content: string, value: string, now: Date) => TileResult;
    }
  /** Entry needs its own screen (todo add sheet, event with a date). */
  | { kind: 'open'; icon: 'add'; label: string; href: string };

export interface GlanceCount {
  value: number;
  label: string;
  tone: GlanceTone;
}

export interface Glance {
  /** Header name: the file's humanised base name ("Meditate", "Coffee"). */
  title: string;
  icon: IconName;
  tint: GlanceTint;
  /** Small line above the hero, e.g. "Deep work" with a live dot when `live`. */
  eyebrow?: string;
  live?: boolean;
  /** Mono hero; empty when `counts` replaces it (todos). */
  hero: string;
  /** Small unit after the hero ("days", "kg", "/ 4"). */
  unit?: string;
  heroTone?: GlanceTone;
  /** Side-by-side numbers in place of the hero (todos: open, doing, overdue). */
  counts?: GlanceCount[];
  label: string;
  /** Coloured fragment appended to the label ("▲ 2.4%", "2 overdue"). */
  delta?: { text: string; tone: GlanceTone };
  viz?: GlanceViz;
  action?: QuickAction;
}

export interface GlanceInput {
  path: string;
  content: string;
  now: Date;
  /** Active Focus filter: todo tiles show only matching rows. */
  filter?: WidgetFilter;
}
