import { describe, expect, it, vi } from 'vitest';
import { keywordCandidates, notesMode } from './notes-mode';

const notes = Array.from({ length: 12 }, (_, i) => ({
  id: `n${i}`,
  title: `Note ${i}`,
  text: i === 5 ? 'sync engine offline conflicts' : `unrelated thought ${i}`,
  path: `.kh/braindumps/${i}.md`,
  url: `https://console.example/files/${i}`,
}));

const submit = (mode: ReturnType<typeof notesMode>) => {
  if (!('submit' in mode)) throw new Error('not a submit mode');
  return mode.submit;
};

describe('keywordCandidates', () => {
  it('ranks by word overlap', () => {
    const items = [
      { id: 'a', text: 'groceries and cooking' },
      { id: 'b', text: 'offline sync conflicts' },
      { id: 'c', text: 'sync notes' },
    ];
    expect(keywordCandidates('Sync offline', items).map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('caps at the limit', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({ id: `${i}`, text: 'x' }));
    expect(keywordCandidates('x', items)).toHaveLength(30);
    expect(keywordCandidates('x', items, 5)).toHaveLength(5);
  });
});

describe('notesMode', () => {
  it('re-ranks to 8 with the model and keeps keyword order without it', async () => {
    const calls: { type: string; items?: { id: string }[] }[] = [];
    const make = (ids: string[] | null) =>
      notesMode(async (m: any) => {
        calls.push(m);
        if (m.type === 'LIST_NOTES') return { notes };
        return { ids };
      });

    const modelled = await submit(make(['n9', 'n3', 'n5']))('sync engine');
    expect(modelled).toHaveLength(8);
    expect(modelled.slice(0, 3).map((i) => i.id)).toEqual(['n9', 'n3', 'n5']);
    expect(modelled[0].url).toBe('https://console.example/files/9');
    expect(calls.find((c) => c.type === 'RERANK')?.items).toHaveLength(12);

    const plain = await submit(make(null))('sync engine');
    expect(plain).toHaveLength(8);
    expect(plain[0].id).toBe('n5');
  });

  it('keeps keyword order when the rerank request fails', async () => {
    const send = vi.fn(async (m: any) => {
      if (m.type === 'LIST_NOTES') return { notes };
      throw new Error('no model');
    });
    const items = await submit(notesMode(send))('sync engine');
    expect(items[0].id).toBe('n5');
  });
});
