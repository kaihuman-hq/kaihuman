import { buildDemoSeed } from '@kaihuman/core';
import type { BusinessRepo, Slug } from '@kaihuman/formats/business';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { type BusinessState, loadBusiness } from '../business/load.js';
import { invoiceRows, receivables } from '../business/summary.js';
import type { ContentFiles } from '../screens/file-editor-screen.js';
import { BusinessClientView } from './business-client-view.js';
import { BusinessPaymentSheet } from './business-payment-sheet.js';
import { BusinessTimeSheet } from './business-time-sheet.js';
import { BusinessView } from './business-view.js';

afterEach(cleanup);

const NOW = new Date(2026, 10, 11, 10, 0, 0);
const TODAY = '2026-11-11';
const NW = 'northwind-labs' as Slug;

let ready: Extract<BusinessState, { status: 'ready' }>;
let repo: BusinessRepo;

beforeAll(async () => {
  const contents = buildDemoSeed(NOW).files;
  const files = {
    tree: () => Object.keys(contents).map((path) => ({ path, type: 'blob', sha: '', url: '' })),
    read: async (p: string) => contents[p] as string,
  } as unknown as ContentFiles;
  const state = await loadBusiness(files);
  if (state.status !== 'ready') throw new Error('demo has no business');
  ready = state;
  repo = state.repo;
});

const noop = () => undefined;
const viewProps = {
  now: NOW,
  today: TODAY,
  onOpenClient: noop,
  onOpenInvoice: noop,
  onStartTimer: noop,
  onLogTime: noop,
  onStopTimer: noop,
  onCancelTimer: noop,
};

describe('BusinessView', () => {
  it('shows a spinner while loading and a hint when business is off', () => {
    const { rerender } = render(<BusinessView state={null} {...viewProps} />);
    expect(screen.getByLabelText('Loading business')).toBeTruthy();
    rerender(<BusinessView state={{ status: 'disabled' }} {...viewProps} />);
    expect(screen.getByText('Business is not set up')).toBeTruthy();
  });

  it('renders hours, clients and opens a client', () => {
    const onOpenClient = vi.fn();
    render(<BusinessView state={ready} {...viewProps} onOpenClient={onOpenClient} />);
    expect(screen.getByTestId('business-hours')).toBeTruthy();
    expect(screen.getByText('Clients')).toBeTruthy();
    fireEvent.click(screen.getByTestId(`business-client-${NW}`));
    expect(onOpenClient).toHaveBeenCalledWith(NW);
  });

  it('lists open invoices and opens the payment', () => {
    const open = receivables(invoiceRows(repo, TODAY))[0];
    if (!open) return;
    const onOpenInvoice = vi.fn();
    render(<BusinessView state={ready} {...viewProps} onOpenInvoice={onOpenInvoice} />);
    fireEvent.click(screen.getByTestId(`business-invoice-${open.number}`));
    expect(onOpenInvoice).toHaveBeenCalledWith(open.number);
  });

  it('starts a timer for a picked client', () => {
    const onStartTimer = vi.fn();
    const state = { ...ready, repo: { ...repo, timer: null } };
    render(<BusinessView state={state} {...viewProps} onStartTimer={onStartTimer} />);
    fireEvent.click(screen.getByTestId('business-start-timer'));
    fireEvent.click(screen.getByLabelText('Start timer for Northwind Labs GmbH'));
    expect(onStartTimer).toHaveBeenCalledWith(NW);
  });

  it('shows the running timer with stop and discard', () => {
    const onStopTimer = vi.fn();
    const onCancelTimer = vi.fn();
    const timer = { client: NW, started_at: new Date(NOW.getTime() - 90 * 60000).toISOString() };
    render(
      <BusinessView
        state={{ ...ready, repo: { ...repo, timer } }}
        {...viewProps}
        onStopTimer={onStopTimer}
        onCancelTimer={onCancelTimer}
      />,
    );
    expect(screen.getByTestId('business-timer').textContent).toContain('1.5 h');
    fireEvent.click(screen.getByTestId('business-stop-timer'));
    fireEvent.click(screen.getByTestId('business-cancel-timer'));
    expect(onStopTimer).toHaveBeenCalledOnce();
    expect(onCancelTimer).toHaveBeenCalledOnce();
  });

  it('warns when files could not be read', () => {
    render(<BusinessView state={{ ...ready, failed: ['.kh/business/x.yaml'] }} {...viewProps} />);
    expect(screen.getByTestId('business-failed').textContent).toContain('x.yaml');
  });
});

describe('BusinessClientView', () => {
  const clientProps = {
    today: TODAY,
    onAddLine: async () => true,
    onStartTimer: noop,
    onLogTime: noop,
    onOpenInvoice: noop,
    onOpenFile: noop,
  };

  it('shows the client and opens its files', () => {
    const onOpenFile = vi.fn();
    render(<BusinessClientView state={ready} slug={NW} {...clientProps} onOpenFile={onOpenFile} />);
    expect(screen.getByText('Northwind Labs GmbH')).toBeTruthy();
    expect(screen.getByTestId('business-client-summary').textContent).toContain('open');
    fireEvent.click(screen.getByTestId('business-client-file-todos'));
    expect(onOpenFile).toHaveBeenCalledWith(`.kh/business/clients/${NW}/todos.todos.md`);
  });

  it('says so for an unknown client', () => {
    render(<BusinessClientView state={ready} slug="ghost" {...clientProps} />);
    expect(screen.getByText('Client not found')).toBeTruthy();
  });

  it('adds a todo and clears the field', async () => {
    const onAddLine = vi.fn(async () => true);
    render(<BusinessClientView state={ready} slug={NW} {...clientProps} onAddLine={onAddLine} />);
    const input = screen.getByTestId('business-line-input') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Send the brief' } });
    fireEvent.click(screen.getByTestId('business-line-submit'));
    await waitFor(() => expect(onAddLine).toHaveBeenCalledWith('todo', 'Send the brief'));
    await waitFor(() => expect(input.value).toBe(''));
  });

  it('starts a timer on the chosen project', () => {
    const onStartTimer = vi.fn();
    const project = repo.projects.find((p) => p.client === NW && p.status !== 'done');
    render(
      <BusinessClientView
        state={{ ...ready, repo: { ...repo, timer: null } }}
        slug={NW}
        {...clientProps}
        onStartTimer={onStartTimer}
      />,
    );
    if (project) fireEvent.click(screen.getByLabelText(`Project ${project.name}`));
    fireEvent.click(screen.getByTestId('business-client-start-timer'));
    expect(onStartTimer).toHaveBeenCalledWith(project?.slug);
  });
});

describe('BusinessTimeSheet', () => {
  it('shows field errors and does not submit an empty form', async () => {
    const onSubmit = vi.fn(async () => true);
    render(
      <BusinessTimeSheet repo={repo} today={TODAY} now={NOW} onSubmit={onSubmit} onClose={noop} />,
    );
    fireEvent.click(screen.getByTestId('business-time-save'));
    await waitFor(() => expect(screen.getByText('Choose a client.')).toBeTruthy());
    expect(screen.getByText('Add a short note on what you did.')).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits the parsed entry', async () => {
    const onSubmit = vi.fn(async () => true);
    render(
      <BusinessTimeSheet
        repo={repo}
        today={TODAY}
        now={NOW}
        client={NW}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('business-time-hours'), { target: { value: '1:30' } });
    fireEvent.change(screen.getByTestId('business-time-note'), { target: { value: 'Workshop' } });
    fireEvent.click(screen.getByTestId('business-time-save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { client: NW, date: TODAY, minutes: 90, note: 'Workshop' },
        { stopTimer: false },
      ),
    );
  });

  it('prefills from the running timer and stops it', async () => {
    const onSubmit = vi.fn(async () => true);
    const timer = {
      client: NW,
      started_at: new Date(NOW.getTime() - 45 * 60000).toISOString(),
      note: 'Review',
    };
    render(
      <BusinessTimeSheet
        repo={{ ...repo, timer }}
        today={TODAY}
        now={NOW}
        fromTimer
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    expect(screen.getByText('Stop timer')).toBeTruthy();
    expect((screen.getByTestId('business-time-hours') as HTMLInputElement).value).toBe('0:45');
    fireEvent.click(screen.getByTestId('business-time-save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith(
        { client: NW, date: TODAY, minutes: 45, note: 'Review' },
        { stopTimer: true },
      ),
    );
  });
});

describe('BusinessPaymentSheet', () => {
  it('records the open amount when the field is left empty', async () => {
    const open = receivables(invoiceRows(repo, TODAY))[0];
    if (!open) throw new Error('demo has no open invoice');
    const onSubmit = vi.fn(async () => true);
    render(
      <BusinessPaymentSheet
        repo={repo}
        invoice={open.number}
        today={TODAY}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    expect(screen.getByTestId('business-payment-summary').textContent).toContain('open');
    fireEvent.click(screen.getByTestId('business-payment-save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        invoice: open.number,
        amount: open.status.open,
        date: TODAY,
      }),
    );
  });

  it('refuses a bad amount', async () => {
    const open = receivables(invoiceRows(repo, TODAY))[0];
    if (!open) throw new Error('demo has no open invoice');
    const onSubmit = vi.fn(async () => true);
    render(
      <BusinessPaymentSheet
        repo={repo}
        invoice={open.number}
        today={TODAY}
        onSubmit={onSubmit}
        onClose={noop}
      />,
    );
    fireEvent.change(screen.getByTestId('business-payment-amount'), { target: { value: 'lots' } });
    fireEvent.click(screen.getByTestId('business-payment-save'));
    await waitFor(() =>
      expect(screen.getByText('Enter an amount like 500 or 500.00.')).toBeTruthy(),
    );
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('says so for an unknown invoice', () => {
    render(
      <BusinessPaymentSheet
        repo={repo}
        invoice="NOPE"
        today={TODAY}
        onSubmit={vi.fn()}
        onClose={noop}
      />,
    );
    expect(screen.getByText('Invoice not found')).toBeTruthy();
  });
});
