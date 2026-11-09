// @vitest-environment jsdom
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NO_REPEAT, type RepeatState } from '../../Templates/repeatView';
import { RepeatFields, RepeatIcon } from './RepeatFields';

const host = document.createElement('div');
document.body.appendChild(host);
afterEach(() => act(() => render(null, host)));

const select = (label: string) =>
  host.querySelector(`[aria-label="${label}"]`) as HTMLSelectElement;

describe('RepeatFields', () => {
  it('is disabled without a due date', () => {
    act(() => render(<RepeatFields dueDate="" value={NO_REPEAT} onChange={() => {}} />, host));
    expect(select('Repeat').disabled).toBe(true);
  });

  it('reports the chosen preset', () => {
    const onChange = vi.fn();
    act(() =>
      render(<RepeatFields dueDate="2026-11-10" value={NO_REPEAT} onChange={onChange} />, host),
    );
    const el = select('Repeat');
    el.value = 'weekly';
    act(() => {
      el.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ preset: 'weekly' }));
  });

  it('shows the custom controls, with weekday toggles for weeks', () => {
    const value: RepeatState = { ...NO_REPEAT, preset: 'custom', unit: 'week', interval: 2 };
    act(() =>
      render(<RepeatFields dueDate="2026-11-10" value={value} onChange={() => {}} />, host),
    );
    expect(select('Repeat interval')).not.toBeNull();
    expect(select('Repeat unit').value).toBe('week');
    // Tuesday is pre-selected from the due date.
    expect(host.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
    expect(host.querySelectorAll('[aria-pressed]')).toHaveLength(7);
  });
});

describe('RepeatIcon', () => {
  it('names the rule', () => {
    act(() =>
      render(<RepeatIcon repeat={{ unit: 'week', interval: 2, weekdays: [0, 3] }} />, host),
    );
    expect(host.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Every 2 weeks on Mon, Thu',
    );
  });
});
