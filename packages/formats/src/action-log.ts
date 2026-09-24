export interface ActionLogEntry {
  timestamp: string; // ISO String
  description: string;
  tags: string[];
}

export interface ActionLogFile {
  frontmatter: Record<string, string>;
  entries: ActionLogEntry[];
}

/**
 * Parses .actionlog.md content.
 * Expected format:
 * ---
 * ...frontmatter...
 * ---
 *
 * # Header
 *
 * - YYYY-MM-DD HH:mm:ss Description #tag1 #tag2
 */
export const parseActionLog = (content: string): ActionLogFile => {
  if (!content) return { frontmatter: {}, entries: [] };

  const lines = content.split('\n');
  const frontmatter: Record<string, string> = {};
  const entries: ActionLogEntry[] = [];

  let inFrontmatter = false;
  let fmCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]?.trim() || '';

    // Frontmatter handling
    if (line === '---') {
      fmCount++;
      inFrontmatter = fmCount === 1;
      continue;
    }

    if (inFrontmatter) {
      const parts = line.split(':');
      if (parts.length >= 2) {
        const key = parts[0]?.trim() || '';
        const value = parts.slice(1).join(':').trim();
        if (key) {
          frontmatter[key] = value;
        }
      }
      continue;
    }

    // List Items
    // Match lines starting with optional whitespace, then - or *, then space
    const listMatch = line.match(/^\s*([-*])\s+(.+)/);

    if (listMatch) {
      const entryText = (listMatch[2] || '').trim();
      // Regex to find timestamp at start: YYYY-MM-DD HH:mm:ss
      // and tags at the end or anywhere #tag

      // Simple parsing: split by first space?
      // Timestamp format is "YYYY-MM-DD HH:mm:ss" which has spaces.
      // Expected: 2025-03-19 19:20:03 Flexible...

      const timestampRegex = /^(\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2})\s+(.+)/;
      const match = entryText.match(timestampRegex);

      if (match) {
        const timestampStr = match[1] || '';
        const rest = match[2] || '';

        // Extract tags
        const tags: string[] = [];
        const tagRegex = /#([\w-]+)/g;
        let tagMatch = tagRegex.exec(rest);
        while (tagMatch !== null) {
          if (tagMatch[1]) {
            tags.push(tagMatch[1]);
          }
          tagMatch = tagRegex.exec(rest);
        }

        // Description clean up (remove tags?)
        // Requirement says "Flexible... #tag". Usually we keep tags in text or remove?
        // Let's keep them in text for display but also parse them out.
        // Or remove them from description? "Flexible... "
        // Let's standard markdown behavior: Tags might be part of the text.
        // But for clean UI, maybe we want separated tags.
        // Let's strip tags from description for the UI if they are at the end.
        // For simplicity: Description is everything after timestamp. Tags are extracted.

        entries.push({
          timestamp: timestampStr,
          description: rest,
          tags: tags,
        });
      }
    }
  }

  // Sort entries desc (newest first) or preserve file order?
  // File is usually append-only (oldest first).
  // Widget wants "last 5 items", implies time order.

  return { frontmatter, entries };
};

export const serializeActionLog = (data: ActionLogFile): string => {
  const lines: string[] = [];

  // Frontmatter
  lines.push('---');
  Object.entries(data.frontmatter).forEach(([k, v]) => {
    lines.push(`${k}: ${v}`);
  });
  lines.push('---');
  lines.push('');
  lines.push('# Action Log');
  lines.push('');

  // Entries
  data.entries.forEach((e) => {
    lines.push(`- ${e.timestamp} ${e.description}`);
  });

  return lines.join('\n');
};

export const appendAction = (
  data: ActionLogFile,
  description: string,
  tags: string[],
  now = new Date(),
): ActionLogFile => {
  // Format: YYYY-MM-DD HH:mm:ss
  const pad = (n: number) => n.toString().padStart(2, '0');
  const timestamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

  // Parse inline tags from description and merge with provided tags
  const inlineTags: string[] = [];
  const tagRegex = /#([\w-]+)/g;
  let match = tagRegex.exec(description);
  while (match !== null) {
    if (match[1]) inlineTags.push(match[1]);
    match = tagRegex.exec(description);
  }

  // Combine and deduplicate tags
  const allTags = Array.from(new Set([...tags, ...inlineTags]));

  // Construct full description - if tags were provided explicitly, append them if not already inline
  // Logic:
  // 1. If tag was inline, it's already in description.
  // 2. If tag was in 'tags' array (input field), append it to description?
  // The requirement says: "just add tags into the description by using the '#' character"
  // It also implies we might still use the separate input.
  // Standard behavior: Append non-inline tags to the end of description string for storage consistency?
  // Or just rely on 'tags' array for metadata and keep description as is?
  // Existing logic appended tags to description. Let's keep that for non-inline tags.

  const tagsToAppend = tags.filter((t) => !description.includes(`#${t}`));
  const tagsStr = tagsToAppend.map((t) => `#${t}`).join(' ');
  const fullDescription = tagsStr ? `${description} ${tagsStr}` : description;

  const newEntry: ActionLogEntry = {
    timestamp,
    description: fullDescription,
    tags: allTags,
  };

  return {
    ...data,
    entries: [...data.entries, newEntry],
  };
};
