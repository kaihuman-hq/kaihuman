/**
 * Logic for the Events Widget (.events.csv)
 */

export interface EventEntry {
  name: string;
  type: 'general' | 'birthday' | string; // extensible
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string; // ISO date YYYY-MM-DD
}

export interface EventsData {
  entries: EventEntry[];
}

export interface UpcomingEvent {
  entry: EventEntry;
  date: Date; // The calculated next occurrence date
  daysUntil: number;
  durationLabel: string; // e.g., "in 5 days", "Tomorrow", "Today"
}

export const parseEvents = (csv: string): EventsData => {
  if (!csv) return { entries: [] };
  const lines = csv.trim().split(/\r?\n/);
  const entries: EventEntry[] = [];

  // Skip header if present (heuristic)
  let startIndex = 0;
  if (lines.length > 0 && lines[0]?.toLowerCase().startsWith('name;')) {
    startIndex = 1;
  }

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parts = line.split(';');
    if (parts.length < 4) continue;

    const [name, type, start, end] = parts;
    if (!name || !type || !start) continue;

    entries.push({
      name: name.trim(),
      type: type.trim().toLowerCase(),
      startDate: start.trim(),
      endDate: (end || start).trim(), // Fallback to start if end missing
    });
  }
  return { entries };
};

export const serializeEvents = (data: EventsData): string => {
  let csv = 'name;type;start iso date;end iso date\n';
  for (const e of data.entries) {
    csv += `${e.name};${e.type};${e.startDate};${e.endDate}\n`;
  }
  return csv;
};

export const getUpcomingEvents = (
  data: EventsData,
  limit = 8,
  at = new Date(),
): UpcomingEvent[] => {
  const now = new Date(at);
  now.setHours(0, 0, 0, 0); // Normalize to start of day
  const year = now.getFullYear();

  const upcoming: UpcomingEvent[] = [];

  for (const entry of data.entries) {
    let nextDate: Date;

    if (entry.type === 'birthday') {
      // Parse original birthday
      // Use local parts to avoid timezone shift
      const parts = entry.startDate.split('-').map(Number);
      if (parts.length < 3) continue; // Invalid date
      const y = parts[0] as number;
      const m = parts[1] as number;
      const d = parts[2] as number;
      const bday = new Date(y, m - 1, d); // Local

      // Construct current year birthday
      nextDate = new Date(year, bday.getMonth(), bday.getDate());
      nextDate.setHours(0, 0, 0, 0);

      // If already passed this year, move to next year
      if (nextDate < now) {
        nextDate.setFullYear(year + 1);
      }
    } else {
      // General event
      const parts = entry.startDate.split('-').map(Number);
      if (parts.length < 3) continue; // Invalid date
      const y = parts[0] as number;
      const m = parts[1] as number;
      const d = parts[2] as number;

      nextDate = new Date(y, m - 1, d); // Local
      nextDate.setHours(0, 0, 0, 0);

      // Filter out past events (End Date < Now)
      // Parse endDate locally too
      let endDate: Date;
      if (entry.endDate) {
        const endParts = entry.endDate.split('-').map(Number);
        if (endParts.length >= 3) {
          const ey = endParts[0] as number;
          const em = endParts[1] as number;
          const ed = endParts[2] as number;
          endDate = new Date(ey, em - 1, ed); // Local
        } else {
          endDate = new Date(nextDate);
        }
      } else {
        endDate = new Date(nextDate);
      }
      endDate.setHours(0, 0, 0, 0);

      if (endDate < now) continue;
    }

    const diffTime = nextDate.getTime() - now.getTime();
    // Rounded, not ceiled: a day that gains an hour when clocks go back is still one day.
    const daysUntil = Math.round(diffTime / (1000 * 60 * 60 * 24));

    let label = '';
    if (daysUntil === 0) label = 'TODAY';
    else if (daysUntil === 1) label = 'TOMORROW';
    else label = `IN ${daysUntil} DAYS`;

    upcoming.push({
      entry,
      date: nextDate,
      daysUntil,
      durationLabel: label,
    });
  }

  // Sort by daysUntil ascending
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  return upcoming.slice(0, limit);
};
