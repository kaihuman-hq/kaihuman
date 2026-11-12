import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary, RouteErrorBoundary } from './error-boundary.js';
import { Text } from './text.js';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

let broken = true;
function Flaky({ label }: { label: string }) {
  if (broken) throw new Error('bad feed');
  return <Text>{label}</Text>;
}

describe('ErrorBoundary', () => {
  it('shows the error inline instead of unmounting the screen, and retries', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    broken = true;
    const onRetry = vi.fn();
    render(
      <>
        <Text>sibling</Text>
        <ErrorBoundary what="this tile" onRetry={onRetry}>
          <Flaky label="ok now" />
        </ErrorBoundary>
      </>,
    );
    expect(screen.getByText('sibling')).toBeTruthy();
    expect(screen.getByText("Couldn't show this tile")).toBeTruthy();
    expect(screen.getByTestId('inline-error').textContent).toBe('bad feed');
    broken = false;
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(screen.getByText('ok now')).toBeTruthy();
  });

  it('clears the error when the reset key changes', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    broken = true;
    const view = render(
      <ErrorBoundary what="this file" resetKey="a">
        <Flaky label="fixed" />
      </ErrorBoundary>,
    );
    expect(screen.getByTestId('inline-error')).toBeTruthy();
    broken = false;
    view.rerender(
      <ErrorBoundary what="this file" resetKey="b">
        <Flaky label="fixed" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('fixed')).toBeTruthy();
  });
});

describe('RouteErrorBoundary', () => {
  it('shows the error with a retry instead of closing the app', () => {
    const retry = vi.fn(async () => {});
    render(<RouteErrorBoundary error={new Error('boom')} retry={retry} />);
    expect(screen.getByText("Couldn't show this screen")).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalled();
  });
});
