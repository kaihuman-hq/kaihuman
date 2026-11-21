import { describe, expect, it, vi } from 'vitest';
import { detailBarProps, showsDetailTabBar } from './detail-tab-bar.js';

describe('showsDetailTabBar', () => {
  it.each([
    [['business']],
    [['business', 'client', '[slug]']],
    [['wiki', '[...page]']],
    [['files', '[...path]']],
    [['knowledge']],
    [['braindumps']],
    [['repos']],
    [['analytics']],
    [['weekly-review']],
    [['search']],
    [['scan']],
    [['quick-todo']],
    [['quick-entry']],
  ])('keeps the bar on %j', (segments) => {
    expect(showsDetailTabBar(segments)).toBe(true);
  });

  it.each([
    [['login']],
    [['onboarding']],
    [['reminders']],
    [['auth', 'callback']],
    [['(tabs)', 'dashboard']],
    [['business', 'time']],
    [['business', 'payment']],
    [[]],
  ])('hides the bar on %j', (segments) => {
    expect(showsDetailTabBar(segments)).toBe(false);
  });
});

describe('detailBarProps', () => {
  it('focuses no tab and sends each tab to its root', () => {
    const navigate = vi.fn();
    const props = detailBarProps(navigate, { top: 0, right: 0, bottom: 0, left: 0 });
    expect(props.state.index).toBe(-1);
    expect(props.state.routes.map((r) => r.name)).toEqual(['dashboard', 'board', 'tasks', 'more']);
    const key = (n: string) => props.state.routes.find((r) => r.name === n)?.key ?? '';
    (props.navigateToTab as (k: string) => void)(key('dashboard'));
    (props.navigateToTab as (k: string) => void)(key('more'));
    expect(navigate.mock.calls).toEqual([['/dashboard'], ['/more']]);
    expect(props.descriptors[key('dashboard')]?.options.title).toBe('Today');
  });
});
