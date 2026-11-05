import { authStore, githubProfileStore } from '@kaihuman/core';
import { parseTodos } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
    render(<LoginView controller={controller} onOpenBrowser={vi.fn()} onSignedIn={onSignedIn} />);
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

  it('opens the gateway URL in the browser', () => {
    const onOpenBrowser = vi.fn();
    const controller = new LoginScreenController('https://auth.example/login');
    render(
      <LoginView controller={controller} onOpenBrowser={onOpenBrowser} onSignedIn={vi.fn()} />,
    );
    fireEvent.click(screen.getByTestId('login-browser'));
    expect(onOpenBrowser).toHaveBeenCalledWith('https://auth.example/login?client=mobile');
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
    fireEvent.change(screen.getByLabelText('Text'), { target: { value: 'buy milk' } });
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
    expect(screen.getByText('backlog (1)')).toBeTruthy();
    fireEvent.click(screen.getByTestId('move-0-in-progress'));
    await waitFor(() => expect(screen.getByText('in-progress (1)')).toBeTruthy());
    expect(screen.getByText('backlog (0)')).toBeTruthy();
    expect(parseTodos(files.store.get('.kh/inbox.todos.md') ?? '').items[0]?.status).toBe(
      'in-progress',
    );
  });
});

describe('TodoAnalyticsView', () => {
  it('shows totals and completion', async () => {
    render(<TodoAnalyticsView controller={new TodoAnalyticsController(todoFiles())} />);
    await waitFor(() => expect(screen.getByText('Total: 2')).toBeTruthy());
    expect(screen.getByText('Completion: 100%')).toBeTruthy();
    expect(screen.getByText('done: 1')).toBeTruthy();
    expect(screen.getByText('#qa: 1')).toBeTruthy();
    fireEvent.click(screen.getByTestId('frame-ALL'));
    expect(screen.getByText('[ALL]')).toBeTruthy();
  });
});
