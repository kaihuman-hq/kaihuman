import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const editor = vi.hoisted(() => ({ props: [] as Record<string, unknown>[] }));
vi.mock('@kaihuman/core', () => ({
  Logger: class {
    debug() {}
    error() {}
  },
  githubFileStore: { openFile: vi.fn(), openFiles: { value: {} } },
}));
vi.mock('@kaihuman/ui', () => ({ EncryptedTileWrapper: () => null }));
vi.mock('./editor/CodeMirrorEditor', () => ({
  CodeMirrorEditor: (props: Record<string, unknown>) => {
    editor.props.push(props);
    return <div data-testid="editor" />;
  },
}));

const { FileViewer } = await import('./FileViewer');

const ISSUED = '.kh/business/invoices/2026/RE-2026-0001.yaml';
let host: HTMLDivElement;
const show = (path: string, contentOverride?: string) => {
  editor.props = [];
  act(() => render(<FileViewer path={path} contentOverride={contentOverride} />, host));
};

beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
});
afterEach(() => {
  act(() => render(null, host));
  host.remove();
});

describe('FileViewer read-only mode', () => {
  it.each([
    ['store content', undefined],
    ['content override', 'a: 1'],
  ])('shows the banner, the Business link and a read-only editor for an issued file (%s)', (_n, override) => {
    show(ISSUED, override);
    expect(host.textContent).toContain(
      'Issued documents never change. To correct an invoice, issue a credit note from the client page.',
    );
    const link = host.querySelector('a');
    expect(link?.getAttribute('href')).toBe('/business');
    expect(link?.textContent).toBe('Open Business');
    expect(editor.props.at(-1)?.readOnly).toBe(true);
  });

  it('keeps ordinary files editable without a banner', () => {
    show('notes/a.md');
    expect(host.querySelector('a')).toBeNull();
    expect(host.querySelector('[role="note"]')).toBeNull();
    expect(editor.props.at(-1)?.readOnly).toBe(false);
  });
});
