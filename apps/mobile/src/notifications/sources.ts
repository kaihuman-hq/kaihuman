import type { WidgetTodoSnapshot } from '@kaihuman/core';
import type { PlannerMilestone, PlannerTodo } from './planner.js';

/**
 * The todo format has no per-item due date or time, so a todo is due when its milestone is
 * (`milestoneDueDate`) and `dueTime` is never set. Snapshot items are open todos only.
 */
export function todosFromSnapshot(snapshot: Pick<WidgetTodoSnapshot, 'items' | 'milestones'>): {
  todos: PlannerTodo[];
  milestones: PlannerMilestone[];
} {
  return {
    todos: snapshot.items.map((i) => ({
      id: i.id,
      text: i.text,
      status: i.status,
      dueDate: i.milestoneDueDate,
    })),
    milestones: snapshot.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      dueDate: m.dueDate,
      open: m.open,
    })),
  };
}
