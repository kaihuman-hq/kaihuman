export interface ReadItLaterItem {
  id: string;
  url: string;
  status: 'read' | 'new';
  name: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export interface ReadItLaterConfig {
  items: ReadItLaterItem[];
}

export const DEFAULT_CONFIG: ReadItLaterConfig = {
  items: [],
};

export const parseReadItLater = (content: string): ReadItLaterConfig => {
  if (!content.trim()) return { items: [] };
  try {
    const parsed = JSON.parse(content);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
    };
  } catch (e) {
    console.warn('[read-later] Failed to parse read it later config', e);
    return { items: [] };
  }
};

export const serializeReadItLater = (config: ReadItLaterConfig): string => {
  return JSON.stringify(config, null, 2);
};

export const markAsRead = (
  config: ReadItLaterConfig,
  id: string,
  now = Date.now(),
): ReadItLaterConfig => {
  const items = config.items.map((item) => {
    if (item.id === id) {
      return { ...item, status: 'read' as const, updatedAt: now };
    }
    return item;
  });
  return { ...config, items };
};

export const markAsNew = (config: ReadItLaterConfig, id: string): ReadItLaterConfig => {
  const items = config.items.map((item) => {
    if (item.id === id) {
      return { ...item, status: 'new' as const, updatedAt: Date.now() };
    }
    return item;
  });
  return { ...config, items };
};

export const deleteItem = (config: ReadItLaterConfig, id: string): ReadItLaterConfig => {
  const items = config.items.filter((item) => item.id !== id);
  return { ...config, items };
};

export const deleteAllRead = (config: ReadItLaterConfig): ReadItLaterConfig => {
  const items = config.items.filter((item) => item.status !== 'read');
  return { ...config, items };
};

/**
 * The list about to be changed. Unlike `parseReadItLater`, a file that is not valid JSON throws
 * rather than reading as empty, so a write never replaces a list it could not read.
 */
export const parseReadItLaterForWrite = (content: string): ReadItLaterConfig => {
  if (!content.trim()) return { items: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('The read-later list is not valid JSON — fix it in the console first');
  }
  const items = (parsed as { items?: unknown } | null)?.items;
  return { items: Array.isArray(items) ? items : [] };
};

/** Marks one item read, in the file's text. */
export const markReadItLaterRead = (content: string, id: string, now = Date.now()): string => {
  const config = parseReadItLaterForWrite(content);
  if (!config.items.some((item) => item.id === id)) {
    throw new Error('That item is no longer on the list');
  }
  return serializeReadItLater(markAsRead(config, id, now));
};
