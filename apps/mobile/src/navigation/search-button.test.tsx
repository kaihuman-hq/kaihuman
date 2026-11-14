import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }));
// Like the real hook, useRouter keeps hook state, so calling it outside a component's own
// render (as a header function) shows up as a hook-count change.
vi.mock('expo-router', async () => {
  const { useRef } = await import('react');
  return {
    useRouter: () => useRef(router).current,
    useFocusEffect: () => {},
  };
});

import { SearchButton, searchHeaderRight } from './search-button.js';
import { useStackScreenOptions } from './stack-options.js';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('search entry point', () => {
  it('pushes /search so back returns to the screen it was opened from', () => {
    render(<SearchButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(router.push).toHaveBeenCalledWith('/search');
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('keeps a screen’s own header control next to search', () => {
    const Right = searchHeaderRight(() => <button type="button">Extra</button>);
    render(<Right />);
    expect(screen.getByText('Extra')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });

  it('is in the shared stack header options and runs no hooks when the navigator calls it', () => {
    // The navigator calls headerRight as a plain function; a component there (hooks) made the
    // tile screen crash with "Rendered fewer hooks than expected" once it set its own header.
    // The hook only reads theme context, which has a default.
    let options: ReturnType<typeof useStackScreenOptions> | undefined;
    const Probe = () => {
      options = useStackScreenOptions();
      return null;
    };
    render(<Probe />);
    const Right = options?.headerRight as () => React.ReactNode;
    render(<div>{Right()}</div>);
    expect(screen.getByRole('button', { name: 'Search' })).toBeTruthy();
  });
});
