
import { h } from 'preact';
import { useMemo } from 'preact/hooks';
import { parseBudget, serializeBudget, getCategoryStats, getAccountStats, BudgetTransaction } from './BudgetLogic';
import { BudgetAddForm } from './BudgetAddForm';
import { MonoLabel, MonoText } from '../../Atoms/Typography';

export interface BudgetWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'ACCOUNTS' | 'ADD'; // ACCOUNTS and ADD are sub-modes of FOCUS really, but passed down
  onChange?: (newContent: string) => void;
}

export const BudgetWidget = ({ content, mode, onChange }: BudgetWidgetProps) => {
  const transactions = useMemo(() => parseBudget(content), [content]);

  const categoryStats = useMemo(() => getCategoryStats(transactions), [transactions]);
  const accountStats = useMemo(() => getAccountStats(transactions), [transactions]);

  const maxCategoryValue = Math.max(...categoryStats.map(s => s.value), 1);
  const maxAccountValue = Math.max(...accountStats.map(s => s.value), 1);

  const handleAdd = (newTransaction: BudgetTransaction) => {
    const newTransactions = [...transactions, newTransaction];
    const newContent = serializeBudget(newTransactions);
    onChange?.(newContent);
  };

  const renderCategoryChart = () => (
    <div className="flex flex-col gap-2 w-full h-full overflow-y-auto p-4 custom-scrollbar">
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
    <div className="flex flex-col gap-2 w-full h-full overflow-y-auto p-4 custom-scrollbar">
      {accountStats.map(stat => (
        <div key={stat.id} className="flex flex-col gap-1 w-full">
          <div className="flex justify-between items-end">
            <MonoLabel className="text-[10px] truncate max-w-[70%]">{stat.label}</MonoLabel>
            <MonoText className="text-[10px]">{stat.value.toFixed(2)}</MonoText>
          </div>
          {/* Account bars might be negative if we tracked expenses as negative, or just simple volume. 
              The logic currently sums them.
              Refinement: Visualization of negative values center-aligned? 
              For now keeping simple left-aligned bar.
          */}
          <div className="h-2 w-full bg-[var(--los-border)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--los-fg)] rounded-full transition-all duration-500"
              style={{ width: `${Math.max(0, (stat.value / maxAccountValue) * 100)}%` }}
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

  // Default / SMALL / FOCUS (Widget tab)
  return renderCategoryChart();
};
