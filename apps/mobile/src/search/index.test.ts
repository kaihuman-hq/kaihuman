import { describe, expect, it, vi } from 'vitest';
import { SearchIndex } from './index.js';

type Entry = { path: string; sha: string; type: string };
const blob = (path: string, sha: string): Entry => ({ path, sha, type: 'blob' });
const instant = { yieldTo: async () => {} };

const reader = (files: Record<string, string>) => {
  const read = vi.fn((p: string) => files[p] ?? null);
  return read;
};

describe('SearchIndex.update', () => {
  it('indexes new files and skips directories', async () => {
    const index = new SearchIndex();
    const read = reader({ 'a.md': '# Alpha\nbody' });
    const res = await index.update(
      [blob('a.md', '1'), { path: 'dir', sha: 's', type: 'tree' }],
      read,
      instant,
    );
    expect(res.changed).toBe(1);
    expect(read).toHaveBeenCalledTimes(1);
    expect(
      index
        .docs()
        .map((d) => d.kind)
        .sort(),
    ).toEqual(['file', 'note']);
    expect(index.search('alpha')[0]?.kind).toBe('note');
  });

  it('does not re-read files whose sha is unchanged', async () => {
    const index = new SearchIndex();
    const read = reader({ 'a.md': 'x', 'b.md': 'y' });
    const tree = [blob('a.md', '1'), blob('b.md', '1')];
    await index.update(tree, read, instant);
    read.mockClear();
    const res = await index.update(tree, read, instant);
    expect(read).not.toHaveBeenCalled();
    expect(res.changed).toBe(0);
  });

  it('re-extracts a changed sha and keeps the flat cache until something changes', async () => {
    const index = new SearchIndex();
    const files: Record<string, string> = { 'a.md': 'first' };
    const read = reader(files);
    await index.update([blob('a.md', '1')], read, instant);
    const before = index.docs();
    expect(index.docs()).toBe(before);
    files['a.md'] = 'second text';
    const res = await index.update([blob('a.md', '2')], read, instant);
    expect(res.changed).toBe(1);
    expect(index.docs()).not.toBe(before);
    expect(index.search('second')).toHaveLength(1);
    expect(index.search('first')).toHaveLength(0);
  });

  it('drops removed paths', async () => {
    const index = new SearchIndex();
    const read = reader({ 'a.md': 'x', 'b.md': 'y' });
    await index.update([blob('a.md', '1'), blob('b.md', '1')], read, instant);
    const res = await index.update([blob('b.md', '1')], read, instant);
    expect(res.changed).toBe(1);
    expect(index.docs().every((d) => d.path === 'b.md')).toBe(true);
  });

  it('picks up content that became cached after a name-only pass', async () => {
    const index = new SearchIndex();
    const files: Record<string, string> = {};
    const read = reader(files);
    const tree = [blob('a.md', '1')];
    await index.update(tree, read, instant);
    expect(index.search('late')).toHaveLength(0);
    files['a.md'] = 'late arrival';
    const res = await index.update(tree, read, instant);
    expect(res.changed).toBe(1);
    expect(index.search('late')).toHaveLength(1);
  });

  it('bumps its version only when something changed', async () => {
    const index = new SearchIndex();
    const read = reader({ 'a.md': 'x' });
    const tree = [blob('a.md', '1')];
    await index.update(tree, read, instant);
    const v = index.version;
    await index.update(tree, read, instant);
    expect(index.version).toBe(v);
  });

  it('yields to the UI thread once the chunk budget is spent', async () => {
    const index = new SearchIndex();
    let t = 0;
    const tree = Array.from({ length: 10 }, (_, i) => blob(`f${i}.md`, '1'));
    const read = vi.fn(() => {
      t += 3; // every extraction costs 3 ms on the fake clock
      return 'x';
    });
    const yieldTo = vi.fn(async () => {});
    await index.update(tree, read, { budgetMs: 8, now: () => t, yieldTo });
    // 10 files * 3 ms = 30 ms over an 8 ms budget: a yield after every third file.
    expect(yieldTo).toHaveBeenCalledTimes(3);
    expect(index.docs().filter((d) => d.kind === 'file')).toHaveLength(10);
  });

  it('is cancelled by a newer update', async () => {
    const index = new SearchIndex();
    let t = 0;
    const read = vi.fn(() => {
      t += 10;
      return 'x';
    });
    const old = Array.from({ length: 6 }, (_, i) => blob(`old${i}.md`, '1'));
    const fresh = [blob('new.md', '1')];
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => {
      release = r;
    });
    let yields = 0;
    const first = index.update(old, read, {
      budgetMs: 5,
      now: () => t,
      yieldTo: () => {
        yields++;
        return gate;
      },
    });
    // The first update is parked at its first yield; a newer one takes over.
    const second = index.update(fresh, read, { ...instant, now: () => t });
    await second;
    release();
    await first;
    expect(yields).toBe(1);
    // The cancelled run stopped after one file instead of walking all six.
    expect(read.mock.calls).toHaveLength(2); // one old file, then new.md
    expect(index.docs().some((d) => d.path === 'new.md')).toBe(true);
    // The newer tree is the truth: the old files are gone.
    expect(index.docs().some((d) => d.path.startsWith('old'))).toBe(false);
  });
});

describe('SearchIndex at scale', () => {
  const build = () => {
    const files: Record<string, string> = {};
    const tree: Entry[] = [];
    const add = (path: string, content: string) => {
      files[path] = content;
      tree.push(blob(path, 's'));
    };
    const para = (i: number) =>
      `Paragraph ${i} about planning, release trains and quarterly goals. `
        .repeat(30)
        .slice(0, 2000);
    for (let i = 0; i < 1000; i++) {
      const items = Array.from(
        { length: 20 },
        (_, j) => `- [ ] task ${i}-${j} follow up #t${j % 5}`,
      );
      add(`.kh/p${i}.todos.md`, `## Milestone ${i}\n${items.join('\n')}\n`);
    }
    for (let i = 0; i < 700; i++)
      add(`.kh/wiki/w${i}.md`, `---\ntitle: Wiki ${i}\n---\n${para(i)}`);
    for (let i = 0; i < 700; i++)
      add(`.kh/ideas/idea-${i}.md`, `---\ntitle: Idea ${i}\nstatus: seed\n---\n\n${para(i)}\n`);
    for (let i = 0; i < 600; i++) add(`notes/n${i}.md`, `# Note ${i}\n${para(i)}`);
    return { files, tree };
  };

  it('builds 3 000 files fast, in short chunks, and answers queries quickly', async () => {
    const { files, tree } = build();
    expect(tree).toHaveLength(3000);
    const index = new SearchIndex();

    // Longest stretch of synchronous work between two yields.
    let chunkStart = performance.now();
    let maxChunk = 0;
    const yieldTo = () =>
      new Promise<void>((resolve) => {
        maxChunk = Math.max(maxChunk, performance.now() - chunkStart);
        setTimeout(() => {
          chunkStart = performance.now();
          resolve();
        }, 0);
      });

    const t0 = performance.now();
    chunkStart = t0;
    await index.update(tree, (p) => files[p] ?? null, { yieldTo });
    const total = performance.now() - t0;
    maxChunk = Math.max(maxChunk, performance.now() - chunkStart);

    console.info(
      `perf: build ${total.toFixed(0)} ms, max chunk ${maxChunk.toFixed(1)} ms, docs ${index.docs().length}`,
    );
    expect(total).toBeLessThan(1500);
    expect(maxChunk).toBeLessThan(50);

    for (const q of ['task 500-7', 'quarterly goals', 'idea 42', 'zzzz']) {
      // Best of three: a parallel test run on a shared CI runner adds noise, not query cost.
      let ms = Number.POSITIVE_INFINITY;
      let groups = index.search(q);
      for (let run = 0; run < 3; run++) {
        const t1 = performance.now();
        groups = index.search(q);
        ms = Math.min(ms, performance.now() - t1);
      }
      console.info(`perf: query "${q}" ${ms.toFixed(1)} ms, groups ${groups.length}`);
      expect(ms).toBeLessThan(100);
    }
    expect(index.search('task 500-7')[0]?.kind).toBe('todo');
  });
});
