/**
 * Optimistic update: `apply` changes what the screen shows at once and returns what it replaced,
 * then `write` saves in the background (the outbox pushes it later). A failed save hands the old
 * value to `rollback` and rejects, so the screen never keeps a change that was not stored.
 */
export async function optimisticWrite<T>(steps: {
  apply: () => T;
  write: () => Promise<void>;
  rollback: (previous: T) => void;
}): Promise<void> {
  const previous = steps.apply();
  try {
    await steps.write();
  } catch (err) {
    steps.rollback(previous);
    throw err;
  }
}
