import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkContext } from './context';

const promptJson = vi.fn(async (_task: unknown) => null);
vi.mock('./model.js', () => ({ promptJson: (task: unknown) => promptJson(task) }));

const { rerank } = await import('./rank');

const ctx: WorkContext = {
  streams: [],
  todos: [],
  todoTags: [],
  eventsToday: [],
  waiting: [],
  redCi: [],
  openIdeas: [],
};
const items = [{ id: 'a', text: 'Alpha' }];

beforeEach(() => promptJson.mockClear());

describe('rerank options', () => {
  it('runs at background priority with no deadline by default', async () => {
    await rerank('rank', items, ctx);
    expect(promptJson.mock.calls[0]?.[0]).toMatchObject({
      priority: 'background',
      timeoutMs: undefined,
    });
  });

  it('takes a priority and a deadline from a palette submit', async () => {
    await rerank('rank', items, ctx, { priority: 'interactive', timeoutMs: 8000 });
    expect(promptJson.mock.calls[0]?.[0]).toMatchObject({
      priority: 'interactive',
      timeoutMs: 8000,
    });
  });
});
