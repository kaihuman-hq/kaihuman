import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImage } from '../files/image-source.js';
import {
  CsvTable,
  FileContentView,
  ImageViewer,
  JsonReader,
  MarkdownReader,
  NoViewerNote,
  TextReader,
  YamlReader,
} from './file-views.js';

vi.mock('../files/image-source.js', () => ({ loadImage: vi.fn() }));
vi.mock('../files/feed-store.js', () => ({
  feedStore: { snapshot: () => ({}), subscribe: () => () => {}, ensure: async () => {} },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('MarkdownReader', () => {
  it('renders headings, bullets and code instead of source', () => {
    render(<MarkdownReader content={'# Title\n\n- one\n- two\n\n```\ncode here\n```\n'} />);
    expect(screen.getByRole('heading', { name: 'Title' })).toBeTruthy();
    expect(screen.getByText('one')).toBeTruthy();
    expect(screen.getByText('code here')).toBeTruthy();
    expect(screen.queryByText(/^#/)).toBeNull();
  });
  it('says so for an empty file', () => {
    render(<MarkdownReader content="" />);
    expect(screen.getByText('Empty file')).toBeTruthy();
  });
});

describe('CsvTable', () => {
  it('renders the header and rows with a row count', () => {
    render(<CsvTable content={'name,qty\napple,3\npear,5\n'} path="a.csv" />);
    expect(screen.getByText('name')).toBeTruthy();
    expect(screen.getByText('pear')).toBeTruthy();
    expect(screen.getByText('2 rows')).toBeTruthy();
  });
  it('notes truncation for long files', () => {
    const rows = Array.from({ length: 250 }, (_, i) => `r${i},${i}`).join('\n');
    render(<CsvTable content={`k,v\n${rows}`} path="big.csv" />);
    expect(screen.getByText('Showing 200 of 250 rows')).toBeTruthy();
  });
});

describe('JsonReader', () => {
  it('shows a summary and pretty text', () => {
    render(<JsonReader content='{"a":1,"b":[1,2]}' />);
    expect(screen.getByText('Object · 2 keys')).toBeTruthy();
    expect(screen.getByText(/"a": 1/)).toBeTruthy();
  });
  it('shows an error state for invalid JSON', () => {
    render(<JsonReader content="{nope" />);
    expect(screen.getByRole('alert').textContent).toMatch(/Not valid JSON/);
  });
});

describe('YamlReader', () => {
  it('shows keys, values and comments', () => {
    render(<YamlReader content={'# note\nname: kai\nitems:\n  - a\n'} />);
    expect(screen.getByText('# note')).toBeTruthy();
    expect(screen.getByText('name:')).toBeTruthy();
    expect(screen.getByText(/kai/)).toBeTruthy();
  });
});

describe('TextReader and NoViewerNote', () => {
  it('shows plain text', () => {
    render(<TextReader content="hello log" />);
    expect(screen.getByText('hello log')).toBeTruthy();
  });
  it('names the extension that has no viewer', () => {
    render(<NoViewerNote ext="drawio" />);
    expect(screen.getByText(/No viewer for \.drawio yet/)).toBeTruthy();
  });
});

describe('ImageViewer', () => {
  it('draws svg markup', async () => {
    vi.mocked(loadImage).mockResolvedValue({ kind: 'svg', xml: '<svg/>' });
    render(<ImageViewer path="a.svg" mime="image/svg+xml" />);
    expect(screen.getByRole('progressbar', { name: 'Loading image' })).toBeTruthy();
    const svg = await screen.findByTestId('svg-xml');
    expect(svg.getAttribute('data-xml')).toBe('<svg/>');
    expect(loadImage).toHaveBeenCalledWith('a.svg', 'image/svg+xml');
  });
  it('draws a raster by uri', async () => {
    vi.mocked(loadImage).mockResolvedValue({ kind: 'uri', uri: 'data:image/png;base64,AAAA' });
    render(<ImageViewer path="p/a.png" mime="image/png" />);
    expect(await screen.findByLabelText('a.png')).toBeTruthy();
  });
  it('reports a load failure', async () => {
    vi.mocked(loadImage).mockRejectedValue(new Error('gone'));
    render(<ImageViewer path="a.png" mime="image/png" />);
    expect((await screen.findByTestId('image-error')).textContent).toContain('gone');
  });
});

describe('FileContentView', () => {
  const noWrite = vi.fn();
  it('routes document kinds to their readers', () => {
    const { unmount } = render(<FileContentView path="n.md" content="# Hi" onWrite={noWrite} />);
    expect(screen.getByTestId('reader-markdown')).toBeTruthy();
    unmount();
    render(<FileContentView path="n.json" content="[]" onWrite={noWrite} />);
    expect(screen.getByTestId('reader-json')).toBeTruthy();
  });
  it('renders tile files as the tile and sends writes to onWrite', () => {
    const onWrite = vi.fn();
    render(<FileContentView path="x.travel.json" content="" onWrite={onWrite} />);
    expect(screen.getByTestId('tile-travel')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Add trip' }));
    fireEvent.change(screen.getByLabelText('Trip name'), { target: { value: 'Oslo' } });
    fireEvent.change(screen.getByLabelText('Start (YYYY-MM-DD)'), {
      target: { value: '2026-12-01' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save trip' }));
    expect(JSON.parse(onWrite.mock.calls[0]?.[0]).trips[0].title).toBe('Oslo');
  });
  it('falls back to the note for unknown kinds', () => {
    render(<FileContentView path="d.drawio" content="<x/>" onWrite={noWrite} />);
    expect(screen.getByTestId('no-viewer')).toBeTruthy();
  });
});
