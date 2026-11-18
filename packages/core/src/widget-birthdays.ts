import { parseEvents } from '@kaihuman/formats';

/** A birthday the Siri intent can announce; `date` is the next occurrence, `YYYY-MM-DD`. */
export interface WidgetBirthday {
  name: string;
  date: string;
  /** Age being turned, when the birth year is known. */
  turns?: number;
}

/** "Geburtstag" also matches "Geburtstagsfeier"; general events with it in the title count too. */
const TITLE_KEYWORD = /geburtstag|birthday|bday/i;

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;
const pad = (n: number): string => String(n).padStart(2, '0');
const isLeap = (y: number): boolean => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysIn = (y: number, m: number): number =>
  m === 2 ? (isLeap(y) ? 29 : 28) : [4, 6, 9, 11].includes(m) ? 30 : 31;

/**
 * The next `limit` distinct birthdays on or after `today` (`YYYY-MM-DD`, the caller's local day),
 * soonest first. Birthdays recur yearly: a passed one rolls to next year, and a 29 February one
 * falls on 28 February in non-leap years. Only the `.events.csv` rows typed `birthday`, or
 * general events whose title says birthday/Geburtstag, count; a general event must be a
 * single-year date, so it is announced only in its own year.
 */
export const nextBirthdays = (csv: string, today: string, limit = 5): WidgetBirthday[] => {
  const t = ISO.exec(today);
  if (!t) return [];
  const year = Number(t[1]);
  const out: WidgetBirthday[] = [];

  for (const e of parseEvents(csv).entries) {
    const m = ISO.exec(e.startDate);
    if (!m) continue;
    const [by, bm, bd] = [Number(m[1]), Number(m[2]), Number(m[3])] as const;
    if (bm < 1 || bm > 12 || bd < 1 || bd > daysIn(by, bm)) continue;
    const recurring = e.type === 'birthday';
    if (!recurring && !TITLE_KEYWORD.test(e.name)) continue;

    const on = (y: number): string => {
      const d = bm === 2 && bd === 29 && !isLeap(y) ? 28 : bd;
      return `${y}-${pad(bm)}-${pad(d)}`;
    };
    let y = recurring ? year : by;
    if (recurring && on(y) < today) y++;
    if (on(y) < today) continue; // one-off past event
    out.push({
      name: e.name,
      date: on(y),
      // A year 1900 or earlier is the usual "year unknown" placeholder, not an age.
      ...(recurring && by > 1900 && y > by && { turns: y - by }),
    });
  }
  return out
    .sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name))
    .slice(0, limit);
};
