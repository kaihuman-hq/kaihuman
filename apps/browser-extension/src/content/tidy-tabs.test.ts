import { describe, expect, it, vi } from 'vitest';
import { tidyTabsAction } from './tidy-tabs';

const tidy = {
  tabs: [
    { id: 1, title: 'One', url: 'https://a.dev/1' },
    { id: 2, title: 'Two', url: 'https://a.dev/2' },
    { id: 3, title: 'Three', url: 'https://b.dev/3' },
  ],
  proposals: [
    { name: 'A site', tabIds: [1, 2] },
    { name: 'Other', tabIds: [3] },
  ],
  streams: [{ id: 's1', name: 'Research' }],
};

const setup = () => {
  const send = vi.fn(async (message: { type: string }) =>
    message.type === 'TIDY_TABS' ? tidy : { count: 2, name: 'A site' },
  );
  return { send, action: tidyTabsAction({ send }) };
};

describe('tidy tabs palette action', () => {
  it('lists one child per proposal, each with the three choices', async () => {
    const { action } = setup();
    const proposals = (await action.children?.()) ?? [];
    expect(proposals.map((p) => p.title)).toEqual(['A site', 'Other']);
    const choices = (await proposals[0]?.children?.()) ?? [];
    expect(choices.map((c) => c.title)).toEqual([
      'Save as pinned-tab group',
      'Pin all to stream…',
      'Close these tabs',
    ]);
  });

  it('closes nothing until Close these tabs is run', async () => {
    const { send, action } = setup();
    const [first] = (await action.children?.()) ?? [];
    const choices = (await first?.children?.()) ?? [];
    expect(send.mock.calls.some(([m]) => m.type === 'TIDY_CLOSE_TABS')).toBe(false);
    await choices[2]?.run?.([]);
    expect(send).toHaveBeenCalledWith({ type: 'TIDY_CLOSE_TABS', tabIds: [1, 2] });
  });

  it('saves the proposal as a group and pins it to a stream in one WORK_OPS', async () => {
    const { send, action } = setup();
    const [first] = (await action.children?.()) ?? [];
    const choices = (await first?.children?.()) ?? [];
    await choices[0]?.run?.([]);
    expect(send).toHaveBeenCalledWith({
      type: 'SAVE_PINNED_TAB_GROUP',
      name: 'A site',
      tabs: [
        { url: 'https://a.dev/1', title: 'One' },
        { url: 'https://a.dev/2', title: 'Two' },
      ],
    });
    const streams = (await choices[1]?.children?.()) ?? [];
    await streams[0]?.run?.([]);
    const ops = send.mock.calls.filter(([m]) => m.type === 'WORK_OPS');
    expect(ops).toHaveLength(1);
    expect((ops[0]?.[0] as any).ops).toHaveLength(2);
  });
});
