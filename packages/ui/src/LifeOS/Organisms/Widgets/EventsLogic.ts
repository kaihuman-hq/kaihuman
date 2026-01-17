/**
 * Logic for the Events Widget (.events.csv)
 */

export interface EventEntry {
  name: string;
  type: 'general' | 'birthday' | string; // extensible
  startDate: string; // ISO date YYYY-MM-DD
  endDate: string;   // ISO date YYYY-MM-DD
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
      endDate: (end || start).trim() // Fallback to start if end missing
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

export const getUpcomingEvents = (data: EventsData, limit = 8): UpcomingEvent[] => {
  const now = new Date();
  now.setHours(0, 0, 0, 0); // Normalize to start of day
  const year = now.getFullYear();

  const upcoming: UpcomingEvent[] = [];

  for (const entry of data.entries) {
    let nextDate: Date;
    let targetLabel = '';

    if (entry.type === 'birthday') {
      // Parse original birthday
      const bday = new Date(entry.startDate);
      // Construct current year birthday
      nextDate = new Date(year, bday.getMonth(), bday.getDate());
      nextDate.setHours(0, 0, 0, 0);

      // If already passed this year, move to next year
      if (nextDate < now) {
        nextDate.setFullYear(year + 1);
      }
    } else {
      // General event - uses Start Date for "upcoming" sorting usually? 
      // User said "shows upcoming events that are in the future".
      // Usually means Start Date >= Today OR (Start <= Today <= End for ongoing).
      // Let's stick to Start Date for "upcoming" list sorting primarily.
      nextDate = new Date(entry.startDate);
      nextDate.setHours(0, 0, 0, 0);

      // Filter out past events (End Date < Now)
      // If End Date is missing, assume single day event (End = Start)
      const endDate = entry.endDate ? new Date(entry.endDate) : new Date(entry.startDate);
      endDate.setHours(0, 0, 0, 0);

      if (endDate < now) continue;
    }

    const diffTime = nextDate.getTime() - now.getTime();
    const daysUntil = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    let label = '';
    if (daysUntil === 0) label = 'TODAY';
    else if (daysUntil === 1) label = 'TOMORROW';
    else label = `IN ${daysUntil} DAYS`;

    upcoming.push({
      entry,
      date: nextDate,
      daysUntil,
      durationLabel: label
    });
  }

  // Sort by daysUntil ascending
  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);

  return upcoming.slice(0, limit);
};
