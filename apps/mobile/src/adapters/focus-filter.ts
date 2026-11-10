import { FOCUS_FILTER_FILE, parseWidgetFilter, type WidgetFilter } from '@kaihuman/core';
import { signal } from '@preact/signals';

/** The active Focus filter, as the Focus filter intent last wrote it to the shared container. */
export const focusFilter = signal<WidgetFilter | undefined>(undefined);

/** Same structural equality for the small filter object, so an unchanged file keeps the signal still. */
const same = (a?: WidgetFilter, b?: WidgetFilter): boolean =>
  JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

export const refreshFocusFilter = async (container: {
  read(name: string): Promise<string | null>;
}): Promise<WidgetFilter | undefined> => {
  const next = parseWidgetFilter(await container.read(FOCUS_FILTER_FILE));
  if (!same(next, focusFilter.peek())) focusFilter.value = next;
  return next;
};
