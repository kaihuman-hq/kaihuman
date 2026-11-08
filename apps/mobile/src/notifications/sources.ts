import type { WidgetTodoSnapshot } from '@kaihuman/core';
import type { PlannerMilestone, PlannerTodo } from './planner.js';

/**
 * A todo's own due date wins; its milestone's date is the fallback. The time only comes with the
 * item's own date, since a milestone has none. Snapshot items are open todos only.
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
      dueDate: i.dueDate ?? i.milestoneDueDate,
      dueTime: i.dueDate ? i.dueTime : undefined,
    })),
    milestones: snapshot.milestones.map((m) => ({
      id: m.id,
      name: m.name,
      dueDate: m.dueDate,
      open: m.open,
    })),
  };
}
