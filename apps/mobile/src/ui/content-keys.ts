/**
 * Keys that follow a row's content rather than its index, so removing a middle row animates that
 * row out instead of the last one. Duplicates get an occurrence suffix. Create one per render.
 */
export function contentKeys() {
  const seen = new Map<string, number>();
  return (content: string): string => {
    const n = seen.get(content) ?? 0;
    seen.set(content, n + 1);
    return `${content}#${n}`;
  };
}
