import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CaptureHubView } from './capture-hub-view.js';
import { MoreView } from './more-view.js';

afterEach(cleanup);

describe('CaptureHubView', () => {
  it('lists the five capture kinds and reports the chosen one', () => {
    const onSelect = vi.fn();
    render(<CaptureHubView onSelect={onSelect} />);
    for (const title of ['Todo', 'Note', 'Log', 'Idea', 'Knowledge']) {
      expect(screen.getByText(title)).toBeTruthy();
    }
    fireEvent.click(screen.getByTestId('capture-log'));
    expect(onSelect).toHaveBeenCalledWith('log');
  });
});

describe('MoreView', () => {
  it('navigates to workspace screens, signs out, and shows the version', () => {
    const onNavigate = vi.fn();
    const onSignOut = vi.fn();
    render(<MoreView onNavigate={onNavigate} onSignOut={onSignOut} version="0.1.0" />);
    fireEvent.click(screen.getByTestId('more-repositories'));
    expect(onNavigate).toHaveBeenCalledWith('/repos');
    fireEvent.click(screen.getByTestId('more-files'));
    expect(onNavigate).toHaveBeenCalledWith('/files');
    fireEvent.click(screen.getByTestId('more-sign-out'));
    expect(onSignOut).toHaveBeenCalledOnce();
    expect(screen.getByText('kaihuman 0.1.0')).toBeTruthy();
  });
});
