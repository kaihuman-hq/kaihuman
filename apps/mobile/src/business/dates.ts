/** Calendar helpers on `YYYY-MM-DD` strings, in UTC so DST never shifts a day. */
const DAY = 86_400_000;

const toUtc = (date: string): number => {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
};

export const addDays = (date: string, days: number): string =>
  new Date(toUtc(date) + days * DAY).toISOString().slice(0, 10);

/** Monday of the week `date` is in. */
export const weekStart = (date: string): string =>
  addDays(date, -((new Date(toUtc(date)).getUTCDay() + 6) % 7));

/** Round-trips through Date so 2026-02-31 is refused. */
export const isRealDate = (text: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(text);
};
