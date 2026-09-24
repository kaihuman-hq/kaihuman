export interface LogEntry {
  date: string;
  op: string;
  title: string;
  body: string;
}

const HEADING = /^## \[(\d{4}-\d{2}-\d{2})\][ \t]+(.*?)[ \t]*\|[ \t]*(.*?)[ \t]*$/;

/** Parses `## [YYYY-MM-DD] op | title` entries, newest first (later entries win date ties). */
export function parseLog(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  let current: { entry: LogEntry; lines: string[] } | null = null;
  const flush = () => {
    if (current) {
      current.entry.body = current.lines.join('\n').trim();
      entries.push(current.entry);
    }
  };

  for (const line of text.split(/\r?\n/)) {
    const heading = HEADING.exec(line);
    if (heading) {
      flush();
      current = {
        entry: { date: heading[1] ?? '', op: heading[2] ?? '', title: heading[3] ?? '', body: '' },
        lines: [],
      };
    } else if (current) {
      current.lines.push(line);
    }
  }
  flush();

  // Reversing first keeps same-day entries in reverse append order after the stable sort.
  return entries.reverse().sort((a, b) => b.date.localeCompare(a.date));
}
