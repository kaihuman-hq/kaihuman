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
  it('pages 50 rows at a time', () => {
    const rows = Array.from({ length: 120 }, (_, i) => `r${i},${i}`).join('\n');
    render(<CsvTable content={`k,v\n${rows}`} path="big.csv" />);
    expect(screen.getByText('120 rows')).toBeTruthy();
    expect(screen.getByText('1 / 3')).toBeTruthy();
    expect(screen.queryByText('r50')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.getByText('r50')).toBeTruthy();
    expect(screen.getByText('2 / 3')).toBeTruthy();
  });
  it('sorts by header tap, asc then desc', () => {
    render(<CsvTable content={'n,q\nb,10\na,9\nc,100\n'} path="a.csv" />);
    const order = () =>
      screen.getAllByRole('button', { name: /^Row / }).map((r) => r.textContent?.slice(0, 1));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by q' }));
    expect(order()).toEqual(['a', 'b', 'c']);
    fireEvent.click(screen.getByRole('button', { name: 'Sort by q' }));
    expect(order()).toEqual(['c', 'b', 'a']);
  });
  it('filters a column from the sheet', () => {
    render(<CsvTable content={'n,q\nbeta,1\nalpha,2\n'} path="a.csv" />);
    fireEvent.click(screen.getByTestId('csv-filter-button'));
    fireEvent.change(screen.getByLabelText('n'), { target: { value: 'alp' } });
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(screen.getByText('1 row')).toBeTruthy();
    expect(screen.queryByText('beta')).toBeNull();
  });
  it('opens every column of a row in a detail sheet', () => {
    render(<CsvTable content={'n,q\nbeta,1\n'} path="a.csv" />);
    fireEvent.click(screen.getByRole('button', { name: 'Row 1' }));
    expect(screen.getByTestId('csv-detail-sheet').textContent).toMatch(/nbeta\s*q1/);
  });
  it('strips bracket metadata and splits on ;', () => {
    render(<CsvTable content={'Amt[unit:EUR;x:y];Note\n5;hi\n'} path="a.csv" />);
    expect(screen.getByText('Amt')).toBeTruthy();
    expect(screen.getByText('hi')).toBeTruthy();
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
  it('toggles widget CSV files between tile and table', () => {
    render(
      <FileContentView
        path="m.budget.csv"
        content={'Date,Amount\n2026-01-01,5\n'}
        onWrite={noWrite}
      />,
    );
    expect(screen.queryByTestId('reader-csv')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Table' }));
    expect(screen.getByTestId('reader-csv')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Widget' }));
    expect(screen.queryByTestId('reader-csv')).toBeNull();
  });
  it('shows no toggle for non-CSV widget files', () => {
    render(<FileContentView path="x.travel.json" content="" onWrite={noWrite} />);
    expect(screen.queryByTestId('csv-look')).toBeNull();
  });
  it('falls back to the note for unknown kinds', () => {
    render(<FileContentView path="d.drawio" content="<x/>" onWrite={noWrite} />);
    expect(screen.getByTestId('no-viewer')).toBeTruthy();
  });
});
