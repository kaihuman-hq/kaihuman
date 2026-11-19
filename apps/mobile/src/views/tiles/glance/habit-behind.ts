import { localDate, parseHabitData } from '@kaihuman/formats';

export interface HabitBehind {
  /** Consecutive unchecked days ending yesterday (today is still open), since the last check-in. */
  behind: number;
  /** Unchecked days among the last two (day before yesterday, yesterday), oldest first. */
  catchUp: string[];
}

const NONE: HabitBehind = { behind: 0, catchUp: [] };

/**
 * Habits are daily (the file has no schedule). Days before the first check-in never count as
 * missed, so a new habit does not start red. Catch-up is capped at two days on purpose: older
 * back-filling is better done in the heatmap on the detail screen.
 */
export function habitBehind(content: string, now: Date): HabitBehind {
  const reached = new Set(
    parseHabitData(content)
      .entries.filter((e) => e.reached)
      .map((e) => e.date),
  );
  const first = [...reached].sort()[0];
  if (!first) return NONE;
  const day = (back: number) =>
    localDate(new Date(now.getFullYear(), now.getMonth(), now.getDate() - back));
  const missed = (date: string) => date > first && !reached.has(date);
  let behind = 0;
  while (missed(day(behind + 1))) behind++;
  const catchUp = [day(2), day(1)].filter(missed);
  return behind === 0 && catchUp.length === 0 ? NONE : { behind, catchUp };
}
