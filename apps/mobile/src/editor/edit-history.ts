import type { TextEdit } from './markdown-edit.js';

/** Typing within this window folds into one undo step, like a word-at-a-time undo. */
const COALESCE_MS = 800;
const LIMIT = 200;

/** Undo/redo snapshots for one editing session; `record` takes the state *before* a change. */
export class EditHistory {
  private past: TextEdit[] = [];
  private future: TextEdit[] = [];
  private lastAt = Number.NEGATIVE_INFINITY;

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  record(before: TextEdit, now: number, coalesce: boolean): void {
    const folds = coalesce && now - this.lastAt < COALESCE_MS && this.past.length > 0;
    this.lastAt = coalesce ? now : Number.NEGATIVE_INFINITY;
    this.future = [];
    if (folds) return;
    this.past.push(before);
    if (this.past.length > LIMIT) this.past.shift();
  }

  undo(current: TextEdit): TextEdit | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(current);
    this.lastAt = Number.NEGATIVE_INFINITY;
    return prev;
  }

  redo(current: TextEdit): TextEdit | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(current);
    this.lastAt = Number.NEGATIVE_INFINITY;
    return next;
  }

  reset(): void {
    this.past = [];
    this.future = [];
    this.lastAt = Number.NEGATIVE_INFINITY;
  }
}
