import { describe, expect, it } from 'vitest';
import { loadFixtureRepo } from '../fixture-repo.test-helper.js';
import type { Slug } from '../ids.js';
import { TIMER_PATH } from '../paths.js';
import { loadBusinessRepo } from '../repo.js';
import { buildCapture, isCaptureContextPath, isCaptureWritePath, parseCapture } from './capture.js';

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

describe('capture files', () => {
  it('reads only the profile, clients, projects and the timer for context', () => {
    expect(isCaptureContextPath('.kh/business/business.yaml')).toBe(true);
    expect(isCaptureContextPath('.kh/business/clients/acme-gmbh/client.yaml')).toBe(true);
    expect(isCaptureContextPath('.kh/business/clients/acme-gmbh/projects/website.yaml')).toBe(true);
    expect(isCaptureContextPath(TIMER_PATH)).toBe(true);
    expect(isCaptureContextPath('.kh/business/clients/acme-gmbh/notes.md')).toBe(false);
    expect(isCaptureContextPath('.kh/business/time/2026-11.jsonl')).toBe(false);
  });

  it('writes only a client todo list, a client log and the timer', () => {
    expect(isCaptureWritePath('.kh/business/clients/acme-gmbh/todos.todos.md')).toBe(true);
    expect(isCaptureWritePath('.kh/business/clients/acme-gmbh/log.actionlog.md')).toBe(true);
    expect(isCaptureWritePath(TIMER_PATH)).toBe(true);
    expect(isCaptureWritePath('.kh/business/clients/acme-gmbh/client.yaml')).toBe(false);
    expect(isCaptureWritePath('.kh/business/clients/../todos.todos.md')).toBe(false);
    expect(isCaptureWritePath('work/inbox.todos.md')).toBe(false);
  });
});

describe('buildCapture', () => {
  const repo = loadBusinessRepo(loadFixtureRepo());
  const client = 'acme-gmbh' as Slug;
  const now = new Date('2026-11-03T09:00:00Z');

  it('appends a todo to the client list and keeps the existing text byte for byte', () => {
    const built = buildCapture(repo, { kind: 'todo', client, text: 'send draft' }, '# Acme\n', now);
    expect(built).toMatchObject({
      ok: true,
      value: {
        path: '.kh/business/clients/acme-gmbh/todos.todos.md',
        message: 'business: todo for acme-gmbh',
      },
    });
    if (!built.ok) return;
    expect(built.value.content.startsWith('# Acme\n')).toBe(true);
    expect(built.value.content).toContain('send draft');
  });

  it('starts a log file and the timer as the console does', () => {
    const log = buildCapture(repo, { kind: 'log', client, text: 'called Jana' }, null, now);
    expect(log).toMatchObject({
      ok: true,
      value: { path: '.kh/business/clients/acme-gmbh/log.actionlog.md' },
    });
    if (log.ok) expect(log.value.content).toContain('called Jana');
    const timer = buildCapture(
      repo,
      { kind: 'start-timer', client, project: 'website' as Slug },
      null,
      now,
    );
    expect(timer).toMatchObject({
      ok: true,
      value: { path: TIMER_PATH, message: 'business: start timer for acme-gmbh' },
    });
    if (timer.ok) expect(timer.value.content).toContain('project: website');
  });

  it('refuses a running timer, an unknown project and an unknown client', () => {
    expect(buildCapture(repo, { kind: 'start-timer', client }, 'client: acme-gmbh\n', now).ok).toBe(
      false,
    );
    expect(
      buildCapture(repo, { kind: 'start-timer', client, project: 'nope' as Slug }, null, now).ok,
    ).toBe(false);
    expect(
      buildCapture(repo, { kind: 'todo', client: 'zeta' as Slug, text: 'x' }, null, now).ok,
    ).toBe(false);
  });
});
