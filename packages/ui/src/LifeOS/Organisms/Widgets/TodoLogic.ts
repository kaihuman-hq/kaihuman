/**
 * Logic for the Todo Widget (.todos.md)
 */

export interface TodoItem {
  id: string; // Unique ID (e.g., generated timestamp or hash, simplified here as group+index or just text hash)
  text: string;
  checked: boolean;
  createdAt?: string;
  updatedAt?: number; // Timestamp
  rawLine: string; // Keep original formatting if possible
}

export interface TodoGroup {
  name: string; // H1 heading
  todos: TodoItem[];
}

export interface TodoData {
  frontmatter: string[]; // Lines before first H1
  groups: TodoGroup[];
  footer: string[]; // Anything after last group (unlikely but safe to keep)
}

/**
 * Parses markdown content into structured TodoData.
 * Ignores frontmatter (lines before first # Header).
 * Groups by H1 headers.
 * Extracts todos matching "- [ ]" or "- [x]".
 * Captures "::updated:: 123456789" lines associated with todos.
 */
export const parseTodos = (md: string): TodoData => {
  if (!md) return { frontmatter: [], groups: [], footer: [] };

  const lines = md.split(/\r?\n/);
  const frontmatter: string[] = [];
  const groups: TodoGroup[] = [];
  let currentGroup: TodoGroup | null = null;

  // State parsing
  let inFrontmatter = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    // Detect Group (H1)
    if (line.match(/^#\s+(.*)/)) {
      inFrontmatter = false;
      // Start new group
      currentGroup = {
        name: line.replace(/^#\s+/, '').trim(),
        todos: []
      };
      groups.push(currentGroup);
      continue;
    }

    if (inFrontmatter) {
      frontmatter.push(line);
      continue;
    }

    // Detect Todo
    const todoMatch = line.match(/^(\s*)([-*])\s+\[([ xX])\]\s+(.*)/);
    if (todoMatch && currentGroup) {
      const indent = todoMatch[1] || '';
      // todoMatch[2] is the bullet char, ignored for logic but good to know
      const state = (todoMatch[3] || '').toLowerCase();
      let text = todoMatch[4] || '';
      const isChecked = state === 'x';

      let createdAt: string | undefined;
      const isoRegex = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z)\s+(.*)/;
      const isoMatch = text.match(isoRegex);
      if (isoMatch) {
         createdAt = isoMatch[1];
         text = isoMatch[2] || '';
      }

      // Look ahead for ::updated::
      let updatedAt: number | undefined;
      let nextLine = lines[i + 1];
      if (nextLine && nextLine.trim().startsWith('::updated::')) {
        const parts = nextLine.trim().split('::updated::');
        if (parts[1]) updatedAt = parseInt(parts[1].trim());
        i++; // Skip next line as we consumed it
      }

      if (currentGroup) {
        currentGroup.todos.push({
          id: `${currentGroup.name || 'group'}-${currentGroup.todos.length}-${Date.now()}`,
          text,
          checked: isChecked,
          createdAt,
          updatedAt,
          rawLine: line
        });
      }
      continue;
    }
  }

  return { frontmatter, groups, footer: [] };
};

/**
 * Serializes structured TodoData back to markdown.
 */
export const serializeTodos = (data: TodoData): string => {
  let md = data.frontmatter.join('\n');
  if (data.frontmatter.length > 0) md += '\n';

  for (const group of data.groups) {
    // Ensure spacing before headers if not first
    if (!md.endsWith('\n\n') && md.length > 0) md += '\n';

    md += `# ${group.name}\n`;

    for (const todo of group.todos) {
      const checkbox = todo.checked ? '[x]' : '[ ]';
      const fullText = todo.createdAt ? `${todo.createdAt} ${todo.text}` : todo.text;
      md += `* ${checkbox} ${fullText}\n`;

      if (todo.updatedAt) {
        md += `::updated:: ${todo.updatedAt}\n`;
      }
    }
  }

  return md;
};

/**
 * Filter logic for "Small" widget view.
 * Hides ticked todos older than 1 hour.
 */
export const getVisibleTodos = (data: TodoData, hideCompletedOlderThanMs = 3600000): TodoData => {
  const now = Date.now();

  const visibleGroups = data.groups.map(group => ({
    ...group,
    todos: group.todos.filter(t => {
      if (!t.checked) return true; // Always show pending
      if (!t.updatedAt) return true; // Show if no timestamp found (safe default)
      return (now - t.updatedAt) < hideCompletedOlderThanMs;
    })
  })).filter(g => g.todos.length > 0); // Hide empty groups? Maybe keep headers? Let's keep headers if they exist in file logic, but for widget maybe clean visual.

  return {
    ...data,
    groups: visibleGroups
  };
};

/**
 * Toggle a todo state
 */
export const toggleTodo = (data: TodoData, groupName: string, todoIndex: number, checked: boolean): TodoData => {
  const newGroups = data.groups.map(g => {
    if (g.name !== groupName) return g;

    const newTodos = [...g.todos];
    if (newTodos[todoIndex]) {
      newTodos[todoIndex] = {
        ...newTodos[todoIndex],
        checked,
        updatedAt: Date.now()
      };
    }
    return { ...g, todos: newTodos };
  });

  return { ...data, groups: newGroups };
}

/**
 * Add a new todo
 */
export const addTodo = (data: TodoData, groupName: string, text: string): TodoData => {
  let groupIndex = data.groups.findIndex(g => g.name === groupName);
  let newGroups = [...data.groups];

  if (groupIndex === -1) {
    // Create new group
    newGroups.push({
      name: groupName,
      todos: []
    });
    groupIndex = newGroups.length - 1;
  }

  const targetGroup = { ...newGroups[groupIndex] };
  if (!targetGroup.todos) targetGroup.todos = []; // Safety

  const createdAt = new Date().toISOString();

  targetGroup.todos = [
    ...targetGroup.todos,
    {
      id: `new-${Date.now()}`,
      text,
      checked: false,
      createdAt,
      updatedAt: Date.now(),
      rawLine: `* [ ] ${createdAt} ${text}`
    }
  ];
  newGroups[groupIndex] = targetGroup as TodoGroup;

  return { ...data, groups: newGroups };
}
