import { PENDING_WIDGET_MUTATIONS_FILE, type SharedContainer } from '../adapters/widget-bridge.js';
import { handleUrl } from '../runtime/pending-url.js';
import { type ScheduleRequest, type SnoozeSource, snoozeRequest } from './scheduler.js';

/** expo-notifications' `DEFAULT_ACTION_IDENTIFIER`, inlined to keep this module native-free. */
export const DEFAULT_ACTION = 'expo.modules.notifications.actions.DEFAULT';

export interface ResponseDeps {
  container: SharedContainer;
  bridge: { reconcile(): Promise<number> };
  navigate: (href: string) => void;
  schedule: (request: ScheduleRequest) => Promise<unknown>;
  reschedule: () => Promise<void>;
  now: () => number;
}

async function queueToggle(container: SharedContainer, itemId: string, timestamp: number) {
  let queue: unknown[] = [];
  try {
    const parsed: unknown = JSON.parse(
      (await container.read(PENDING_WIDGET_MUTATIONS_FILE)) ?? '[]',
    );
    if (Array.isArray(parsed)) queue = parsed;
  } catch {
    // A corrupt queue is replaced rather than blocking the action.
  }
  queue.push({ kind: 'toggle', itemId, timestamp });
  await container.write(PENDING_WIDGET_MUTATIONS_FILE, JSON.stringify(queue));
}

/** Maps a notification tap or action button to its effect. */
export async function handleResponse(
  actionId: string,
  content: SnoozeSource,
  deps: ResponseDeps,
): Promise<void> {
  const data = content.data ?? {};
  const todoId = typeof data.todoId === 'string' && data.todoId ? data.todoId : undefined;
  if (actionId === 'done' && todoId) {
    await queueToggle(deps.container, todoId, deps.now());
    await deps.bridge.reconcile();
    await deps.reschedule();
  } else if (actionId === 'snooze' && todoId) {
    await deps.schedule(snoozeRequest(content, todoId, deps.now()));
  } else if (actionId === DEFAULT_ACTION && typeof data.url === 'string') {
    handleUrl(data.url, deps.navigate);
  }
}
