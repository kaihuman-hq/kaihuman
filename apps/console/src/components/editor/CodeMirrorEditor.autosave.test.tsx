import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const editor = vi.hoisted(() => ({ emit: (_value: string) => {}, applied: [] as string[] }));
const store = vi.hoisted(() => ({
  saveFile: vi.fn(async (_path: string) => {}),
  // Stands in for the store's dirty set: edits add to it, a successful save removes from it.
  setDirty: (_path: string, _dirty: boolean) => {},
}));
vi.mock('@cascivo/editor', async () => {
  const { forwardRef, useImperativeHandle } = await import('preact/compat');
  return {
    CodeEditor: forwardRef(
      (
        {
          defaultValue,
          onValueChange,
        }: { defaultValue?: string; onValueChange?: (value: string) => void },
        ref,
      ) => {
        editor.emit = (value) => onValueChange?.(value);
        // A store sync replaces the document through applyEdit, which echoes as a change.
        useImperativeHandle(ref, () => ({
          applyEdit: (_range: unknown, next: string) => {
            editor.applied.push(next);
            onValueChange?.(next);
          },
        }));
        return <textarea value={defaultValue} />;
      },
    ),
  };
});
vi.mock('@kaihuman/core', async () => {
  const { signal } = await import('@preact/signals');
  const dirtyFiles = signal(new Set<string>());
  store.setDirty = (path, dirty) => {
    const next = new Set(dirtyFiles.peek());
    if (dirty) next.add(path);
    else next.delete(path);
    dirtyFiles.value = next;
  };
  return {
    Logger: class {
      debug() {}
      error() {}
    },
    githubFileStore: {
      activeFile: signal(null),
      openFiles: signal({}),
      dirtyFiles,
      updateFileContent: vi.fn((path: string) => store.setDirty(path, true)),
      saveFile: store.saveFile,
      flushPendingWrites: vi.fn(async () => {}),
    },
  };
});

const { CodeMirrorEditor, AUTOSAVE_DEBOUNCE_MS } = await import('./CodeMirrorEditor');
const { githubFileStore } = await import('@kaihuman/core');
const setOpenFiles = (files: Record<string, string>) => {
  githubFileStore.openFiles.value = Object.fromEntries(
    Object.entries(files).map(([path, content]) => [path, { content, sha: 's' }]),
  );
};

let host: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  store.saveFile.mockReset();
  store.saveFile.mockImplementation(async (path: string) => store.setDirty(path, false));
  githubFileStore.dirtyFiles.value = new Set();
  githubFileStore.openFiles.value = {};
  editor.applied.length = 0;
  host = document.createElement('div');
  document.body.appendChild(host);
  act(() => render(<CodeMirrorEditor path="a.md" />, host));
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
  vi.useRealTimers();
});

const setVisibility = (state: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: state, configurable: true });
};

describe('CodeMirrorEditor debounced autosave', () => {
  it('saves once, only after the debounce delay', () => {
    act(() => editor.emit('a'));
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 1);
    });
    expect(store.saveFile).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
    expect(store.saveFile).toHaveBeenCalledWith('a.md');
  });

  it('debounces rapid edits into one save', () => {
    for (const v of ['a', 'ab', 'abc']) {
      act(() => editor.emit(v));
      act(() => {
        vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS - 500);
      });
    }
    expect(store.saveFile).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
  });

  it('flushes immediately when the page becomes hidden', () => {
    act(() => editor.emit('a'));
    setVisibility('hidden');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
    setVisibility('visible');
  });

  it('does not flush on visibilitychange to visible', () => {
    act(() => editor.emit('a'));
    setVisibility('visible');
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(store.saveFile).not.toHaveBeenCalled();
  });

  it('flushes immediately on pagehide', () => {
    act(() => editor.emit('a'));
    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
  });

  it('flushes unsaved changes on unmount', () => {
    act(() => editor.emit('a'));
    act(() => render(null, host));
    expect(store.saveFile).toHaveBeenCalledTimes(1);
  });
});

describe('CodeMirrorEditor dirty state follows the store', () => {
  it('stays dirty after a save the store could not complete, so pagehide retries it', async () => {
    store.saveFile.mockImplementationOnce(async () => {}); // fails: the store keeps it dirty
    act(() => editor.emit('a'));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(store.saveFile).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('SAVE CHANGES');
    expect(host.querySelector('.opacity-100')).not.toBeNull();

    act(() => {
      window.dispatchEvent(new Event('pagehide'));
    });
    expect(store.saveFile).toHaveBeenCalledTimes(2);
  });

  it('shows store content that changes underneath a clean editor, without saving it back', () => {
    act(() => setOpenFiles({ 'a.md': 'v1' }));
    editor.applied.length = 0;
    vi.mocked(githubFileStore.updateFileContent).mockClear();
    act(() => setOpenFiles({ 'a.md': 'v2 from remote' }));
    expect(editor.applied).toEqual(['v2 from remote']);
    act(() => {
      vi.advanceTimersByTime(AUTOSAVE_DEBOUNCE_MS * 2);
    });
    expect(githubFileStore.updateFileContent).not.toHaveBeenCalled();
    expect(store.saveFile).not.toHaveBeenCalled();
  });

  it('autosaves a store update (a clean merge) that leaves the file dirty', async () => {
    act(() => setOpenFiles({ 'a.md': 'x' }));
    store.setDirty('a.md', true);
    act(() => setOpenFiles({ 'a.md': 'x merged' }));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(store.saveFile).toHaveBeenCalledWith('a.md');
  });

  it('saves the previous file before switching to another path', () => {
    act(() => setOpenFiles({ 'a.md': '' }));
    act(() => editor.emit('a'));
    act(() => render(<CodeMirrorEditor path="b.md" />, host));
    act(() => setOpenFiles({ 'a.md': 'a', 'b.md': 'b' }));
    expect(store.saveFile).toHaveBeenCalledWith('a.md');
  });

  it('schedules an autosave when the opened file is already dirty in the store', async () => {
    act(() => render(null, host));
    store.saveFile.mockClear();
    store.setDirty('a.md', true);
    act(() => setOpenFiles({ 'a.md': 'restored edit' }));
    act(() => render(<CodeMirrorEditor path="a.md" />, host));
    expect(host.querySelector('.opacity-100')).not.toBeNull();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(AUTOSAVE_DEBOUNCE_MS);
    });
    expect(store.saveFile).toHaveBeenCalledWith('a.md');
  });
});
