import type { KaihumanSharedModule } from '../../modules/kaihuman-shared/index.js';

export const FOCUS_MINUTES = 25;

type FocusNative = Partial<
  Pick<
    KaihumanSharedModule,
    | 'startFocusActivity'
    | 'updateFocusActivity'
    | 'endFocusActivity'
    | 'requestNotificationPermission'
  >
>;

/** Shown in-app when the user declines: Android 13+ hides the ongoing notification without it. */
export const NOTIFICATIONS_DENIED_MESSAGE =
  'Allow notifications to see the focus timer. You can turn them on in Settings > Apps > kaihuman > Notifications.';

export type FocusStartResult =
  | { started: true }
  | { started: false; reason: 'unsupported' | 'refused' | 'notifications-denied' };

/** "Start focus" on a todo. One session at a time; hidden where the native module has no support. */
export class FocusSessionController {
  private activityId: string | null = null;

  constructor(private readonly native: FocusNative | null | undefined) {}

  /** False wherever the native module is not linked, so the UI hides the action. */
  get available(): boolean {
    return typeof this.native?.startFocusActivity === 'function';
  }

  get active(): boolean {
    return this.activityId !== null;
  }

  /**
   * Replaces a running session. Asks for notification permission first where the native module
   * needs it (Android 13+; the system dialog only appears once, so denial is reported, not retried).
   */
  async start(
    todoId: string,
    todoText: string,
    minutes = FOCUS_MINUTES,
  ): Promise<FocusStartResult> {
    if (!this.native?.startFocusActivity) return { started: false, reason: 'unsupported' };
    if (this.native.requestNotificationPermission) {
      const granted = await this.native.requestNotificationPermission();
      if (!granted) return { started: false, reason: 'notifications-denied' };
    }
    this.end();
    this.activityId = this.native.startFocusActivity(todoId, todoText, minutes);
    return this.activityId !== null ? { started: true } : { started: false, reason: 'refused' };
  }

  extend(plannedEndMs: number): void {
    if (this.activityId) this.native?.updateFocusActivity?.(this.activityId, plannedEndMs);
  }

  end(): void {
    if (this.activityId) this.native?.endFocusActivity?.(this.activityId);
    this.activityId = null;
  }
}
