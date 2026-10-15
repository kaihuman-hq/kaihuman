import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MAX_TABS, proposeGroups, type TidyTab } from './tidy';

let store: Record<string, unknown>;

beforeEach(() => {
  store = {};
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: async (key: string) => (key in store ? { [key]: store[key] } : {}),
        set: async (items: Record<string, unknown>) => {
          store = { ...store, ...items };
        },
      },
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const tab = (id: number, host: string): TidyTab => ({
  id,
  title: `Page ${id}`,
  url: `https://${host}/${id}`,
});

const stubModel = (answer: unknown) => {
  const prompts: { input: unknown; schema?: any }[] = [];
  vi.stubGlobal('LanguageModel', {
    availability: async () => 'available',
    create: async () => ({
      prompt: async (input: unknown, options?: { responseConstraint?: object }) => {
        prompts.push({ input, schema: options?.responseConstraint });
        return JSON.stringify(answer);
      },
      destroy: () => {},
    }),
  });
  return prompts;
};

describe('proposeGroups', () => {
  it('caps input at 40 tabs', async () => {
    const tabs = Array.from({ length: 60 }, (_, i) => tab(i + 1, 'big.example'));
    const prompts = stubModel({ groups: [{ name: 'All', tabIds: [1, 2, 3] }] });
    await proposeGroups(tabs);
    expect(MAX_TABS).toBe(40);
    const lines = String(prompts[0]?.input).split('\n').slice(1);
    expect(lines).toHaveLength(40);
    expect(prompts[0]?.schema.properties.groups.items.properties.tabIds.items.enum).toHaveLength(
      40,
    );
    // Without the model the rule sees the same 40, never the rest.
    vi.unstubAllGlobals();
    vi.stubGlobal('chrome', { storage: { local: { get: async () => ({}), set: async () => {} } } });
    const rule = await proposeGroups(tabs);
    expect(rule[0]?.tabIds).toHaveLength(40);
  });

  it('proposals only reference given tab ids', async () => {
    stubModel({
      groups: [
        { name: 'Docs', tabIds: [1, 2, 99] },
        { name: 'Ghost', tabIds: [98, 99] },
        { name: 'Repeat', tabIds: [2, 3, 4] },
      ],
    });
    const proposals = await proposeGroups([
      tab(1, 'a.dev'),
      tab(2, 'b.dev'),
      tab(3, 'c.dev'),
      tab(4, 'd.dev'),
    ]);
    expect(proposals).toEqual([
      { name: 'Docs', tabIds: [1, 2] },
      { name: 'Repeat', tabIds: [3, 4] },
    ]);
  });

  it('keeps at most 4 proposals', async () => {
    stubModel({
      groups: Array.from({ length: 6 }, (_, i) => ({
        name: `G${i}`,
        tabIds: [i * 2 + 1, i * 2 + 2],
      })),
    });
    const tabs = Array.from({ length: 12 }, (_, i) => tab(i + 1, `h${i}.dev`));
    expect(await proposeGroups(tabs)).toHaveLength(4);
  });

  it('rule groups 3+ tabs per host without the model', async () => {
    const proposals = await proposeGroups([
      tab(1, 'www.github.com'),
      tab(2, 'github.com'),
      tab(3, 'github.com'),
      tab(4, 'news.example'),
      tab(5, 'news.example'),
      tab(6, 'other.example'),
    ]);
    expect(proposals).toEqual([{ name: 'github.com', tabIds: [1, 2, 3] }]);
  });

  it('falls back to the rule when the answer does not validate', async () => {
    stubModel({ groups: [{ name: 'Nothing', tabIds: [77, 78] }] });
    const proposals = await proposeGroups([tab(1, 'a.dev'), tab(2, 'a.dev'), tab(3, 'a.dev')]);
    expect(proposals).toEqual([{ name: 'a.dev', tabIds: [1, 2, 3] }]);
  });

  it('uses only the rule when the tabs setting is off', async () => {
    store.aiSettings = { tabs: false };
    const prompts = stubModel({ groups: [{ name: 'Model', tabIds: [1, 2] }] });
    const proposals = await proposeGroups([tab(1, 'a.dev'), tab(2, 'a.dev'), tab(3, 'a.dev')]);
    expect(prompts).toHaveLength(0);
    expect(proposals[0]?.name).toBe('a.dev');
  });
});
