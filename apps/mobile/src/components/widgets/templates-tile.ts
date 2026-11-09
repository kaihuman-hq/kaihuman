/** Helpers shared by the tags fields on the prompts, commands and action log forms. */

/** `"work, #ops deploy"` -> `['work', 'ops', 'deploy']`; the file format has no `#` or spaces in a tag. */
export const parseTagInput = (text: string): string[] => [
  ...new Set(
    text
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#+/, ''))
      .filter((t) => /^[\w-]+$/.test(t)),
  ),
];
