
export interface BudgetTransaction {
  name: string;
  account: string;
  category: string;
  date: string;
  value: number;
}

export interface Category {
  id: string;
  label: string;
  priority: number;
  type: 'in' | 'out';
  color?: string; // Optional for chart coloring
}

export const CATEGORIES: Category[] = [
  { id: 'earnings', label: 'Earnings', priority: 1, type: 'in', color: '#10B981' }, // emerald-500
  { id: 'transport', label: 'Transport', priority: 2, type: 'out', color: '#3B82F6' }, // blue-500
  { id: 'food', label: 'Food', priority: 1, type: 'out', color: '#EF4444' }, // red-500
  { id: 'pocket-money', label: 'Pocket Money', priority: 3, type: 'out', color: '#F59E0B' }, // amber-500
  { id: 'education', label: 'Education', priority: 1, type: 'out', color: '#8B5CF6' }, // violet-500
  { id: 'entertainment', label: 'Entertainment', priority: 4, type: 'out', color: '#EC4899' }, // pink-500
  { id: 'savings', label: 'Savings', priority: 4, type: 'out', color: '#6366F1' }, // indigo-500
  { id: 'hobby', label: 'Hobby', priority: 4, type: 'out', color: '#14B8A6' }, // teal-500
  { id: 'running-costs', label: 'Running Costs', priority: 1, type: 'out', color: '#F97316' }, // orange-500
  { id: 'insurance', label: 'Insurance', priority: 1, type: 'out', color: '#06B6D4' }, // cyan-500
  { id: 'loan', label: 'Loan', priority: 1, type: 'out', color: '#71717A' }, // zinc-500
  { id: 'tax', label: 'Tax', priority: 1, type: 'out', color: '#EF4444' }, // red-500
  { id: 'invest', label: 'Invest', priority: 4, type: 'out', color: '#8B5CF6' }, // violet-500
  { id: 'other-income', label: 'Other (Income)', priority: 1, type: 'in', color: '#10B981' }, // emerald-500
  { id: 'other-outcome', label: 'Other (Outcome)', priority: 1, type: 'out', color: '#64748B' }, // slate-500
];

export const parseBudget = (content: string): BudgetTransaction[] => {
  if (!content) return [];
  const lines = content.split('\n');
  const transactions: BudgetTransaction[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('name;')) continue; // Skip header and empty lines

    const parts = line.split(';');
    if (parts.length >= 5) {
      transactions.push({
        name: parts[0] || "",
        account: parts[1] || "",
        category: parts[2] || "",
        date: parts[3] || "",
        value: parseFloat(parts[4] || "0")
      });
    }
  }

  return transactions;
};

export const serializeBudget = (transactions: BudgetTransaction[]): string => {
  const lines = [
    'name;account;category;date;value'
  ];

  for (const t of transactions) {
    lines.push(`${t.name};${t.account};${t.category};${t.date};${t.value}`);
  }

  return lines.join('\n');
};

export const getCategoryStats = (transactions: BudgetTransaction[]) => {
  const stats: Record<string, number> = {};

  transactions.forEach(t => {
    // For calculating "costs" or "budget usage", we generally might want to ignore earnings?
    // Or maybe we want to visualize earnings too. 
    // The requirement says "bar chart per category (cumulated)". 
    // Assuming we sum up values.

    // NOTE: In the example, earnings are positive, expenses are positive numbers too.
    // We should probably rely on Category Type to determine if it's In or Out if we were doing a balance.
    // For now, simple sum per category ID.
    const current = stats[t.category] || 0;
    stats[t.category] = current + t.value;
  });

  return Object.entries(stats).map(([id, value]) => ({
    id,
    label: CATEGORIES.find(c => c.id === id)?.label || id,
    value,
    color: CATEGORIES.find(c => c.id === id)?.color || '#ccc'
  })).sort((a, b) => b.value - a.value);
};

export const getAccountStats = (transactions: BudgetTransaction[]) => {
  const stats: Record<string, number> = {};

  transactions.forEach(t => {
    // Calculate IN vs OUT per account?
    // Or just raw activity volume?
    // Requirement: "bar chart per account (cumulated)"
    // Usually "Budget" implies tracking expenses.
    // If we assume standard positive numbers for both earnings and expenses in the file:

    const category = CATEGORIES.find(c => c.id === t.category);
    const isIncome = category?.type === 'in';

    // If we want "Balance" per account:
    // Income - Expense

    const current = stats[t.account] || 0;
    if (isIncome) {
      stats[t.account] = current + t.value;
    } else {
      stats[t.account] = current - t.value;
    }
  });

  return Object.entries(stats).map(([id, value]) => ({
    id,
    label: id,
    value
  })).sort((a, b) => b.value - a.value);
};

export const getUniqueAccounts = (transactions: BudgetTransaction[]): string[] => {
  return Array.from(new Set(transactions.map(t => t.account))).sort();
};

export const getUniqueNames = (transactions: BudgetTransaction[]): string[] => {
  return Array.from(new Set(transactions.map(t => t.name))).sort();
};
