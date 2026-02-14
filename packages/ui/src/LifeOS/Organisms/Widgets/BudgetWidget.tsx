
import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { parseBudget, serializeBudget, getCategoryStats, getAccountStats, BudgetTransaction, CATEGORIES } from './BudgetLogic';
import { BudgetAddForm } from './BudgetAddForm';
import { MonoLabel, MonoText, MonoHeader } from '../../Atoms/Typography';
import { CompactWidgetLayout, CompactHero, CompactList } from './CompactWidgetLayout';
import { cn } from '../../../utils';

export interface BudgetWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ACCOUNTS' | 'ADD' | 'MOBILE_EXPANDED' | 'MOBILE_COLLAPSED'; // ACCOUNTS and ADD are sub-modes of FOCUS really, but passed down
  onChange?: (newContent: string) => void;
}

export const BudgetWidget = ({ content, mode, onChange }: BudgetWidgetProps) => {
  const transactions = useMemo(() => parseBudget(content), [content]);

  const categoryStats = useMemo(() => getCategoryStats(transactions), [transactions]);
  const accountStats = useMemo(() => getAccountStats(transactions), [transactions]);

  const maxCategoryValue = Math.max(...categoryStats.map(s => s.value), 1);
  const maxAccountValue = Math.max(...accountStats.map(s => Math.abs(s.value)), 1);

  const handleAdd = (newTransaction: BudgetTransaction) => {
    const newTransactions = [...transactions, newTransaction];
    const newContent = serializeBudget(newTransactions);
    onChange?.(newContent);
  };


  const totalBalance = useMemo(() => {
    return transactions.reduce((acc, t) => {
      const category = CATEGORIES.find(c => c.id === t.category);
      const isExpense = category?.type === 'out';
      // If it's an expense, subtract the value
      return acc + (isExpense ? -t.value : t.value);
    }, 0);
  }, [transactions]);

  const renderCategoryChart = () => (
    <div className={cn("flex flex-col gap-2 w-full p-4 custom-scrollbar", mode === 'SMALL' || mode === 'MOBILE_EXPANDED' ? "h-full overflow-y-auto" : "min-h-full")}>
      <div className="flex justify-between items-center mb-4 border-b border-[var(--los-border)] pb-2">
        <MonoLabel>Total Balance</MonoLabel>
        <MonoText className={totalBalance >= 0 ? "text-green-500" : "text-red-500"}>
          {totalBalance.toFixed(2)}
        </MonoText>
      </div>
      {categoryStats.map(stat => (
        <div key={stat.id} className="flex flex-col gap-1 w-full">
          <div className="flex justify-between items-end">
            <MonoLabel className="text-[10px] truncate max-w-[70%]">{stat.label}</MonoLabel>
            <MonoText className="text-[10px]">{stat.value.toFixed(2)}</MonoText>
          </div>
          <div className="h-2 w-full bg-[var(--los-border)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.max(0, (stat.value / maxCategoryValue) * 100)}%`,
                backgroundColor: stat.color || 'var(--los-accent)'
              }}
            />
          </div>
        </div>
      ))}
      {categoryStats.length === 0 && (
        <div className="flex items-center justify-center h-full text-[var(--los-muted)] text-xs">
          No data available
        </div>
      )}
    </div>
  );

  const renderAccountChart = () => (
    <div className={cn("flex flex-col gap-2 w-full p-4 custom-scrollbar", mode === 'SMALL' || mode === 'MOBILE_EXPANDED' ? "h-full overflow-y-auto" : "min-h-full")}>
      {accountStats.map(stat => (
        <div key={stat.id} className="flex flex-col gap-1 w-full">
          <div className="flex justify-between items-end">
            <MonoLabel className="text-[10px] truncate max-w-[70%]">{stat.label}</MonoLabel>
            <MonoText className="text-[10px]">{stat.value.toFixed(2)}</MonoText>
          </div>
          {/* Account bars might be negative if we tracked expenses as negative, or just simple volume. 
              The logic currently sums them.
              Refinement: Visualization of negative values center-aligned? 
              For now keeping simple left-aligned bar but handling negative values (Bug 1.22)
          */}
          <div className="h-2 w-full bg-[var(--los-border)] rounded-full overflow-hidden flex">
            {/* If we wanted center alignment we would need a different layout. 
                 Current Request: "render it the same way as bars, but with a red bar instead of white... Use the positive value for the width" 
             */}
            <div
              className={`h-full rounded-full transition-all duration-500 ${stat.value < 0 ? "bg-red-500" : "bg-[var(--los-fg)]"}`}
              style={{ width: `${Math.max(0, (Math.abs(stat.value) / maxAccountValue) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {accountStats.length === 0 && (
        <div className="flex items-center justify-center h-full text-[var(--los-muted)] text-xs">
          No data available
        </div>
      )}
    </div>
  );


  if (mode === 'ADD') {
    return (
      <div className="w-full h-full overflow-y-auto custom-scrollbar">
        <BudgetAddForm transactions={transactions} onAdd={handleAdd} />
      </div>
    );
  }

  if (mode === 'ACCOUNTS') {
    return renderAccountChart();
  }

  if (mode === 'MOBILE_COLLAPSED') {
    const income = transactions.reduce((acc, t) => t.value > 0 ? acc + t.value : acc, 0);
    const outcome = transactions.reduce((acc, t) => t.value < 0 ? acc + Math.abs(t.value) : acc, 0);
    const balance = totalBalance;
    const maxVal = Math.max(income, outcome, Math.abs(balance), 1);

    return (
      <div className="flex flex-col justify-center h-full w-full p-4 gap-2">
        {/* Income */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] uppercase text-[var(--los-muted)]">
            <span>INCOME</span>
            <span className="text-green-500">{income.toFixed(0)}</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--los-border)] rounded-full overflow-hidden">
            <div className="h-full bg-green-500 rounded-full" style={{ width: `${(income / maxVal) * 100}%` }} />
          </div>
        </div>
        {/* Outcome */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] uppercase text-[var(--los-muted)]">
            <span>OUTCOME</span>
            <span className="text-red-500">{outcome.toFixed(0)}</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--los-border)] rounded-full overflow-hidden">
            <div className="h-full bg-red-500 rounded-full" style={{ width: `${(outcome / maxVal) * 100}%` }} />
          </div>
        </div>
        {/* Balance */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between text-[10px] uppercase text-[var(--los-muted)]">
            <span>BALANCE</span>
            <span className={balance >= 0 ? "text-[var(--los-fg)]" : "text-red-500"}>{balance.toFixed(0)}</span>
          </div>
          <div className="h-1.5 w-full bg-[var(--los-border)] rounded-full overflow-hidden">
            <div className={cn("h-full rounded-full", balance >= 0 ? "bg-[var(--los-fg)]" : "bg-red-500")} style={{ width: `${(Math.abs(balance) / maxVal) * 100}%` }} />
          </div>
        </div>
      </div>
    );
  }

  if (mode === 'MOBILE_EXPANDED') {
    // Estimate "Monthly Budget" as (Total Balance + Total Expenses) for visualization
    // or just normalize against max value. 
    // Let's just show Total Balance as Hero.
    const topCategories = categoryStats.sort((a, b) => b.value - a.value).slice(0, 3);

    return (
      <CompactWidgetLayout>
        <CompactHero className="flex-1 justify-center">
          <MonoLabel className="text-xs text-[var(--los-muted)] uppercase mb-2">Total Balance</MonoLabel>
          <MonoHeader className={cn(
            "text-5xl font-bold mb-4",
            totalBalance >= 0 ? "text-green-500" : "text-red-500"
          )}>
            {totalBalance.toFixed(2)}
          </MonoHeader>

          {/* Visual Progress Bar placeholder - roughly 70% opacity bar */}
          <div className="w-full max-w-[200px] h-2 bg-[var(--los-border)] rounded-full overflow-hidden mt-2">
            <div className="h-full bg-green-500 w-[60%]" />
          </div>
          <MonoText className="text-[10px] text-[var(--los-muted)] mt-2">
            60% of budget remaining
          </MonoText>
        </CompactHero>

        <div className="border-t border-[var(--los-border)] pt-4 pb-2">
          <div className="flex justify-between text-[10px] text-[var(--los-muted)] mb-2 uppercase">
            <span>Top Spending</span>
            <span>Amount</span>
          </div>
          <div className="flex flex-col gap-2">
            {topCategories.map(cat => (
              <div key={cat.id} className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: cat.color }} />
                  <MonoText className="text-sm">{cat.label}</MonoText>
                </div>
                <MonoText>{cat.value.toFixed(2)}</MonoText>
              </div>
            ))}
          </div>
        </div>
      </CompactWidgetLayout>
    )
  }

  // Default / SMALL / FOCUS (Widget tab)
  return renderCategoryChart();
};
