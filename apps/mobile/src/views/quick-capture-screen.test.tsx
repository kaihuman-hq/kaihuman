import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickCaptureScreen } from './quick-capture-screen.js';

vi.mock('expo-router', () => ({
  Stack: { Screen: () => null },
  useRouter: () => ({ canGoBack: () => true, back: vi.fn(), replace: vi.fn() }),
}));

// The real controller reads the GitHub store; this one fails while the sheet renders.
vi.mock('../screens/quick-capture.js', async (importOriginal) => {
  const real = await importOriginal<typeof import('../screens/quick-capture.js')>();
  class Broken extends real.QuickCaptureController {
    constructor() {
      super({
        appFolder: () => '.kh',
        exists: () => false,
        todoPaths: () => [],
        paths: () => {
          throw new Error('tree not loaded');
        },
        read: async () => null,
        write: async () => {},
      });
    }
  }
  return { ...real, QuickCaptureController: Broken };
});

afterEach(cleanup);

describe('QuickCaptureScreen', () => {
  it('shows an error card instead of crashing when the capture fails to render', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<QuickCaptureScreen kind="note" />);
    expect(screen.getByText("Couldn't show this capture")).toBeTruthy();
    expect(screen.getByTestId('inline-error').textContent).toBe('tree not loaded');
    spy.mockRestore();
  });
});
