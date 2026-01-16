export interface Interval {
  start: string; // HH:MM
  end?: string; // HH:MM
}

export interface DayEntry {
  date: string; // YYYY-MM-DD
  intervals: Interval[];
}

export interface TimeTrackingData {
  entries: DayEntry[];
}

/**
 * Parses the CSV content into structured data.
 * Format:
 * iso date;time
 * 2019-12-02;07:54,12:59,13:29,18:34
 */
export const parseTimeTracking = (csv: string): TimeTrackingData => {
  if (!csv) return { entries: [] };
  const lines = csv.trim().split('\n');
  const entries: DayEntry[] = [];

  // Skip header if present
  const startIndex = lines[0]?.toLowerCase().startsWith('iso') ? 1 : 0;

  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i]?.trim();
    if (!line) continue;

    const parts = line.split(';');
    const date = parts[0];
    const timeString = parts[1];

    if (!date || !timeString) continue;

    const times = timeString.split(',').filter(t => t.trim() !== '');
    const intervals: Interval[] = [];

    for (let j = 0; j < times.length; j += 2) {
      const start = times[j];
      const end = times[j + 1];
      if (start) {
        intervals.push({
          start: start,
          end: end // undefined if currently running
        });
      }
    }

    entries.push({ date, intervals });
  }

  return { entries };
};

/**
 * Serializes the structured data back to CSV string.
 */
export const serializeTimeTracking = (data: TimeTrackingData): string => {
  let csv = 'iso date;time\n';

  // Sort by date descending (newest top)
  const sortedEntries = [...data.entries].sort((a, b) => b.date.localeCompare(a.date));

  for (const entry of sortedEntries) {
    const times = entry.intervals.flatMap(i => {
      const parts = [i.start];
      if (i.end) parts.push(i.end);
      return parts;
    });
    csv += `${entry.date};${times.join(',')}\n`;
  }

  return csv;
};

/**
 * Calculates duration in minutes for a specific day.
 */
export const calculateDurationMinutes = (entry: DayEntry): number => {
  let totalMinutes = 0;
  const now = new Date();
  const currentHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  for (const interval of entry.intervals) {
    const startParts = interval.start.split(':').map(Number);
    if (startParts.length !== 2) continue;

    const startMin = (startParts[0] || 0) * 60 + (startParts[1] || 0);

    let endMin;
    if (interval.end) {
      const endParts = interval.end.split(':').map(Number);
      if (endParts.length === 2) {
        endMin = (endParts[0] || 0) * 60 + (endParts[1] || 0);
      }
    } else {
      const today = new Date().toISOString().split('T')[0];
      if (entry.date === today) {
        const nowParts = currentHm.split(':').map(Number);
        endMin = (nowParts[0] || 0) * 60 + (nowParts[1] || 0);
      } else {
        continue;
      }
    }

    if (endMin !== undefined && endMin >= startMin) {
      totalMinutes += (endMin - startMin);
    }
  }
  return totalMinutes;
};

export const formatDuration = (minutes: number): string => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
};

/**
 * Toggles Start/Stop for Today.
 */
export const toggleStartStop = (data: TimeTrackingData): TimeTrackingData => {
  const today = new Date().toISOString().split('T')[0]!;
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  const newData = { ...data, entries: [...data.entries] };
  const dayEntryIndex = newData.entries.findIndex(e => e.date === today);

  if (dayEntryIndex === -1) {
    // Start new day
    newData.entries.unshift({
      date: today,
      intervals: [{ start: hm }]
    });
  } else {
    // Modify existing day
    const existingEntry = newData.entries[dayEntryIndex];
    if (!existingEntry) return newData; // Should not happen

    const entry = { ...existingEntry };
    const lastInterval = entry.intervals[entry.intervals.length - 1];

    if (lastInterval && !lastInterval.end) {
      // Stop
      const newInterval = { ...lastInterval, end: hm };
      entry.intervals = [...entry.intervals.slice(0, -1), newInterval];
    } else {
      // Start
      entry.intervals = [...entry.intervals, { start: hm }];
    }

    // Replace entry
    newData.entries[dayEntryIndex] = entry;
  }

  return newData;
};

export const addPause = (data: TimeTrackingData, pauseMinutes: number): TimeTrackingData => {
  const today = new Date().toISOString().split('T')[0];
  const newData = { ...data, entries: [...data.entries] };
  const dayEntryIndex = newData.entries.findIndex(e => e.date === today);

  if (dayEntryIndex === -1) return data;

  const existingEntry = newData.entries[dayEntryIndex];
  if (!existingEntry) return data;

  const entry = { ...existingEntry };
  const idx = entry.intervals.length - 1;

  for (let i = idx; i >= 0; i--) {
    const interval = entry.intervals[i];
    if (!interval || !interval.end) continue;

    const startParts = interval.start.split(':').map(Number);
    const endParts = interval.end.split(':').map(Number);
    const startMin = (startParts[0] || 0) * 60 + (startParts[1] || 0);
    const endMin = (endParts[0] || 0) * 60 + (endParts[1] || 0);
    const dur = endMin - startMin;

    if (dur > pauseMinutes) {
      const workDur = dur - pauseMinutes;
      const halfWork = Math.floor(workDur / 2);

      const split1EndMin = startMin + halfWork;
      const split2StartMin = split1EndMin + pauseMinutes;

      const s1End = `${String(Math.floor(split1EndMin / 60)).padStart(2, '0')}:${String(split1EndMin % 60).padStart(2, '0')}`;
      const s2Start = `${String(Math.floor(split2StartMin / 60)).padStart(2, '0')}:${String(split2StartMin % 60).padStart(2, '0')}`;

      const newInt1: Interval = { start: interval.start, end: s1End };
      const newInt2: Interval = { start: s2Start, end: interval.end };

      entry.intervals.splice(i, 1, newInt1, newInt2);
      newData.entries[dayEntryIndex] = entry;
      return newData;
    }
  }

  return data;
};

export const isRunning = (data: TimeTrackingData): boolean => {
  const today = new Date().toISOString().split('T')[0];
  const entry = data.entries.find(e => e.date === today);
  if (!entry) return false;
  const last = entry.intervals[entry.intervals.length - 1];
  return !!(last && !last.end);
};

export interface ChartData {
  daily: { date: string; workHours: number; breakHours: number }[];
  weekly: { week: string; hours: number }[];
  monthly: { month: string; hours: number }[];
}

export const getChartData = (data: TimeTrackingData): ChartData => {
  const daily: ChartData['daily'] = [];
  const weeklyMap = new Map<string, number>();
  const monthlyMap = new Map<string, number>();

  // 12 weeks lookback ~ 84 days
  const lookback = new Date();
  lookback.setDate(lookback.getDate() - 84);
  const lookbackDateStr = lookback.toISOString().split('T')[0]!;

  // Sort ascending for chart
  const sorted = [...data.entries].sort((a, b) => a.date.localeCompare(b.date));

  for (const entry of sorted) {
    if (entry.date < lookbackDateStr) continue;

    // Work Hours
    const mins = calculateDurationMinutes(entry);
    const workHours = parseFloat((mins / 60).toFixed(2));

    // Break Hours
    let breakMins = 0;
    for (let i = 0; i < entry.intervals.length - 1; i++) {
      const current = entry.intervals[i];
      const next = entry.intervals[i + 1];
      if (current && current.end && next) {
        const endParts = current.end.split(':').map(Number);
        const nextStartParts = next.start.split(':').map(Number);

        const endM = (endParts[0] || 0) * 60 + (endParts[1] || 0);
        const startM = (nextStartParts[0] || 0) * 60 + (nextStartParts[1] || 0);

        if (startM > endM) {
          breakMins += (startM - endM);
        }
      }
    }
    const breakHours = parseFloat((breakMins / 60).toFixed(2));

    daily.push({ date: entry.date, workHours, breakHours });

    // Weekly (ISO Week)
    const d = new Date(entry.date);
    const onejan = new Date(d.getFullYear(), 0, 1);
    const weekNum = Math.ceil((((d.getTime() - onejan.getTime()) / 86400000) + onejan.getDay() + 1) / 7);
    const weekKey = `${d.getFullYear()}-W${weekNum}`;
    weeklyMap.set(weekKey, (weeklyMap.get(weekKey) || 0) + workHours);

    // Monthly
    const monthKey = entry.date.substring(0, 7); // YYYY-MM
    monthlyMap.set(monthKey, (monthlyMap.get(monthKey) || 0) + workHours);
  }

  return {
    daily,
    weekly: Array.from(weeklyMap.entries()).map(([week, hours]) => ({ week, hours: parseFloat(hours.toFixed(2)) })),
    monthly: Array.from(monthlyMap.entries()).map(([month, hours]) => ({ month, hours: parseFloat(hours.toFixed(2)) }))
  };
};
