import { asIdeaSlug, newIdea } from '@kaihuman/formats';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { IdeasScreenController } from '../screens/ideas-screen.js';
import { KnowledgeScreenController } from '../screens/knowledge-screen.js';
import { WikiScreenController } from '../screens/wiki-screen.js';
import { IdeaDetailView, IdeasView } from './ideas-view.js';
import { KnowledgeView } from './knowledge-view.js';
import { WikiPageView, WikiView } from './wiki-view.js';

const router = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock('expo-router', () => ({
  useRouter: () => router,
  // biome-ignore lint/correctness/useExhaustiveDependencies: stands in for the real hook
  useFocusEffect: (effect: () => void) => useEffect(effect, [effect]),
}));

afterEach(() => {
  cleanup();
  router.push.mockClear();
});

const alpha = asIdeaSlug('alpha');
if (!alpha) throw new Error('bad slug');

const NOW = new Date(2026, 10, 5, 10, 0, 0);

const memory = (initial: Record<string, string> = {}) => {
  const map = new Map(Object.entries(initial));
  const files: ContentFiles = {
    refresh: async () => {},
    tree: () => [...map.keys()].map((path) => ({ path, type: 'blob' as const })) as never,
    read: async (p: string) => map.get(p) ?? '',
    write: async (p: string, c: string) => void map.set(p, c),
    create: async (p: string, c: string) => void map.set(p, c),
  } as unknown as ContentFiles;
  return { map, files };
};

const failing = (): ContentFiles =>
  ({
    refresh: async () => {
      throw new Error('offline');
    },
    tree: () => [],
    read: async () => '',
    write: async () => {},
    create: async () => {},
  }) as unknown as ContentFiles;

describe('IdeasView states', () => {
  it('filters by status chip and shows a filtered empty state', async () => {
    const { files } = memory({
      '.kh/ideas/alpha.md': newIdea({ title: 'Alpha' }, { now: NOW, author: 'human' }).content,
    });
    render(<IdeasView controller={new IdeasScreenController({ files, now: () => NOW })} />);
    await screen.findByText('Alpha');
    fireEvent.click(screen.getByRole('button', { name: 'Shipped 0' }));
    expect(await screen.findByText('No matching ideas')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Show open ideas' }));
    expect(await screen.findByText('Alpha')).toBeTruthy();
  });

  it('pushes the detail route when a row is pressed', async () => {
    const { files } = memory({
      '.kh/ideas/alpha.md': newIdea({ title: 'Alpha' }, { now: NOW, author: 'human' }).content,
    });
    render(<IdeasView controller={new IdeasScreenController({ files, now: () => NOW })} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Alpha/ }));
    expect(router.push).toHaveBeenCalledWith('/ideas/alpha');
  });
});

describe('IdeaDetailView', () => {
  const setup = () => {
    const { map, files } = memory({
      '.kh/ideas/alpha.md': newIdea({ title: 'Alpha' }, { now: NOW, author: 'human' }).content,
    });
    return { map, controller: new IdeasScreenController({ files, now: () => NOW }) };
  };

  it('loads the idea itself, reports its title and changes status', async () => {
    const { map, controller } = setup();
    const onTitle = vi.fn();
    render(<IdeaDetailView controller={controller} slug={alpha} onTitle={onTitle} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Shipped' }));
    await waitFor(() => expect(map.get('.kh/ideas/alpha.md')).toContain('status: shipped'));
    expect(onTitle).toHaveBeenCalledWith('Alpha');
    expect(screen.queryByRole('button', { name: 'Back to ideas' })).toBeNull();
  });

  it('shows a not-found state for an unknown idea', async () => {
    const { controller } = setup();
    const missing = asIdeaSlug('missing');
    if (!missing) throw new Error('bad slug');
    render(<IdeaDetailView controller={controller} slug={missing} />);
    expect(await screen.findByText('Idea not found')).toBeTruthy();
  });
});

describe('IdeasView errors', () => {
  it('shows an error state with retry when loading fails', async () => {
    render(<IdeasView controller={new IdeasScreenController({ files: failing() })} />);
    expect(await screen.findByText("Couldn't load ideas")).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeTruthy();
  });

  it('shows the first-run empty state', async () => {
    render(<IdeasView controller={new IdeasScreenController({ files: memory().files })} />);
    expect(await screen.findByText('No ideas yet')).toBeTruthy();
  });
});

describe('WikiView reader', () => {
  const pages = {
    '.kh/wiki/home.md': '---\ntitle: Home\ntags: [a]\n---\nSee [[Other]].',
    '.kh/wiki/other.md': '---\ntitle: Other\ntags: [b]\n---\nBack.',
  };

  it('pushes the page route from the list', async () => {
    render(<WikiView controller={new WikiScreenController({ files: memory(pages).files })} />);
    fireEvent.click(await screen.findByRole('button', { name: /^Home/ }));
    expect(router.push).toHaveBeenCalledWith('/wiki/home');
  });

  it('hides frontmatter and pushes the target when a wikilink is pressed', async () => {
    const controller = new WikiScreenController({ files: memory(pages).files });
    render(<WikiPageView controller={controller} path=".kh/wiki/home.md" />);
    await screen.findByTestId('wiki-page');
    expect(screen.getByTestId('wiki-page').textContent).toBe('See Other.');
    fireEvent.click(screen.getByRole('link', { name: 'Other' }));
    expect(router.push).toHaveBeenCalledWith('/wiki/other');
  });

  it('renders Markdown headings and bullets with links still tappable', async () => {
    const files = memory({
      '.kh/wiki/clients.md': '# Clients\n\n## Active\n- Working with [[Other]]\n',
      '.kh/wiki/other.md': '---\ntitle: Other\n---\nBack.',
    }).files;
    const onTitle = vi.fn();
    render(
      <WikiPageView
        controller={new WikiScreenController({ files })}
        path=".kh/wiki/clients.md"
        onTitle={onTitle}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Clients' })).toBeTruthy();
    // The native header must match the body title, not the lower-case file name.
    expect(onTitle).toHaveBeenCalledWith('Clients');
    expect(screen.getByRole('heading', { name: 'Active' })).toBeTruthy();
    const body = screen.getByTestId('wiki-page').textContent ?? '';
    expect(body).not.toContain('#');
    expect(body).toContain('•');
    fireEvent.click(screen.getByRole('link', { name: 'Other' }));
    expect(router.push).toHaveBeenCalledWith('/wiki/other');
  });

  it('shows a not-found state for an unknown page', async () => {
    const controller = new WikiScreenController({ files: memory(pages).files });
    render(<WikiPageView controller={controller} path=".kh/wiki/nope.md" />);
    expect(await screen.findByText('Page not found')).toBeTruthy();
  });

  it('searches and filters by tag', async () => {
    render(<WikiView controller={new WikiScreenController({ files: memory(pages).files })} />);
    await screen.findByRole('button', { name: /^Home/ });
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'oth' } });
    expect(screen.queryByRole('button', { name: /^Home/ })).toBeNull();
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: 'zzz' } });
    expect(screen.getByText('No matching pages')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Search pages'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: '#a' }));
    expect(screen.queryByRole('button', { name: /^Other/ })).toBeNull();
  });
});

describe('KnowledgeView', () => {
  it('shows the inbox count and an empty state', async () => {
    render(
      <KnowledgeView
        controller={new KnowledgeScreenController({ files: memory().files, now: () => NOW })}
      />,
    );
    expect(await screen.findByText('Inbox is empty')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Add note' })).toBeTruthy();
  });

  it('disables Add note until there is text', async () => {
    render(
      <KnowledgeView
        controller={new KnowledgeScreenController({ files: memory().files, now: () => NOW })}
      />,
    );
    await screen.findByText('Inbox is empty');
    const add = screen.getByRole('button', { name: 'Add note' });
    expect(add.getAttribute('aria-disabled')).toBe('true');
  });
});
