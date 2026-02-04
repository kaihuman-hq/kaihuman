import { h } from 'preact';
import { useState } from 'preact/hooks';
import { DataCollectionData, ColumnDefinition, addColumn, updateColumn, deleteColumn, serializeDataCollection, parseDataCollection } from './DataCollectionLogic';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { cn } from '../../../utils';

interface DataCollectionColumnManagerProps {
  content: string;
  onChange: (newContent: string) => void;
}

const COLUMN_TYPES = [
  'text',
  'number',
  'date',
  'auto:date',
  'auto:date:yesterday',
  'auto:number:sum',
  'auto:number:avg'
] as const;

export const DataCollectionColumnManager = ({ content, onChange }: DataCollectionColumnManagerProps) => {
  // Use local state for data or derive? 
  // We should derive but we need logic functions that take Data object
  // So we parse on render? Or assume parent passes raw content?
  // Let's parse.

  // Actually we need to import it properly.
  // Ideally this component assumes valid data.

  // Ref to logic:
  // parseDataCollection is imported above.

  const data = parseDataCollection(content);
  const [editingName, setEditingName] = useState<string | null>(null); // Name of col being edited
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [formName, setFormName] = useState('');
  const [formType, setFormType] = useState<string>('text');
  const [formUnit, setFormUnit] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormType('text');
    setFormUnit('');
    setEditingName(null);
    setError(null);
  };

  const handleEdit = (col: ColumnDefinition) => {
    setEditingName(col.name);
    setFormName(col.name);
    setFormType(col.type);
    setFormUnit(col.unit || '');
    setError(null);
  };

  const handleSave = () => {
    try {
      if (!formName.trim()) {
        setError("Name is required");
        return;
      }

      const newCol: ColumnDefinition = {
        name: formName.trim(),
        type: formType as any,
        unit: formUnit.trim() || undefined,
        isAuto: formType.startsWith('auto:') || undefined
      };

      let newData: DataCollectionData;
      if (editingName) {
        newData = updateColumn(data, editingName, newCol);
      } else {
        newData = addColumn(data, newCol);
      }

      onChange(serializeDataCollection(newData));
      resetForm();
    } catch (e: any) {
      setError(e.message);
    }
  };

  const handleDelete = (name: string) => {
    if (!confirm(`Delete column "${name}"? This cannot be undone.`)) return;
    try {
      const newData = deleteColumn(data, name);
      onChange(serializeDataCollection(newData));
    } catch (e: any) {
      setError(e.message);
    }
  };

  return (
    <div className="h-full w-full flex flex-col p-8 gap-8 overflow-y-auto">
      {/* Existing Columns List */}
      <div className="space-y-4">
        <MonoHeader className="text-sm border-b border-[var(--los-border)] pb-2 mb-4">
          EXISTING COLUMNS
        </MonoHeader>

        <div className="space-y-2">
          {data.columns.map((col: ColumnDefinition) => (
            <div key={col.name} className="flex items-center justify-between p-3 bg-[var(--los-bg)] border border-[var(--los-border)] rounded hover:bg-white/5 transition-colors">
              <div className="flex flex-col">
                <div className="flex items-center gap-2">
                  <MonoText className="text-[var(--los-fg)] font-bold">{col.name}</MonoText>
                  {col.unit && <MonoText className="text-[var(--los-muted)] text-[10px]">({col.unit})</MonoText>}
                </div>
                <MonoText className="text-[var(--los-muted)] text-[10px] font-mono">{col.type}</MonoText>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => handleEdit(col)}
                  className="px-2 py-1 text-[10px] border border-[var(--los-border)] rounded hover:bg-[var(--los-fg)] hover:text-[var(--los-bg)] transition-colors"
                >
                  EDIT
                </button>
                <button
                  onClick={() => handleDelete(col.name)}
                  className="px-2 py-1 text-[10px] border border-red-900/50 text-red-500 rounded hover:bg-red-900/20 transition-colors"
                >
                  DEL
                </button>
              </div>
            </div>
          ))}
          {data.columns.length === 0 && (
            <div className="p-4 text-center text-[var(--los-muted)] text-xs border border-dashed border-[var(--los-border)]">
              No columns defined. Add one below.
            </div>
          )}
        </div>
      </div>

      {/* Add/Edit Form */}
      <div className="space-y-4 bg-[var(--los-bg)] border border-[var(--los-border)] p-4 rounded relative">
        <MonoHeader className="text-sm mb-4">
          {editingName ? 'EDIT COLUMN' : 'ADD NEW COLUMN'}
        </MonoHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-[10px] text-[var(--los-muted)]">NAME</label>
            <input
              className="w-full bg-black/20 border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)]"
              value={formName}
              onInput={(e) => setFormName(e.currentTarget.value)}
              placeholder="e.g. Price"
            />
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--los-muted)]">TYPE</label>
            <select
              className="w-full bg-black/20 border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)] appearance-none"
              value={formType}
              onChange={(e) => setFormType(e.currentTarget.value)}
            >
              {COLUMN_TYPES.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] text-[var(--los-muted)]">UNIT (OPTIONAL)</label>
            <input
              className="w-full bg-black/20 border border-[var(--los-border)] p-2 text-xs text-[var(--los-fg)] focus:outline-none focus:border-[var(--los-accent)]"
              value={formUnit}
              onInput={(e) => setFormUnit(e.currentTarget.value)}
              placeholder="e.g. kg, €"
            />
          </div>
        </div>

        {error && (
          <div className="text-red-500 text-[10px] mt-2 font-mono">
            ! {error}
          </div>
        )}

        <div className="flex gap-2 mt-4 justify-end">
          {editingName && (
            <button
              onClick={resetForm}
              className="px-4 py-2 text-xs border border-[var(--los-border)] rounded hover:bg-white/5 transition-colors"
            >
              CANCEL
            </button>
          )}
          <button
            onClick={handleSave}
            className="px-4 py-2 text-xs bg-[var(--los-fg)] text-[var(--los-bg)] font-bold rounded hover:opacity-90 transition-opacity"
          >
            {editingName ? 'UPDATE COLUMN' : 'ADD COLUMN'}
          </button>
        </div>
      </div>
    </div>
  );
};
