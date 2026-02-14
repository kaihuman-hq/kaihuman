import { h } from 'preact';
import { useMemo, useState } from 'preact/hooks';
import { MonoText, MonoHeader } from '../../Atoms/Typography';
import { parseTodos, getVisibleTodos, toggleTodo, serializeTodos, TodoData } from './TodoLogic';
import { cn } from '../../../utils';
import { Check, Circle, Plus } from 'lucide-preact';
import { CompactWidgetLayout, CompactList, CompactHero } from './CompactWidgetLayout';


export interface TodoWidgetProps {
  content: string;
  mode: 'SMALL' | 'FOCUS' | 'MOBILE_EXPANDED';
  className?: string;
  onChange?: (newContent: string) => void;
}

const formatRelTime = (ts?: number) => {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export const TodoWidget = ({ content, mode, className, onChange }: TodoWidgetProps) => {
  const data: TodoData = useMemo(() => parseTodos(content), [content]);

  // In Small mode, hide old completed items.
  const displayData = useMemo(() => {
    if (mode === 'SMALL' || mode === 'MOBILE_EXPANDED') return getVisibleTodos(data);
    return data;
  }, [data, mode]);

  const handleToggle = (groupName: string, todoIndex: number, currentChecked: boolean) => {
    const newData = toggleTodo(data, groupName, todoIndex, !currentChecked);
    const newString = serializeTodos(newData);
    onChange?.(newString);
  };

  const totalGroups = displayData.groups.length;
  const totalTodos = displayData.groups.reduce((acc, g) => acc + g.todos.length, 0);

  if (totalTodos === 0) {
    return (
      <div className={cn("flex flex-col h-full w-full justify-center items-center text-[var(--los-muted)]", className)}>
        <MonoText>No tasks.</MonoText>
      </div>
    );
  }

  if (mode === 'MOBILE_EXPANDED') {
    const topTodos = displayData.groups.flatMap(g => g.todos).filter(t => !t.checked).slice(0, 5);
    return (
      <CompactWidgetLayout>
        <div className="flex justify-between items-center shrink-0">
          <MonoHeader className="text-xs text-[var(--los-muted)]">TOP PRIORITIES</MonoHeader>
          <MonoText className="text-[10px] text-[var(--los-accent)]">{topTodos.length} DUE</MonoText>
        </div>

        <CompactList>
          {topTodos.length === 0 ? (
            <div className="flex items-center justify-center h-full text-[var(--los-muted)]">No active tasks</div>
          ) : (
            <div className="flex flex-col gap-2">
              {topTodos.map((todo, idx) => (
                <div
                  key={todo.id}
                  className="group flex items-start gap-3 py-3 border-b border-[var(--los-border)] last:border-0 hover:bg-white/5 transition-colors px-1 cursor-pointer"
                  onClick={(e) => {
                    e.stopPropagation();
                    // Find group name for this todo
                    const group = displayData.groups.find(g => g.todos.includes(todo));
                    if (group) {
                      // Find index within group
                      const tIdx = group.todos.indexOf(todo);
                      handleToggle(group.name, tIdx, todo.checked);
                    }
                  }}
                >
                  <div className="mt-0.5 shrink-0 text-[var(--los-muted)] group-hover:text-[var(--los-fg)]">
                    <Circle size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <MonoText className="text-sm">{todo.text}</MonoText>
                    <MonoText className="text-[10px] text-[var(--los-muted)] mt-0.5">
                      {formatRelTime(todo.updatedAt)}
                    </MonoText>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CompactList>
      </CompactWidgetLayout>
    )
  }

  return (
    <div className={cn("flex flex-col w-full", mode === 'SMALL' ? "h-full" : "min-h-full", className)}>
      {/* HEADER */}
      <div className="flex justify-between items-center mb-4 shrink-0">
        <MonoHeader className="text-lg">TASKS</MonoHeader>
        <MonoText className="text-[10px] text-[var(--los-muted)]">
          {totalTodos} ITEMS
        </MonoText>
      </div>

      {/* LIST */}
      <div className={cn("flex-1 min-h-0 border-t border-[var(--los-border)]", mode === 'SMALL' ? "overflow-y-auto" : "overflow-visible")}>
        {displayData.groups.map((group, gIdx) => (
          <div key={group.name} className="mb-4 last:mb-0">
            <div className="sticky top-0 bg-[var(--los-bg)] py-2 border-b border-[var(--los-border)]/50 z-10 px-1">
              <MonoText className="text-xs text-[var(--los-accent)] font-bold">{group.name.toUpperCase()}</MonoText>
            </div>
            <div>
              {group.todos.map((todo, tIdx) => (
                <div
                  key={todo.id}
                  className="group flex items-start gap-3 py-2 border-b border-[var(--los-border)] last:border-0 hover:bg-white/5 transition-colors px-1 cursor-pointer"
                  onClick={(e) => { e.stopPropagation(); handleToggle(group.name, tIdx, todo.checked); }}
                >
                  <div className={cn(
                    "mt-0.5 shrink-0 transition-colors",
                    todo.checked ? "text-[var(--los-accent)]" : "text-[var(--los-muted)] group-hover:text-[var(--los-fg)]"
                  )}>
                    {todo.checked ? <Check size={14} /> : <Circle size={14} />}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start">
                      <MonoText className={cn(
                        "text-xs break-words mr-2 transition-opacity",
                        todo.checked ? "opacity-50 line-through" : "opacity-100"
                      )}>
                        {todo.text}
                      </MonoText>

                      {todo.updatedAt && (
                        <MonoText className="text-[9px] text-[var(--los-muted)] shrink-0 mt-0.5">
                          {formatRelTime(todo.updatedAt)}
                        </MonoText>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}

        {/* Helper text for hidden items */}
        {mode === 'SMALL' && (
          // Simple check if we hid anything
          (() => {
            const fullCount = data.groups.reduce((acc, g) => acc + g.todos.length, 0);
            const hiddenCount = fullCount - totalTodos;
            if (hiddenCount > 0) {
              return (
                <div className="text-center pt-2 pb-2">
                  <MonoText className="text-[10px] text-[var(--los-muted)]">
                    + {hiddenCount} completed older than 1h
                  </MonoText>
                </div>
              )
            }
            return null;
          })()
        )}
      </div>

    </div>
  );
};
