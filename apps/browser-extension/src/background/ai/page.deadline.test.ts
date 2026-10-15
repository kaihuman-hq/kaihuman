import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const promptJson = vi.fn(async (_task: unknown) => 'ok');
const detectLanguage = vi.fn(async (..._args: unknown[]) => 'en');
vi.mock('./model.js', () => ({
  promptJson: (task: unknown) => promptJson(task),
  detectLanguage: (...args: unknown[]) => detectLanguage(...args),
  summarize: vi.fn(),
}));

const { askPage } = await import('./page');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  promptJson.mockClear();
});
afterEach(() => vi.useRealTimers());

describe('askPage deadline', () => {
  it('gives the prompt only the time language detection left', async () => {
    detectLanguage.mockImplementationOnce(async () => {
      vi.setSystemTime(12_000);
      return 'en';
    });
    await askPage('text', 'Q?');
    expect(promptJson.mock.calls[0]?.[0]).toMatchObject({ timeoutMs: 18_000 });
  });

  it('is null when detection used it all', async () => {
    detectLanguage.mockImplementationOnce(async () => {
      vi.setSystemTime(30_000);
      return 'en';
    });
    expect(await askPage('text', 'Q?')).toBeNull();
    expect(promptJson).not.toHaveBeenCalled();
  });
});
