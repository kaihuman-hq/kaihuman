import * as BackgroundTask from 'expo-background-task';
import * as TaskManager from 'expo-task-manager';
import { bootstrap, bootstrapReady } from '../runtime/bootstrap.js';
import { lastRunFailed, refreshAll } from './runtime.js';

export const BACKGROUND_SYNC_TASK = 'kaihuman-background-sync';

// defineTask must run at module scope: the OS may launch the app headless to run the task
// before any component has mounted.
TaskManager.defineTask(BACKGROUND_SYNC_TASK, async () => {
  try {
    bootstrap(); // persistent storage, token hydration and the widget bridge, idempotent
    await bootstrapReady();
    await refreshAll({ reason: 'background' });
    return lastRunFailed()
      ? BackgroundTask.BackgroundTaskResult.Failed
      : BackgroundTask.BackgroundTaskResult.Success;
  } catch {
    return BackgroundTask.BackgroundTaskResult.Failed;
  }
});

/** The OS decides the actual cadence; 15 minutes is the minimum it accepts. */
export async function registerBackgroundSync(): Promise<void> {
  try {
    const status = await BackgroundTask.getStatusAsync();
    if (status !== BackgroundTask.BackgroundTaskStatus.Available) return;
    await BackgroundTask.registerTaskAsync(BACKGROUND_SYNC_TASK, { minimumInterval: 15 });
  } catch {
    // Unsupported (simulator, web, Expo Go): foreground sync still works.
  }
}
