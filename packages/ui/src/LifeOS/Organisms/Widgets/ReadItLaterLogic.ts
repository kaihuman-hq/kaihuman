
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
  items: []
};

export const parseReadItLater = (content: string): ReadItLaterConfig => {
  try {
    const parsed = JSON.parse(content);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : []
    };
  } catch (e) {
    console.warn("Failed to parse read it later config", e);
    return DEFAULT_CONFIG;
  }
};

export const serializeReadItLater = (config: ReadItLaterConfig): string => {
  return JSON.stringify(config, null, 2);
};

export const markAsRead = (config: ReadItLaterConfig, id: string): ReadItLaterConfig => {
  const items = config.items.map(item => {
    if (item.id === id) {
      return { ...item, status: 'read' as const, updatedAt: Date.now() };
    }
    return item;
  });
  return { ...config, items };
};

export const markAsNew = (config: ReadItLaterConfig, id: string): ReadItLaterConfig => {
  const items = config.items.map(item => {
    if (item.id === id) {
      return { ...item, status: 'new' as const, updatedAt: Date.now() };
    }
    return item;
  });
  return { ...config, items };
};

export const deleteItem = (config: ReadItLaterConfig, id: string): ReadItLaterConfig => {
  const items = config.items.filter(item => item.id !== id);
  return { ...config, items };
};

export const deleteAllRead = (config: ReadItLaterConfig): ReadItLaterConfig => {
  const items = config.items.filter(item => item.status !== 'read');
  return { ...config, items };
};
