import { Button } from '@cascivo/react';
import { signal } from '@preact/signals';
import { render } from 'preact';
import { expect, test } from 'vitest';

// KEYSTONE SPIKE: prove a Cascivo React/signals-react component mounts under
// Preact (preact/compat + signals-react bridge). If the import chain or the
// useSignals no-op were broken, mounting would throw.
test('cascivo Button mounts and renders under preact/compat', () => {
  const root = document.createElement('div');
  document.body.appendChild(root);

  render(<Button>Hello Cascivo</Button>, root);

  const btn = root.querySelector('button');
  expect(btn).not.toBeNull();
  expect(btn?.textContent).toContain('Hello Cascivo');
});

// Prove signal reactivity flows through Preact's auto-tracking: a signal read
// inside a component re-renders the DOM when the signal changes.
test('signal updates re-render a Cascivo Button label under Preact', async () => {
  const label = signal('one');
  const root = document.createElement('div');
  document.body.appendChild(root);

  function Demo() {
    return <Button>{label.value}</Button>;
  }

  render(<Demo />, root);
  expect(root.querySelector('button')?.textContent).toContain('one');

  label.value = 'two';
  // Preact schedules signal-driven re-renders asynchronously; flush the queue.
  await new Promise((r) => setTimeout(r, 0));
  expect(root.querySelector('button')?.textContent).toContain('two');
});
