/** The palette's "Summarize this page" and "Ask this page…" actions, built apart from the page script. */
import { knowledgeNote, type ModeItem, type PaletteAction } from '@kaihuman/palette';

interface Deps {
  send: (message: any) => Promise<any>;
  copy: (text: string) => Promise<void>;
  article: () => { title: string; url: string; text: string };
}

/** What the palette lists once the model has answered: each line copies, and the lot can be saved. */
function resultActions(
  { send, copy }: Deps,
  idPrefix: string,
  lines: string[],
  note: string,
): PaletteAction[] {
  return [
    ...lines.map((line, index) => ({
      id: `${idPrefix}:${index}`,
      title: line,
      recent: false as const,
      run: async () => {
        await copy(line);
        return 'Copied';
      },
    })),
    {
      id: `${idPrefix}:save`,
      title: 'Save to knowledge base',
      recent: false as const,
      run: async () => {
        // The user's own click: the only place a result is written to the repo.
        const { path, content } = knowledgeNote(note, new Date());
        await send({ type: 'CAPTURE_KNOWLEDGE', path, content });
        return 'Saved to the knowledge base';
      },
    },
  ];
}

const sourceLine = (title: string, url: string) => `Source: ${title} (${url})`;

export function summarizePageAction(deps: Deps): PaletteAction {
  return {
    id: 'summarize-page',
    title: 'Summarize this page',
    subtitle: 'On-device key points, each one copyable',
    recent: false,
    children: async () => {
      const article = deps.article();
      const { lines } = (await deps.send({ type: 'PAGE_SUMMARIZE', ...article })) as {
        lines: string[];
      };
      const note = [
        `Summary of ${article.title || article.url}`,
        lines.map((line) => `- ${line}`).join('\n'),
        sourceLine(article.title, article.url),
      ].join('\n\n');
      return resultActions(deps, 'summarize-page', lines, note);
    },
  };
}

export function askPageAction(deps: Deps): PaletteAction {
  return {
    id: 'ask-page',
    title: 'Ask this page…',
    subtitle: 'Answers from the page text, on-device',
    recent: false,
    prompts: [{ label: 'Question' }],
    // A prompt cannot lead straight to `children`, and `choices` is synchronous: the one choice
    // is an action whose submenu asks the worker when it is picked.
    choices: ([question = '']: string[]): ModeItem[] => [
      {
        id: 'ask-page:answer',
        title: `Answer “${question}”`,
        subtitle: '⏎ asks the on-device model',
        action: {
          id: 'ask-page:answer',
          title: question,
          recent: false,
          children: async () => {
            const article = deps.article();
            const { answer } = (await deps.send({ type: 'PAGE_ASK', ...article, question })) as {
              answer: string;
            };
            const note = [
              `Question about ${article.title || article.url}: ${question}`,
              answer,
              sourceLine(article.title, article.url),
            ].join('\n\n');
            return resultActions(deps, 'ask-page', [answer], note);
          },
        },
      },
    ],
  };
}
