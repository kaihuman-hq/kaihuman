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
  const startIdx = lines.length > 0 && lines[0]?.includes('iso date') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const [date, reached] = line.split(';');
    if (date && reached) {
      entries.push({
        date: date.trim(),
        reached: reached.trim() === 'x',
      });
    }
  }

  return { entries };
};

export const serializeHabitData = (data: HabitData): string => {
  const header = 'iso date;goal reached';
  const lines = data.entries
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => `${e.date};${e.reached ? 'x' : ''}`);

  return [header, ...lines].join('\n');
};

export const checkIn = (content: string, date: string): string => {
  const data = parseHabitData(content);

  // Check if already exists
  const existingIndex = data.entries.findIndex((e) => e.date === date);

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
  return data.entries.some((e) => e.date === date && e.reached);
};

export const calculateStats = (data: HabitData) => {
  const sortedEntries = [...data.entries]
    .filter((e) => e.reached)
    .sort((a, b) => b.date.localeCompare(a.date)); // Descending order

  const totalCount = sortedEntries.length;
  let currentStreak = 0;
  let weekStreak = 0;

  if (sortedEntries.length > 0) {
    const toLocDate = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayIso = toLocDate(today);

    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const yesterdayIso = toLocDate(yesterday);

    // DAILY STREAK
    const uniqueDates = Array.from(new Set(sortedEntries.map((e) => e.date))).sort((a, b) =>
      b.localeCompare(a),
    );

    if (uniqueDates.length > 0) {
      const isToday = uniqueDates[0] === todayIso;
      const isYesterday = uniqueDates[0] === yesterdayIso;

      if (isToday || isYesterday) {
        currentStreak = 1;
        let currentDate = new Date(uniqueDates[0] as string);

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

    // WEEKLY STREAK
    // 1. Identify all unique weeks (represented by Sunday date string)
    const getSunday = (dateStr: string) => {
      const [year, month, day] = dateStr.split('-');
      const d = new Date(Number(year), Number(month) - 1, Number(day));
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - d.getDay()); // Go to Sunday
      return toLocDate(d);
    };

    const uniqueWeeks = new Set(sortedEntries.map((e) => getSunday(e.date)));

    // 2. check streak from this week backwards
    const thisWeekSunday = new Date(today);
    thisWeekSunday.setDate(today.getDate() - today.getDay());
    thisWeekSunday.setHours(0, 0, 0, 0);

    const checkDate = new Date(thisWeekSunday);

    if (uniqueWeeks.has(toLocDate(checkDate))) {
      weekStreak = 1;
      checkDate.setDate(checkDate.getDate() - 7);
      while (uniqueWeeks.has(toLocDate(checkDate))) {
        weekStreak++;
        checkDate.setDate(checkDate.getDate() - 7);
      }
    } else {
      // Check last week
      checkDate.setDate(checkDate.getDate() - 7);
      if (uniqueWeeks.has(toLocDate(checkDate))) {
        weekStreak = 1;
        checkDate.setDate(checkDate.getDate() - 7);
        while (uniqueWeeks.has(toLocDate(checkDate))) {
          weekStreak++;
          checkDate.setDate(checkDate.getDate() - 7);
        }
      }
    }
  }

  return { currentStreak, totalCount, weekStreak };
};
