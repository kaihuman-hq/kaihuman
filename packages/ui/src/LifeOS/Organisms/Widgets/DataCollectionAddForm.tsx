import { ArrowRight } from 'lucide-preact';
import { useMemo, useState } from 'preact/hooks';
import { cn } from '../../../utils';
import { MonoLabel, MonoText } from '../../Atoms/Typography';
import { calculateAutoValues, type DataCollectionData, type DataRow } from './DataCollectionLogic';

interface DataCollectionAddFormProps {
  data: DataCollectionData;
  onAdd: (newRow: DataRow) => void;
}

export const DataCollectionAddForm = ({ data, onAdd }: DataCollectionAddFormProps) => {
  // Determine relevant input columns (non-auto)
  const inputColumns = useMemo(() => {
    return data.columns.filter((c) => !c.isAuto);
  }, [data.columns]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  const handleInputChange = (colName: string, value: string) => {
    setValues((prev) => ({ ...prev, [colName]: value }));
    if (errors[colName]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[colName];
        return next;
      });
    }
  };

  const handleSubmit = () => {
    const newErrors: Record<string, string> = {};
    const rowValues: DataRow = {};

    inputColumns.forEach((col) => {
      const raw = values[col.name] || '';

      if (col.type === 'number') {
        if (!raw || Number.isNaN(Number(raw))) {
          newErrors[col.name] = 'Invalid number';
        } else {
          rowValues[col.name] = raw; // Store as string initially, logic handles parsing
        }
      } else if (col.type === 'date') {
        // Basic date validation?
        if (!raw) newErrors[col.name] = 'Required';
        else rowValues[col.name] = raw;
      } else {
        if (!raw) newErrors[col.name] = 'Required';
        else rowValues[col.name] = raw;
      }
    });

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    // Prepare full row with auto values
    const fullRow = { ...rowValues };

    // First fill auto columns with temporary nulls if mostly ensuring keys exist
    // But calculateAutoValues expects row to handle autos based on current row state.

    // We need to pass the *full* row to calculateAutoValues including defaults for autos?
    // Actually calculateAutoValues determines autos.

    const calculatedRow = calculateAutoValues(fullRow, data.columns);

    onAdd(calculatedRow);
    setValues({}); // Reset form
  };

  return (
    <div className="p-8 w-full max-w-xl mx-auto flex flex-col gap-6">
      <div className="border-b border-[var(--los-border)] pb-4">
        <MonoLabel className="text-lg text-[var(--los-accent)]">ADD ENTRY</MonoLabel>
        <MonoText className="text-xs text-[var(--los-muted)]">
          Fill in the fields below. Auto-generated fields will be calculated automatically.
        </MonoText>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {inputColumns.map((col) => (
          <div key={col.name} className="flex flex-col gap-2">
            <div className="flex justify-between">
              <MonoLabel>{col.name.toUpperCase()}</MonoLabel>
              {col.unit && (
                <span className="text-[10px] text-[var(--los-muted)] font-mono">[{col.unit}]</span>
              )}
            </div>

            <input
              type={col.type === 'number' ? 'number' : col.type === 'date' ? 'date' : 'text'}
              value={values[col.name] || ''}
              onInput={(e) => handleInputChange(col.name, e.currentTarget.value)}
              className={cn(
                'bg-[var(--los-bg)] border px-3 py-2 text-sm font-mono focus:outline-none focus:border-[var(--los-accent)] transition-colors',
                errors[col.name] ? 'border-red-500' : 'border-[var(--los-border)]',
              )}
              placeholder={`Enter ${col.name}...`}
            />

            {errors[col.name] && (
              <span className="text-[10px] text-red-500 font-mono">{errors[col.name]}</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex justify-end pt-4">
        <button
          type="button"
          onClick={handleSubmit}
          className="bg-[var(--los-accent)] text-black px-6 py-2 font-bold font-mono text-xs hover:opacity-90 transition-opacity flex items-center gap-2"
        >
          SAVE ENTRY <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
};
