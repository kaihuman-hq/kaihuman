import { describe, expect, it } from 'vitest';
import { parseCapture } from './capture.js';

const clients = ['acme-gmbh', 'beta-ag', 'acorn-co'];

describe('parseCapture', () => {
  it('reads a todo and a log for an exact slug', () => {
    expect(parseCapture('todo acme-gmbh: send draft', clients)).toEqual({
      kind: 'todo',
      client: 'acme-gmbh',
      text: 'send draft',
    });
    expect(parseCapture('log beta-ag: call with Jana', clients)).toEqual({
      kind: 'log',
      client: 'beta-ag',
      text: 'call with Jana',
    });
  });

  it('accepts a unique prefix and returns the full slug', () => {
    expect(parseCapture('todo acme: send draft', clients)).toEqual({
      kind: 'todo',
      client: 'acme-gmbh',
      text: 'send draft',
    });
    expect(parseCapture('timer be', clients)).toEqual({ kind: 'start-timer', client: 'beta-ag' });
  });

  it('prefers an exact slug over longer slugs that start with it', () => {
    expect(parseCapture('todo acme: x', ['acme', 'acme-gmbh'])).toMatchObject({ client: 'acme' });
  });

  it('refuses an ambiguous prefix, an unknown client and missing text', () => {
    expect(parseCapture('todo ac: send draft', clients)).toBeNull();
    expect(parseCapture('todo zeta: send draft', clients)).toBeNull();
    expect(parseCapture('timer zeta', clients)).toBeNull();
    expect(parseCapture('todo acme-gmbh:', clients)).toBeNull();
    expect(parseCapture('log acme-gmbh:   ', clients)).toBeNull();
    expect(parseCapture('todo acme-gmbh send draft', clients)).toBeNull();
  });

  it('starts a timer, with an optional project', () => {
    expect(parseCapture('timer acme-gmbh', clients)).toEqual({
      kind: 'start-timer',
      client: 'acme-gmbh',
    });
    expect(parseCapture('timer acme/website', clients)).toEqual({
      kind: 'start-timer',
      client: 'acme-gmbh',
      project: 'website',
    });
    expect(parseCapture('timer acme-gmbh/', clients)).toBeNull();
  });

  it('stops the timer', () => {
    expect(parseCapture('stop timer', clients)).toEqual({ kind: 'stop-timer' });
    expect(parseCapture('  Stop   Timer ', [])).toEqual({ kind: 'stop-timer' });
  });

  it('ignores anything else', () => {
    expect(parseCapture('', clients)).toBeNull();
    expect(parseCapture('todo', clients)).toBeNull();
    expect(parseCapture('timers acme-gmbh', clients)).toBeNull();
    expect(parseCapture('open file', clients)).toBeNull();
  });
});
