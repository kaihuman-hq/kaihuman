import { signal } from '@preact/signals';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Button, Field } from './primitives.js';
import { useSignalValue } from './use-signal.js';

afterEach(cleanup);

describe('primitives', () => {
  it('Button calls onPress', () => {
    const onPress = vi.fn();
    render(<Button label="Go" onPress={onPress} />);
    fireEvent.click(screen.getByRole('button', { name: 'Go' }));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('disabled Button does not call onPress', () => {
    const onPress = vi.fn();
    render(<Button label="Go" onPress={onPress} disabled />);
    fireEvent.click(screen.getByText('Go'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('Field forwards text changes', () => {
    const onChangeText = vi.fn();
    render(<Field label="Token" value="" onChangeText={onChangeText} />);
    fireEvent.change(screen.getByLabelText('Token'), { target: { value: 'abc' } });
    expect(onChangeText).toHaveBeenCalledWith('abc');
  });
});

describe('useSignalValue', () => {
  it('re-renders when the signal changes', () => {
    const count = signal(1);
    function Probe() {
      return <span data-testid="v">{useSignalValue(count)}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId('v').textContent).toBe('1');
    act(() => {
      count.value = 2;
    });
    expect(screen.getByTestId('v').textContent).toBe('2');
  });
});
