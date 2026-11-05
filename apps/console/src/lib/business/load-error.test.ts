import { describe, expect, it } from 'vitest';
import { parseLoadError } from './load';

describe('parseLoadError', () => {
  it('splits path and message at the first ": "', () => {
    expect(parseLoadError('.kh/business/clients/a/client.yaml: offline: again')).toEqual({
      path: '.kh/business/clients/a/client.yaml',
      message: 'offline: again',
    });
  });

  it('treats an entry without a separator as a bare path', () => {
    expect(parseLoadError('.kh/business/x.yaml')).toEqual({
      path: '.kh/business/x.yaml',
      message: '',
    });
  });
});
