import { type Capture, parseCapture } from '@kaihuman/formats/business';

/** The one palette result a business capture line produces. */
export const describeCapture = (c: Capture): string => {
  switch (c.kind) {
    case 'todo':
      return `Add todo for ${c.client}: ${c.text}`;
    case 'log':
      return `Log for ${c.client}: ${c.text}`;
    case 'start-timer':
      return `Start timer for ${c.client}${c.project ? `/${c.project}` : ''}`;
    case 'stop-timer':
      return 'Stop timer (opens form)';
  }
};

/** `null` when the query is not a business capture, or names an unknown or ambiguous client. */
export const businessCaptureFor = (
  query: string,
  clients: readonly string[],
): { capture: Capture; name: string } | null => {
  const capture = parseCapture(query, clients);
  return capture ? { capture, name: describeCapture(capture) } : null;
};
