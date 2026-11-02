import { describe, expect, it } from 'vitest';
import { businessCaptureFor } from './search-business';

const clients = ['acme-gmbh', 'beta-ag'];

describe('businessCaptureFor', () => {
  it.each([
    ['todo acme: send draft', 'Add todo for acme-gmbh: send draft'],
    ['log acme-gmbh: call with Jana', 'Log for acme-gmbh: call with Jana'],
    ['timer acme/website', 'Start timer for acme-gmbh/website'],
    ['timer beta', 'Start timer for beta-ag'],
    ['stop timer', 'Stop timer (opens form)'],
  ])('%s -> %s', (query, name) => {
    expect(businessCaptureFor(query, clients)?.name).toBe(name);
  });

  it('carries the parsed capture for the handler', () => {
    expect(businessCaptureFor('todo acme: x', clients)?.capture).toEqual({
      kind: 'todo',
      client: 'acme-gmbh',
      text: 'x',
    });
  });

  it('shows nothing for unknown clients or ordinary searches', () => {
    expect(businessCaptureFor('todo zeta: x', clients)).toBeNull();
    expect(businessCaptureFor('readme', clients)).toBeNull();
  });
});
