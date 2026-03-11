import { useMemo, useState } from 'preact/hooks';
import { MonoLabel } from '../../Atoms/Typography';
import {
  type BudgetTransaction,
  CATEGORIES,
  getUniqueAccounts,
  getUniqueNames,
} from './BudgetLogic';

interface BudgetAddFormProps {
  transactions: BudgetTransaction[];
  onAdd: (transaction: BudgetTransaction) => void;
}

export const BudgetAddForm = ({ transactions, onAdd }: BudgetAddFormProps) => {
  const [name, setName] = useState('');
  const [useCustomName, setUseCustomName] = useState(false);

  const [account, setAccount] = useState('');
  const [useCustomAccount, setUseCustomAccount] = useState(false);

  const [category, setCategory] = useState(CATEGORIES[0]?.id || 'earnings');
  const [value, setValue] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  const uniqueNames = useMemo(() => getUniqueNames(transactions), [transactions]);
  const uniqueAccounts = useMemo(() => getUniqueAccounts(transactions), [transactions]);

  // If no existing names/accounts, force custom input
  const showNameDropdown = uniqueNames.length > 0;
  const showAccountDropdown = uniqueAccounts.length > 0;

  const handleSubmit = (e: Event) => {
    e.preventDefault();
    if ((!name && !useCustomName) || !account || !category || !value || !date) return;

    onAdd({
      name,
      account,
      category,
      date,
      value: parseFloat(value),
    });

    // Reset form slightly for easier next entry
    setValue('');
    // Keep date, account, category as they likely remain same for batch entry
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4 max-w-md w-full mx-auto">
      {/* NAME FIELD */}
      <div className="flex flex-col gap-2">
        <MonoLabel>Name</MonoLabel>

        {showNameDropdown && !useCustomName ? (
          <div className="flex gap-2">
            <select
              className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
              value={name}
              onChange={(e) => setName(e.currentTarget.value)}
            >
              <option value="" disabled>
                Select Name
              </option>
              {uniqueNames.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setUseCustomName(true);
                setName('');
              }}
              className="px-2 py-1 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              +
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
              placeholder="Transaction Name"
              value={name}
              onInput={(e) => setName(e.currentTarget.value)}
            />
            {showNameDropdown && (
              <button
                type="button"
                onClick={() => {
                  setUseCustomName(false);
                  setName('');
                }}
                className="px-2 py-1 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              >
                List
              </button>
            )}
          </div>
        )}
      </div>

      {/* ACCOUNT FIELD */}
      <div className="flex flex-col gap-2">
        <MonoLabel>Account</MonoLabel>

        {showAccountDropdown && !useCustomAccount ? (
          <div className="flex gap-2">
            <select
              className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
              value={account}
              onChange={(e) => setAccount(e.currentTarget.value)}
            >
              <option value="" disabled>
                Select Account
              </option>
              {uniqueAccounts.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                setUseCustomAccount(true);
                setAccount('');
              }}
              className="px-2 py-1 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
            >
              +
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <input
              type="text"
              className="flex-1 bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
              placeholder="Account (e.g. bwbank:adam)"
              value={account}
              onInput={(e) => setAccount(e.currentTarget.value)}
            />
            {showAccountDropdown && (
              <button
                type="button"
                onClick={() => {
                  setUseCustomAccount(false);
                  setAccount('');
                }}
                className="px-2 py-1 border border-[var(--los-border)] text-[var(--los-muted)] hover:text-[var(--los-fg)]"
              >
                List
              </button>
            )}
          </div>
        )}
      </div>

      {/* CATEGORY FIELD */}
      <div className="flex flex-col gap-2">
        <MonoLabel>Category</MonoLabel>
        <select
          className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
          value={category}
          onChange={(e) => setCategory(e.currentTarget.value)}
        >
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      {/* VALUE FIELD */}
      <div className="flex flex-col gap-2">
        <MonoLabel>Value</MonoLabel>
        <input
          type="number"
          step="0.01"
          className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
          placeholder="0.00"
          value={value}
          onInput={(e) => setValue(e.currentTarget.value)}
        />
      </div>

      {/* DATE FIELD */}
      <div className="flex flex-col gap-2">
        <MonoLabel>Date</MonoLabel>
        <input
          type="date"
          className="w-full bg-[var(--los-bg)] border border-[var(--los-border)] p-2 rounded-sm text-[var(--los-fg)] text-xs font-mono focus:border-[var(--los-accent)] outline-none"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
      </div>

      <button
        type="submit"
        className="mt-4 bg-[var(--los-accent)] text-black font-bold py-2 px-4 rounded-sm hover:opacity-90 uppercase text-xs tracking-widest"
      >
        Add Transaction
      </button>
    </form>
  );
};
