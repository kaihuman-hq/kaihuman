/**
 * The prompts a `.prompts.md` file holds, read the way the console's Prompts widget writes them.
 *
 * The file is the contract between the apps — see doc/prompts-format.md and
 * packages/ui/src/LifeOS/Organisms/Widgets/PromptsLogic.ts. The palette only reads, so only the
 * reading half lives here.
 */
export interface Prompt {
  title: string;
  tags: string[];
  body: string;
}

/** A body line opening with `## ` is stored with a backslash in front, which reading removes. */
const unescapeBodyLine = (line: string) => line.replace(/^\\(\\*## )/, '$1');

const trimBlankEdges = (lines: string[]) => {
  let start = 0;
  let end = lines.length;
  while (start < end && !lines[start]?.trim()) start++;
  while (end > start && !lines[end - 1]?.trim()) end--;
  return lines.slice(start, end);
};

/** One prompt per `## ` heading; `#tags` on the heading are split off the title. */
export function parsePrompts(content: string): Prompt[] {
  const prompts: Prompt[] = [];
  let current: { heading: string; body: string[] } | null = null;

  const flush = () => {
    if (!current) return;
    const tags: string[] = [];
    const title = current.heading
      .replace(/#([\w-]+)/g, (_, tag: string) => {
        tags.push(tag);
        return '';
      })
      .trim();
    prompts.push({ title, tags, body: trimBlankEdges(current.body).join('\n') });
  };

  for (const raw of content.split('\n')) {
    const line = raw.replace(/\r$/, '');
    if (line.startsWith('## ')) {
      flush();
      current = { heading: line.slice(3), body: [] };
    } else {
      current?.body.push(unescapeBodyLine(line));
    }
  }
  flush();
  return prompts;
}
