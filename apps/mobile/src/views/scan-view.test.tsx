import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setAppIntelligence } from '../intelligence/app-model.js';
import { ScanView } from './scan-view.js';

afterEach(() => {
  cleanup();
  setAppIntelligence({ model: null, recognizeDocument: async () => null });
});

describe('ScanView document camera', () => {
  it('shows the error when the scan fails instead of throwing', async () => {
    setAppIntelligence({
      model: null,
      recognizeDocument: async () => {
        throw new Error('The document camera is not available on this device.');
      },
    });
    render(<ScanView />);
    fireEvent.click(screen.getByTestId('scan-camera'));
    expect(
      await screen.findByText('The document camera is not available on this device.'),
    ).toBeTruthy();
  });

  it('shows an error when the bridge throws synchronously', async () => {
    setAppIntelligence({
      model: null,
      recognizeDocument: () => {
        throw new Error('boom');
      },
    });
    render(<ScanView />);
    fireEvent.click(screen.getByTestId('scan-camera'));
    expect(await screen.findByText('boom')).toBeTruthy();
  });
});
