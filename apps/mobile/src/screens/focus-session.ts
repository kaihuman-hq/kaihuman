import type { KaihumanSharedModule } from '../../modules/kaihuman-shared/index.js';

export const FOCUS_MINUTES = 25;

type FocusNative = Partial<
  Pick<KaihumanSharedModule, 'startFocusActivity' | 'updateFocusActivity' | 'endFocusActivity'>
>;

/** "Start focus" on a todo. One session at a time; hidden where the native module has no support. */
export class FocusSessionController {
  private activityId: string | null = null;

  constructor(private readonly native: FocusNative | null | undefined) {}

  /** False on Android and wherever the native module is not linked, so the UI hides the action. */
  get available(): boolean {
    return typeof this.native?.startFocusActivity === 'function';
  }

  get active(): boolean {
    return this.activityId !== null;
  }

  /** Replaces a running session. Returns false when unsupported or the OS refused the activity. */
  start(todoId: string, todoText: string, minutes = FOCUS_MINUTES): boolean {
    if (!this.native?.startFocusActivity) return false;
    this.end();
    this.activityId = this.native.startFocusActivity(todoId, todoText, minutes);
    return this.activityId !== null;
  }

  extend(plannedEndMs: number): void {
    if (this.activityId) this.native?.updateFocusActivity?.(this.activityId, plannedEndMs);
  }

  end(): void {
    if (this.activityId) this.native?.endFocusActivity?.(this.activityId);
    this.activityId = null;
  }
}
