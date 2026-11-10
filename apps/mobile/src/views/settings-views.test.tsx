import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MoreView } from './more-view.js';
import { PaletteSettingsScreen } from './palette-settings-screen.js';
import { SettingsView } from './settings-view.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 10, 9, 0, 0);

describe('More → Settings → Command palette', () => {
  it('reaches Settings from More and the palette and notifications from Settings', () => {
    const onNavigate = vi.fn();
    render(<MoreView onNavigate={onNavigate} onSignOut={vi.fn()} version="1" />);
    fireEvent.click(screen.getByTestId('more-settings'));
    expect(onNavigate).toHaveBeenLastCalledWith('/more/settings');
    cleanup();
    render(<SettingsView onNavigate={onNavigate} />);
    fireEvent.click(screen.getByTestId('settings-palette'));
    expect(onNavigate).toHaveBeenLastCalledWith('/more/palette');
    fireEvent.click(screen.getByTestId('settings-notifications'));
    expect(onNavigate).toHaveBeenLastCalledWith('/more/notifications');
  });

  it('renders the palette settings file in its tile editor', async () => {
    const load = vi.fn(async () => ({ path: '.kh/command-palette.settings.json', content: '{}' }));
    render(<PaletteSettingsScreen load={load} onWrite={vi.fn()} now={NOW} />);
    expect(await screen.findByTestId('tile-palettesettings')).toBeTruthy();
  });

  it('shows an empty state when the repository has no settings file', async () => {
    render(<PaletteSettingsScreen load={async () => null} onWrite={vi.fn()} now={NOW} />);
    expect(await screen.findByText('No palette settings')).toBeTruthy();
  });
});
