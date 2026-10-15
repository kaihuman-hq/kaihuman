import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Listener = (msg: any, sender: any, sendResponse: (r: any) => void) => unknown;
let listener: Listener;
let connectListener: (() => void) | undefined;
let storedExtras: Record<string, unknown> = {};

const file = {
  content: btoa(
    JSON.stringify({
      groups: [{ id: 'g1', name: 'Work', createdAt: '2026-09-01T00:00:00.000Z', tabs: [] }],
      updatedAt: '2026-09-01T00:00:00.000Z',
    }),
  ),
  sha: 'abc',
};

beforeEach(async () => {
  vi.resetModules();
  storedExtras = {};
  vi.stubGlobal('chrome', {
    alarms: {
      create: vi.fn(),
      get: vi.fn(async () => undefined),
      onAlarm: { addListener: vi.fn() },
    },
    commands: { onCommand: { addListener: vi.fn() } },
    contextMenus: { create: vi.fn(), onClicked: { addListener: vi.fn() } },
    runtime: {
      onInstalled: { addListener: vi.fn() },
      // No desktop palette host in tests.
      sendNativeMessage: vi.fn(async () => {
        throw new Error('Specified native messaging host not found.');
      }),
      onConnect: {
        addListener: (l: () => void) => {
          connectListener = l;
        },
      },
      onMessage: {
        addListener: (l: Listener) => {
          listener = l;
        },
      },
    },
    storage: {
      // The worker reads storage both ways: with a callback, and as a promise.
      local: {
        get: (_k: any, cb?: any) => {
          const data = { lifeos_token: 't', lifeos_repo: 'o/r', ...storedExtras };
          return cb ? cb(data) : Promise.resolve(data);
        },
        set: vi.fn(async () => {}),
        remove: vi.fn(async () => {}),
      },
      session: { get: async () => ({}), set: async () => {} },
      onChanged: { addListener: vi.fn() },
    },
    tabs: { query: async () => [], create: vi.fn(), update: vi.fn() },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: true, status: 200, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => file },
    ),
  );
  await import('./service-worker');
});

const call = (msg: any) =>
  new Promise<any>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('PORT CLOSED: sendResponse never called')),
      2000,
    );
    const kept = listener(msg, {}, (r) => {
      clearTimeout(timer);
      resolve(r);
    });
    if (kept !== true) {
      clearTimeout(timer);
      reject(new Error(`listener returned ${kept}, port closes immediately`));
    }
  });

describe('service worker keep-alive', () => {
  it('accepts popup connections, which is what keeps MV3 from collecting the worker mid-request', () => {
    expect(connectListener).toBeTypeOf('function');
  });
});

describe('error paths still respond', () => {
  it('responds when the GitHub read fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 500, statusText: 'Server Error' })),
    );
    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'X' }),
    ).resolves.toMatchObject({ error: expect.stringContaining('Failed to read') });
  });

  it('responds when fetch rejects outright', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );
    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'X' }),
    ).resolves.toMatchObject({ error: 'network down' });
  });

  it('responds when the name is empty', async () => {
    await expect(
      call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: '  ' }),
    ).resolves.toMatchObject({ error: 'Give the tab group a name' });
  });
});

describe('pinned tab group messages', () => {
  it('responds to LIST', async () => {
    expect(await call({ type: 'LIST_PINNED_TAB_GROUPS' })).toMatchObject({ success: true });
  });
  it('responds to RENAME', async () => {
    expect(
      await call({ type: 'RENAME_PINNED_TAB_GROUP', groupId: 'g1', name: 'Home' }),
    ).toMatchObject({ success: true, name: 'Home' });
  });
  it('responds to DELETE', async () => {
    expect(await call({ type: 'DELETE_PINNED_TAB_GROUP', groupId: 'g1' })).toMatchObject({
      success: true,
    });
  });
  it('responds to SAVE', async () => {
    expect(await call({ type: 'SAVE_PINNED_TAB_GROUP', name: 'New' })).toMatchObject({
      success: true,
    });
  });
});

describe('knowledge base captures', () => {
  const puts = () =>
    (fetch as any).mock.calls
      .filter(([, init]: any[]) => init?.method === 'PUT')
      .map(([url, init]: any[]) => ({
        path: String(url).split('/contents/')[1],
        body: new TextDecoder().decode(
          Uint8Array.from(atob(JSON.parse(init.body).content), (c) => c.charCodeAt(0)),
        ),
      }));

  it('saves a selection as its own raw note instead of the legacy clippings file', async () => {
    (fetch as any).mockImplementation(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: true, status: 201, json: async () => ({}) }
        : { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) },
    );
    const res = await call({
      type: 'SAVE_SELECTION',
      text: 'a quote',
      url: 'https://e.com/p',
      title: 'Page',
    });
    expect(res).toEqual({ success: true });
    const [put] = puts();
    expect(put.path).toMatch(/^\.kh\/raw\/\d+-page\.md$/);
    expect(put.body).toContain('processed: false');
    expect(put.body).toContain('tags: ["clipping"]');
    expect(put.body).toContain('> a quote');
  });

  it('pins an article with its images stored under .kh/assets', async () => {
    (fetch as any).mockImplementation(async (url: string, init?: any) => {
      if (url === 'https://e.com/i.png') {
        return {
          ok: true,
          headers: new Headers({ 'content-type': 'image/png' }),
          arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
        };
      }
      return init?.method === 'PUT'
        ? { ok: true, status: 201, json: async () => ({}) }
        : { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) };
    });
    const res = await call({
      type: 'PIN_ARTICLE',
      title: 'Post',
      url: 'https://e.com/post',
      text: '# Post\n\n![x](https://e.com/i.png)',
      images: ['https://e.com/i.png'],
    });
    expect(res).toEqual({ success: true });
    const [asset, note] = puts();
    expect(asset.path).toMatch(/^\.kh\/assets\/\d+-post\/1\.png$/);
    expect(note.path).toMatch(/^\.kh\/raw\/\d+-post\.md$/);
    expect(note.body).toContain(`![x](/${asset.path})`);
  });

  it('keeps remote image links when image downloads are turned off', async () => {
    storedExtras = { kb_download_images: false };
    (fetch as any).mockImplementation(async (_url: string, init?: any) =>
      init?.method === 'PUT'
        ? { ok: true, status: 201, json: async () => ({}) }
        : { ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) },
    );
    const res = await call({
      type: 'PIN_ARTICLE',
      title: 'Post',
      url: 'https://e.com/post',
      text: '![x](https://e.com/i.png)',
      images: ['https://e.com/i.png'],
    });
    expect(res).toEqual({ success: true });
    const written = puts();
    expect(written).toHaveLength(1);
    expect(written[0].body).toContain('![x](https://e.com/i.png)');
    expect((fetch as any).mock.calls.some(([u]: any[]) => u === 'https://e.com/i.png')).toBe(false);
  });
  it('creates the palette’s capture and answers with its console link', async () => {
    const path = '.kh/raw/1-a-thought.md';
    const res = await call({ type: 'CAPTURE_KNOWLEDGE', path, content: '---\n---\n\nA thought\n' });
    expect(res).toEqual({
      success: true,
      url: 'https://app.kaihuman.com/files/.kh/raw/1-a-thought.md?repo=o%2Fr',
    });
    const put = (fetch as any).mock.calls.find(([, init]: any[]) => init?.method === 'PUT');
    expect(String(put[0])).toBe(`https://api.github.com/repos/o/r/contents/${path}`);
    // No sha: GitHub refuses to overwrite a file that is already there.
    expect(JSON.parse(put[1].body).sha).toBeUndefined();
    expect(puts()[0].body).toContain('A thought');
  });

  it('refuses a capture outside the inbox', async () => {
    expect(await call({ type: 'CAPTURE_KNOWLEDGE', path: 'README.md', content: 'x' })).toEqual({
      error: 'Refusing to write README.md',
    });
    expect(puts()).toEqual([]);
  });
});

describe('palette mode messages', () => {
  it('asks for a DeepL key before translating anything', async () => {
    expect(await call({ type: 'TRANSLATE', text: 'Hallo', targets: ['EN-US'] })).toEqual({
      error: 'No DeepL API key yet — run “Set the DeepL API key…” first',
    });
  });

  it('translates with the stored key', async () => {
    storedExtras = { deepl_key: 'k:fx' };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ translations: [{ text: 'Hello', detected_source_language: 'DE' }] }),
      })),
    );
    expect(await call({ type: 'TRANSLATE', text: 'Hallo', targets: ['EN-US'] })).toEqual({
      success: true,
      translations: [{ target: 'EN-US', text: 'Hello', detectedSource: 'DE' }],
    });
  });

  it('stores the key, and forgets it when given none', async () => {
    await call({ type: 'SET_TRANSLATION_KEY', key: ' k:fx ' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ deepl_key: 'k:fx' });
    await call({ type: 'SET_TRANSLATION_KEY', key: '' });
    expect(chrome.storage.local.remove).toHaveBeenCalledWith('deepl_key');
  });

  it('keeps the translation history newest first, once each', async () => {
    storedExtras = { translationHistory: ['a', 'b'] };
    expect(await call({ type: 'GET_TRANSLATION_HISTORY' })).toEqual({
      success: true,
      texts: ['a', 'b'],
    });
    expect(await call({ type: 'ADD_TRANSLATION_HISTORY', text: 'b' })).toEqual({
      success: true,
      texts: ['b', 'a'],
    });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ translationHistory: ['b', 'a'] });
  });

  it('starts with an empty translation history', async () => {
    expect(await call({ type: 'GET_TRANSLATION_HISTORY' })).toEqual({ success: true, texts: [] });
  });

  it('answers command files from their own cache', async () => {
    storedExtras = {
      promptsCache: {
        repo: 'o/r',
        files: [{ path: 'a.prompts.md', content: '## A' }],
        fetchedAt: Date.now(),
      },
      commandsCache: {
        repo: 'o/r',
        files: [{ path: 'ops.commands.md', content: '## Up\nuptime' }],
        fetchedAt: Date.now(),
      },
    };
    expect(await call({ type: 'LIST_COMMAND_FILES' })).toEqual({
      success: true,
      files: [{ path: 'ops.commands.md', content: '## Up\nuptime' }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('answers prompt files from a cache for the same repository', async () => {
    storedExtras = {
      promptsCache: {
        repo: 'o/r',
        files: [{ path: 'a.prompts.md', content: '## A' }],
        fetchedAt: Date.now(),
      },
    };
    expect(await call({ type: 'LIST_PROMPT_FILES' })).toEqual({
      success: true,
      files: [{ path: 'a.prompts.md', content: '## A' }],
    });
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('AUTH_TOKEN_UPDATE', () => {
  const update = { type: 'AUTH_TOKEN_UPDATE', token: 'planted', repo: 'attacker/repo', repos: [] };

  it('stores a token handed over by the console', () => {
    listener(update, { url: 'https://app.kaihuman.com/' }, () => {});
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ lifeos_token: 'planted', lifeos_repo: 'attacker/repo' }),
    );
  });

  it('ignores a token sent from any other site, which would otherwise swap in its own account', () => {
    listener(update, { url: 'https://evil.example/' }, () => {});
    listener(update, {}, () => {});
    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(chrome.storage.local.remove).not.toHaveBeenCalled();
  });
});

describe('without a repository', () => {
  beforeEach(() => {
    storedExtras = { lifeos_repo: undefined };
  });

  it('writes nowhere rather than falling back to a built-in repository', async () => {
    await expect(call({ type: 'DUMP_NOTE', note: 'x' })).resolves.toMatchObject({
      error: 'No token found',
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it('reports no repository to the popup', async () => {
    await expect(call({ type: 'GET_REPOS' })).resolves.toMatchObject({ repo: '' });
  });
});

describe('page summarize and ask', () => {
  afterEach(() => vi.stubGlobal('Summarizer', undefined));

  const unavailable = { error: 'The on-device model is not available.' };

  it('answer "The on-device model is not available." without the model', async () => {
    expect(await call({ type: 'PAGE_SUMMARIZE', title: 't', url: 'u', text: 'x' })).toEqual(
      unavailable,
    );
    expect(
      await call({ type: 'PAGE_ASK', title: 't', url: 'u', text: 'x', question: 'q' }),
    ).toEqual(unavailable);
  });

  it('does not use the model when the palette switch is off', async () => {
    storedExtras = { aiSettings: { palette: false } };
    const availability = vi.fn(async () => 'available');
    vi.stubGlobal('Summarizer', { availability });
    expect(await call({ type: 'PAGE_SUMMARIZE', title: 't', url: 'u', text: 'x' })).toEqual(
      unavailable,
    );
    expect(availability).not.toHaveBeenCalled();
  });

  it('answers a summary as lines', async () => {
    vi.stubGlobal('Summarizer', {
      availability: async () => 'available',
      create: async () => ({ summarize: async () => '- One\n- Two', destroy: () => {} }),
    });
    expect(await call({ type: 'PAGE_SUMMARIZE', title: 't', url: 'u', text: 'x' })).toEqual({
      success: true,
      lines: ['One', 'Two'],
    });
  });
});
