import { authStore, githubProfileStore } from '@kaihuman/core';
import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Platform } from 'react-native';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FocusSessionController } from '../screens/focus-session.js';
import { KanbanBoardController } from '../screens/kanban-board.js';
import { LoginScreenController } from '../screens/login-screen.js';
import { QuickCaptureController, type RepoFiles } from '../screens/quick-capture.js';
import { RepoSelectorController } from '../screens/repo-selector-screen.js';
import { TodoAnalyticsController } from '../screens/todo-analytics.js';
import { KanbanView } from './kanban-view.js';
import { LoginView } from './login-view.js';
import { QuickCaptureView } from './quick-capture-view.js';
import { RepoSelectorView } from './repo-selector-view.js';
import { TodoAnalyticsView } from './todo-analytics-view.js';

afterEach(cleanup);

class MemoryFiles implements RepoFiles {
  constructor(public store = new Map<string, string>()) {}
  appFolder = () => '.kh';
  exists = (p: string) => this.store.has(p);
  todoPaths = () => [...this.store.keys()].filter((p) => p.endsWith('.todos.md'));
  read = async (p: string) => this.store.get(p) ?? null;
  async write(p: string, c: string) {
    this.store.set(p, c);
  }
}

const TODOS = '- [ ] write tests #qa\n- [x] ship it\n';
const todoFiles = () => new MemoryFiles(new Map([['.kh/inbox.todos.md', TODOS]]));

describe('LoginView', () => {
  it('signs in with a token and reports success', () => {
    const onSignedIn = vi.fn();
    const controller = new LoginScreenController('https://auth.example/login');
    render(<LoginView controller={controller} openAuthSession={vi.fn()} onSignedIn={onSignedIn} />);
    fireEvent.click(screen.getByTestId('login-token-toggle'));
    fireEvent.click(screen.getByTestId('login-token-submit'));
    expect(onSignedIn).not.toHaveBeenCalled();
    expect(screen.getByText('Enter a personal access token')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Personal access token'), {
      target: { value: ' ghp_x ' },
    });
    fireEvent.click(screen.getByTestId('login-token-submit'));
    expect(authStore.token.value).toBe('ghp_x');
    expect(onSignedIn).toHaveBeenCalledTimes(1);
  });

  it('opens the gateway URL in an auth session and signs in with the returned token', async () => {
    const openAuthSession = vi.fn().mockResolvedValue({
      type: 'success',
      url: 'kaihuman://auth/callback?access_token=gho_view',
    });
    // Captured at call time: the real auth store starts validating the token right away.
    let tokenAtSignIn: string | null = null;
    const onSignedIn = vi.fn(() => {
      tokenAtSignIn = authStore.token.value;
    });
    const controller = new LoginScreenController('https://auth.example/login');
    render(
      <LoginView
        controller={controller}
        openAuthSession={openAuthSession}
        onSignedIn={onSignedIn}
      />,
    );
    fireEvent.click(screen.getByTestId('login-browser'));
    expect(openAuthSession).toHaveBeenCalledWith(
      'https://auth.example/login?client=mobile',
      'kaihuman://auth/callback',
    );
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledTimes(1));
    expect(tokenAtSignIn).toBe('gho_view');
  });

  it('stays silent on cancel and explains a missing token', async () => {
    const openAuthSession = vi.fn().mockResolvedValueOnce({ type: 'cancel' });
    const onSignedIn = vi.fn();
    const controller = new LoginScreenController('https://auth.example/login');
    render(
      <LoginView
        controller={controller}
        openAuthSession={openAuthSession}
        onSignedIn={onSignedIn}
      />,
    );
    fireEvent.click(screen.getByTestId('login-browser'));
    await waitFor(() => expect(openAuthSession).toHaveBeenCalledTimes(1));
    expect(screen.queryByText(/no token|could not open/i)).toBeNull();
    openAuthSession.mockResolvedValueOnce({ type: 'success', url: 'kaihuman://auth/callback' });
    fireEvent.click(screen.getByTestId('login-browser'));
    expect(await screen.findByText(/no token/i)).toBeTruthy();
    expect(onSignedIn).not.toHaveBeenCalled();
  });
});

describe('RepoSelectorView', () => {
  it('lists repos and selects one', () => {
    const repo = {
      id: 1,
      name: 'kb',
      full_name: 'me/kb',
      private: true,
      owner: { login: 'me', avatar_url: '' },
      default_branch: 'main',
      updated_at: '',
    } as never;
    githubProfileStore.repos.value = [repo];
    const onSelected = vi.fn();
    render(<RepoSelectorView controller={new RepoSelectorController()} onSelected={onSelected} />);
    fireEvent.click(screen.getByTestId('repo-me/kb'));
    expect(githubProfileStore.currentRepo.value?.full_name).toBe('me/kb');
    expect(onSelected).toHaveBeenCalledTimes(1);
  });
});

describe('QuickCaptureView', () => {
  it('writes a todo through the controller and shows the result', async () => {
    const files = new MemoryFiles();
    render(<QuickCaptureView controller={new QuickCaptureController(files)} kind="todo" />);
    fireEvent.change(screen.getByLabelText('Todo'), { target: { value: 'buy milk' } });
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(screen.getByText('Todo added')).toBeTruthy());
    expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items[0]?.text).toBe('buy milk');
  });

  it('shows the error for empty input', async () => {
    render(
      <QuickCaptureView controller={new QuickCaptureController(new MemoryFiles())} kind="note" />,
    );
    fireEvent.click(screen.getByTestId('capture-submit'));
    await waitFor(() => expect(screen.getByText('Error: Nothing to add')).toBeTruthy());
  });
});

describe('KanbanView', () => {
  it('renders columns and moves a card', async () => {
    const files = todoFiles();
    render(<KanbanView controller={new KanbanBoardController(files)} />);
    await waitFor(() => expect(screen.getByText('write tests')).toBeTruthy());
    expect(screen.getByText('Todo 1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('move-0-in-progress'));
    await waitFor(() => expect(screen.getByText('Active 1')).toBeTruthy());
    expect(screen.getByText('Todo 0')).toBeTruthy();
    expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items[0]?.status).toBe(
      'in-progress',
    );
  });
});

describe('KanbanView open', () => {
  it('opens the detail for a tapped row as <path>#<index>', async () => {
    const onOpenTodo = vi.fn();
    render(
      <KanbanView controller={new KanbanBoardController(todoFiles())} onOpenTodo={onOpenTodo} />,
    );
    await waitFor(() => expect(screen.getByText('write tests')).toBeTruthy());
    fireEvent.click(screen.getByText('write tests'));
    expect(onOpenTodo).toHaveBeenCalledWith('.kh/inbox.todos.md#0');
  });
});

describe('KanbanView focus', () => {
  // react-native-web reports 'web', where swipe actions are off; pretend to be a native build.
  const realOS = Platform.OS;
  beforeEach(() => {
    (Platform as { OS: string }).OS = 'ios';
  });
  afterEach(() => {
    (Platform as { OS: string }).OS = realOS;
  });

  it('only offers Start focus when the controller is available', async () => {
    const files = todoFiles();
    const none = new FocusSessionController(null);
    const { unmount } = render(
      <KanbanView controller={new KanbanBoardController(files)} focus={none} />,
    );
    await waitFor(() => expect(screen.getByText('write tests')).toBeTruthy());
    expect(screen.queryByTestId('swipe-action-Start focus')).toBeNull();
    unmount();

    const start = vi.fn(() => 'a1');
    const focus = new FocusSessionController({ startFocusActivity: start });
    render(<KanbanView controller={new KanbanBoardController(files)} focus={focus} />);
    await waitFor(() => expect(screen.getByText('write tests')).toBeTruthy());
    fireEvent.click(screen.getByTestId('swipe-action-Start focus'));
    await waitFor(() =>
      expect(start).toHaveBeenCalledWith('.kh/inbox.todos.md#0', 'write tests', 25),
    );
  });

  it('shows how to enable notifications when the permission is denied', async () => {
    const start = vi.fn(() => 'a1');
    const focus = new FocusSessionController({
      startFocusActivity: start,
      requestNotificationPermission: async () => false,
    });
    render(<KanbanView controller={new KanbanBoardController(todoFiles())} focus={focus} />);
    await waitFor(() => expect(screen.getByText('write tests')).toBeTruthy());
    fireEvent.click(screen.getByTestId('swipe-action-Start focus'));
    await waitFor(() =>
      expect(screen.getByText(/Allow notifications to see the focus timer/)).toBeTruthy(),
    );
    expect(start).not.toHaveBeenCalled();
  });
});

describe('TodoAnalyticsView', () => {
  it('shows totals and completion', async () => {
    render(<TodoAnalyticsView controller={new TodoAnalyticsController(todoFiles())} />);
    await waitFor(() => expect(screen.getByText('100%')).toBeTruthy());
    expect(screen.getByText('Total')).toBeTruthy();
    expect(screen.getByText('#qa')).toBeTruthy();
    fireEvent.click(screen.getByText('All'));
    expect(screen.getByText('Done per week')).toBeTruthy();
  });
});
