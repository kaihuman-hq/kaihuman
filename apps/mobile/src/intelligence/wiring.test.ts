import { describe, expect, it } from 'vitest';
import { parseDeepLink, routeToUrl } from '../navigation/routes.js';
import { routeToHref } from '../runtime/pending-url.js';
import { startSmartCaptureDrain } from './drain.js';
import { SMART_CAPTURE_QUEUE_FILE } from './queue.js';
import { smartInbox } from './smart-inbox.js';
import { controllerFor, fakeModel, memFiles } from './test-helpers.js';

const now = new Date(2026, 10, 10, 9, 0);

describe('smartInbox', () => {
  it('saves the typed capture and says what it became', async () => {
    const files = memFiles({ 'habits/Run.habit.csv': '' });
    const model = fakeModel({ device: true, json: { kind: 'habit', text: 'run', tags: [] } });
    const res = await smartInbox('did my run', {
      controller: controllerFor(files, now),
      files,
      model,
      now,
    });
    expect(res).toMatchObject({ ok: true, message: 'Checked in Run (Habit · run)' });
  });

  it('keeps the plain inbox todo without a model', async () => {
    const files = memFiles();
    const res = await smartInbox('pay rent friday #money', {
      controller: controllerFor(files, now),
      files,
      model: null,
      now,
    });
    expect(res).toMatchObject({ ok: true, message: 'Todo added' });
    expect(files.data['.kh/inbox.todos.md']).toContain('- [ ] pay rent friday #money');
  });
});

describe('startSmartCaptureDrain', () => {
  it('drains once the tree has files, never twice at once', async () => {
    const shared: Record<string, string> = {
      [SMART_CAPTURE_QUEUE_FILE]: JSON.stringify([
        { text: 'a', capture: { kind: 'log', text: 'a', tags: [] } },
      ]),
    };
    let emit: (loaded: boolean) => void = () => {};
    const saved: string[] = [];
    const stop = startSmartCaptureDrain({
      store: {
        read: (n) => shared[n] ?? null,
        write: (n, c) => void Object.assign(shared, { [n]: c }),
      },
      onTree: (l) => {
        emit = l;
        return () => {};
      },
      save: async (c) => {
        saved.push(c.kind);
        return { ok: true };
      },
      now: () => now,
    });
    emit(false);
    emit(true);
    emit(true);
    await new Promise((r) => setTimeout(r, 0));
    expect(saved).toEqual(['log']);
    expect(shared[SMART_CAPTURE_QUEUE_FILE]).toBe('[]');
    stop();
  });
});

describe('deep links', () => {
  it('parses Visual Intelligence scan links and the weekly review', () => {
    const route = parseDeepLink('kaihuman://scan?kind=budget&text=Migros%2012.00');
    expect(route).toEqual({ name: 'scan', kind: 'budget', text: 'Migros 12.00' });
    expect(parseDeepLink('kaihuman://scan?kind=nope')).toEqual({ name: 'scan' });
    expect(parseDeepLink('kaihuman://weekly-review')).toEqual({ name: 'weekly-review' });
    if (route?.name !== 'scan') throw new Error('scan route');
    expect(parseDeepLink(routeToUrl(route))).toEqual(route);
    expect(routeToHref(route)).toBe('/scan?kind=budget&text=Migros%2012.00');
    expect(routeToHref({ name: 'weekly-review' })).toBe('/weekly-review');
  });
});
