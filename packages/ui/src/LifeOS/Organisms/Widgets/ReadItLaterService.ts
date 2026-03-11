import { Logger } from '@lifosy/core';
import { signal } from '@preact/signals';

const logger = new Logger('ReadItLaterService');

export interface OptimisticChange {
  status?: 'read' | 'new';
  deleted?: boolean;
  timestamp: number;
}

export class ReadItLaterService {
  // Map of ItemID -> Optimistic Change
  // We use this to overlay on top of the props-based config
  optimisticChanges = signal<Record<string, OptimisticChange>>({});

  // Helper to apply optimistic change
  applyChange(id: string, change: Partial<OptimisticChange>) {
    const current = this.optimisticChanges.value;
    this.optimisticChanges.value = {
      ...current,
      [id]: {
        ...(current[id] || { timestamp: Date.now() }),
        ...change,
        timestamp: Date.now(),
      },
    };
    logger.debug(`[Optimistic] Applied change for ${id}:`, change);
  }

  markAsRead(id: string) {
    this.applyChange(id, { status: 'read' });
  }

  markAsNew(id: string) {
    this.applyChange(id, { status: 'new' });
  }

  deleteItem(id: string) {
    this.applyChange(id, { deleted: true });
  }

  // Clear optimistic change once we see it reflected in the props (optional for cleanup,
  // but for now relying on timestamp or just keeping it is fine as long as it matches)
  // Ideally we should prune old optimistic changes, but for this session 15min in-memory is fine.
}

export const readItLaterService = new ReadItLaterService();
