import { authStore, githubProfileStore } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginScreenController } from '../screens/login-screen.js';
import { RepoSelectorController } from '../screens/repo-selector-screen.js';
import { SESSION_EXPIRED, sessionNotice } from '../sync/auth-recovery.js';
import { LoginView } from './login-view.js';
import { RepoSelectorView } from './repo-selector-view.js';

afterEach(() => {
  cleanup();
  githubProfileStore.repos.value = [];
  githubProfileStore.currentRepo.value = null;
  githubProfileStore.error.value = null;
  githubProfileStore.isLoading.value = false;
});

const repo = (name: string, priv = false) =>
  ({
    id: name.length,
    name,
    full_name: `me/${name}`,
    private: priv,
    owner: { login: 'me', avatar_url: '' },
    default_branch: 'main',
    updated_at: '',
  }) as never;

describe('LoginView', () => {
  const setup = () => {
    const onSignedIn = vi.fn();
    const controller = new LoginScreenController('https://auth.example/login');
    render(<LoginView controller={controller} openAuthSession={vi.fn()} onSignedIn={onSignedIn} />);
    return { onSignedIn };
  };

  it('explains why the session ended after GitHub rejected its token', () => {
    sessionNotice.value = SESSION_EXPIRED;
    setup();
    expect(screen.getByTestId('login-session-notice').textContent).toBe(SESSION_EXPIRED);
    sessionNotice.value = null;
  });

  it('hides the token field until requested', () => {
    setup();
    expect(screen.queryByLabelText('Personal access token')).toBeNull();
    fireEvent.click(screen.getByTestId('login-token-toggle'));
    expect(screen.getByLabelText('Personal access token')).toBeTruthy();
  });

  it('shows the error inline and clears it when typing', () => {
    const { onSignedIn } = setup();
    fireEvent.click(screen.getByTestId('login-token-toggle'));
    fireEvent.click(screen.getByTestId('login-token-submit'));
    expect(screen.getByText('Enter a personal access token')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Personal access token'), { target: { value: 'x' } });
    expect(screen.queryByText('Enter a personal access token')).toBeNull();
    expect(onSignedIn).not.toHaveBeenCalled();
  });

  it('submits the token on enter', () => {
    const { onSignedIn } = setup();
    fireEvent.click(screen.getByTestId('login-token-toggle'));
    const input = screen.getByLabelText('Personal access token');
    fireEvent.change(input, { target: { value: 'ghp_enter' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(authStore.token.value).toBe('ghp_enter');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('shows the GitHub mark on the sign-in button instead of a code icon', () => {
    setup();
    const button = screen.getByTestId('login-browser');
    expect(button.querySelector('[data-testid="github-mark"]')).not.toBeNull();
    expect(button.querySelector('[data-testid="icon-code"]')).toBeNull();
    expect(button.querySelector('path')?.getAttribute('fill')).toBeTruthy();
    expect(button.textContent).toBe('Sign in with GitHub');
  });

  it('enters demo mode', () => {
    const { onSignedIn } = setup();
    fireEvent.click(screen.getByTestId('login-demo'));
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });
});

describe('RepoSelectorView', () => {
  const view = (onSelected = vi.fn()) =>
    render(<RepoSelectorView controller={new RepoSelectorController()} onSelected={onSelected} />);

  it('shows the empty state with a refresh action', () => {
    view();
    expect(screen.getByText('No repositories')).toBeTruthy();
  });

  it('shows the loading state', () => {
    githubProfileStore.isLoading.value = true;
    view();
    expect(screen.getByText('Loading repositories')).toBeTruthy();
  });

  it('shows a fetch error with retry', () => {
    githubProfileStore.error.value = 'boom';
    view();
    expect(screen.getByText("Couldn't load repositories")).toBeTruthy();
    expect(screen.getByText('boom')).toBeTruthy();
    expect(screen.getByTestId('repos-retry')).toBeTruthy();
  });

  it('marks the current repo as selected and selects another', () => {
    githubProfileStore.repos.value = [repo('a', true), repo('b')];
    githubProfileStore.currentRepo.value = repo('a');
    const onSelected = vi.fn();
    view(onSelected);
    expect(screen.getByLabelText('Selected')).toBeTruthy();
    fireEvent.click(screen.getByTestId('repo-me/b'));
    expect((githubProfileStore.currentRepo.value as { full_name?: string } | null)?.full_name).toBe(
      'me/b',
    );
    expect(onSelected).toHaveBeenCalledTimes(1);
  });

  it('filters long lists with search', () => {
    githubProfileStore.repos.value = Array.from({ length: 10 }, (_, i) => repo(`r${i}`));
    view();
    fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'r7' } });
    expect(screen.getByTestId('repo-me/r7')).toBeTruthy();
    expect(screen.queryByTestId('repo-me/r1')).toBeNull();
    fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matches')).toBeTruthy();
  });
});
