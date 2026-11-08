type Reschedule = () => Promise<void> | void;

let current: Reschedule = () => undefined;

/**
 * Hook point for the notifications module: it is wired by calling
 * `setRescheduleNotifications(rescheduleNotifications)` during runtime setup, so sync does not
 * import notifications (and tests of sync stay free of native modules). Default: no-op.
 */
export function setRescheduleNotifications(fn: Reschedule): void {
  current = fn;
}

/** Called after each sync run, because new data can change which reminders are due. */
export async function rescheduleNotifications(): Promise<void> {
  await current();
}
