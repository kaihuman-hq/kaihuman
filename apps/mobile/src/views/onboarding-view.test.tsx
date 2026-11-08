import { authStore, githubProfileStore } from '@kaihuman/core';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepoSelectorController } from '../screens/repo-selector-screen.js';
import { OnboardingView } from './onboarding-view.js';

const repo = (name: string, priv = false, pushed = '2026-01-01T00:00:00Z') =>
  ({
    id: name.length,
    name,
    full_name: `me/${name}`,
    private: priv,
    owner: { login: 'me', avatar_url: '' },
    default_branch: 'main',
    updated_at: pushed,
    pushed_at: pushed,
  }) as never;

const refresh = vi.fn().mockResolvedValue(undefined);

beforeEach(() => {
  authStore.token.value = 't';
  vi.spyOn(githubProfileStore, 'fetchRepos').mockImplementation(refresh);
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  refresh.mockClear();
  authStore.token.value = null;
  githubProfileStore.repos.value = [];
  githubProfileStore.currentRepo.value = null;
  githubProfileStore.error.value = null;
  githubProfileStore.isLoading.value = false;
});

const view = () => {
  const onDone = vi.fn();
  const onSignOut = vi.fn();
  render(
    <OnboardingView
      controller={new RepoSelectorController()}
      onDone={onDone}
      onSignOut={onSignOut}
    />,
  );
  return { onDone, onSignOut };
};

describe('OnboardingView', () => {
  it('loads repos on entry and explains the step', () => {
    view();
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByText(/one GitHub\s+repository/)).toBeTruthy();
  });

  it('lists recent pushes first with private/public badges', () => {
    githubProfileStore.repos.value = [
      repo('old', false, '2025-01-01T00:00:00Z'),
      repo('new', true, '2026-06-01T00:00:00Z'),
    ];
    view();
    const rows = screen.getAllByTestId(/^repo-/).map((r) => r.getAttribute('data-testid'));
    expect(rows).toEqual(['repo-me/new', 'repo-me/old']);
    expect(screen.getByText('Private')).toBeTruthy();
    expect(screen.getByText('Public')).toBeTruthy();
  });

  it('preselects the single plausible repo but still needs confirmation', () => {
    githubProfileStore.repos.value = [repo('blog'), repo('my-kaihuman')];
    const { onDone } = view();
    expect(screen.getByTestId('onboarding-confirm').textContent).toContain('me/my-kaihuman');
    expect(githubProfileStore.currentRepo.value).toBeNull();
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    expect((githubProfileStore.currentRepo.value as { full_name?: string } | null)?.full_name).toBe(
      'me/my-kaihuman',
    );
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('shows no confirm step until a repo is picked when nothing is plausible', () => {
    githubProfileStore.repos.value = [repo('a'), repo('b')];
    const { onDone } = view();
    expect(screen.queryByTestId('onboarding-confirm')).toBeNull();
    fireEvent.click(screen.getByTestId('repo-me/b'));
    expect(screen.getByTestId('onboarding-confirm').textContent).toContain('me/b');
    fireEvent.click(screen.getByTestId('onboarding-continue'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('lets the user override the suggestion', () => {
    githubProfileStore.repos.value = [repo('a'), repo('kaihuman')];
    view();
    fireEvent.click(screen.getByTestId('repo-me/a'));
    expect(screen.getByTestId('onboarding-confirm').textContent).toContain('me/a');
  });

  it('searches long lists', () => {
    githubProfileStore.repos.value = Array.from({ length: 10 }, (_, i) => repo(`r${i}`));
    view();
    fireEvent.change(screen.getByLabelText('Search repositories'), { target: { value: 'r7' } });
    expect(screen.getByTestId('repo-me/r7')).toBeTruthy();
    expect(screen.queryByTestId('repo-me/r1')).toBeNull();
  });

  it('shows the empty state with a setup hint', () => {
    view();
    expect(screen.getByText('No repositories yet')).toBeTruthy();
    expect(screen.getByText(/Create a private repository/)).toBeTruthy();
  });

  it('shows loading', () => {
    githubProfileStore.isLoading.value = true;
    view();
    expect(screen.getByText('Loading repositories')).toBeTruthy();
  });

  it('shows an error with retry', () => {
    githubProfileStore.error.value = 'Network down';
    view();
    refresh.mockClear();
    fireEvent.click(screen.getByTestId('onboarding-retry'));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('onboarding-reauth')).toBeNull();
  });

  it('offers sign-in again when the token is rejected', () => {
    githubProfileStore.error.value = 'Bad credentials';
    const { onSignOut } = view();
    fireEvent.click(screen.getByTestId('onboarding-reauth'));
    expect(authStore.token.value).toBeNull();
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });
});
