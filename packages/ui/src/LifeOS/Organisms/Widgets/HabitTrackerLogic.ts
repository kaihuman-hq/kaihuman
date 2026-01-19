export interface HabitEntry {
  date: string; // ISO yyyy-mm-dd
  reached: boolean;
}

export interface HabitData {
  entries: HabitEntry[];
}

export const parseHabitData = (csv: string): HabitData => {
  const lines = csv.trim().split('\n');
  const entries: HabitEntry[] = [];

  // Skip header if present
  const startIdx = (lines.length > 0 && lines[0]?.includes('iso date')) ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const [date, reached] = line.split(';');
    if (date && reached) {
      entries.push({
        date: date.trim(),
        reached: reached.trim() === 'x'
      });
    }
  }

  return { entries };
};

export const serializeHabitData = (data: HabitData): string => {
  const header = 'iso date;goal reached';
  const lines = data.entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(e => `${e.date};${e.reached ? 'x' : ''}`);

  return [header, ...lines].join('\n');
};

export const checkIn = (content: string, date: string): string => {
  const data = parseHabitData(content);

  // Check if already exists
  const existingIndex = data.entries.findIndex(e => e.date === date);

  if (existingIndex >= 0) {
    const entry = data.entries[existingIndex];
    if (entry && !entry.reached) {
      entry.reached = true;
    }
  } else {
    data.entries.push({ date, reached: true });
  }

  return serializeHabitData(data);
};

export const isCheckedIn = (content: string, date: string): boolean => {
  const data = parseHabitData(content);
  return data.entries.some(e => e.date === date && e.reached);
}

export const calculateStats = (data: HabitData) => {
  const sortedEntries = [...data.entries]
    .filter(e => e.reached)
    .sort((a, b) => b.date.localeCompare(a.date)); // Descending order

  const totalCount = sortedEntries.length;
  let currentStreak = 0;

  if (sortedEntries.length > 0) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString().split('T')[0];

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayIso = yesterday.toISOString().split('T')[0];

    // Check if streak is active (today or yesterday must be checked)
    // If multiple entries per day (shouldn't happen with set logic but good to handle), unique days matter.
    // However, our checkIn logic allows multiple if dates are slightly different strings, but we normalize to iso date.

    const uniqueDates = Array.from(new Set(sortedEntries.map(e => e.date))).sort((a, b) => b.localeCompare(a));

    if (uniqueDates.length > 0) {
      // If the newest entry is NOT today AND NOT yesterday, streak is broken -> 0
      // Wait, if I checked in last week, streak is 0.
      // If I checked in today, streak starts counting from today backwards.
      // If I checked in yesterday, streak starts counting from yesterday backwards.

      const isToday = uniqueDates[0] === todayIso;
      const isYesterday = uniqueDates[0] === yesterdayIso;

      if (isToday || isYesterday) {
        currentStreak = 1;
        let currentDate = new Date(uniqueDates[0]!);

        for (let i = 1; i < uniqueDates.length; i++) {
          const dateStr = uniqueDates[i];
          if (!dateStr) break;

          const prevDate = new Date(dateStr);
          const diffTime = Math.abs(currentDate.getTime() - prevDate.getTime());
          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            currentStreak++;
            currentDate = prevDate;
          } else {
            break;
          }
        }
      }
    }
  }

  return { currentStreak, totalCount };
}
