import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InMemoryGithubService } from '../services/github.service.memory.js';

vi.mock('../services/github.service.js', async () => {
  const { InMemoryGithubService } = await import('../services/github.service.memory.js');
  return { githubService: new InMemoryGithubService() };
});

import { githubService } from '../services/github.service.js';
import { setupPushNotifications } from './push-notifications.js';

const remote = githubService as unknown as InMemoryGithubService;
const CONFIG = '.kh/push-config.json';
const config = (vapidPublicKey: string) =>
  JSON.stringify({ vapidPublicKey, subscriptions: [{ endpoint: 'other-device' }] });

beforeEach(() => {
  vi.stubGlobal('Notification', { requestPermission: async () => 'granted' });
  vi.stubGlobal('PushManager', class {});
  const pushManager = {
    getSubscription: async () => null,
    subscribe: async () => ({ toJSON: () => ({ endpoint: 'this-device' }) }),
  };
  Object.defineProperty(navigator, 'serviceWorker', {
    value: { ready: Promise.resolve({ pushManager }) },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('setupPushNotifications', () => {
  it('rejects, without writing, when another device changed the VAPID key meanwhile', async () => {
    remote.load({ [CONFIG]: config('BBBB') }, []);
    // This device read the config before the other device rewrote it with a new key.
    vi.spyOn(remote, 'getFileContent').mockResolvedValueOnce({
      content: config('AAAA'),
      sha: 'old',
    });

    await expect(setupPushNotifications('o', 'r')).rejects.toThrow(/another device/i);
    expect((await remote.getFileContent('o', 'r', CONFIG)).content).toBe(config('BBBB'));
  });

  it('does not treat a failed config read as a first setup', async () => {
    remote.load({ [CONFIG]: config('AAAA') }, []);
    vi.spyOn(remote, 'getFileContent').mockRejectedValueOnce(
      Object.assign(new Error('Server error'), { status: 500 }),
    );
    const secret = vi.spyOn(remote, 'setActionsSecret');

    await expect(setupPushNotifications('o', 'r')).rejects.toThrow('Server error');
    expect(secret).not.toHaveBeenCalled();
  });

  it('adds this device to an existing config with the same key', async () => {
    remote.load({ [CONFIG]: config('AAAA') }, []);
    await setupPushNotifications('o', 'r');
    expect(JSON.parse((await remote.getFileContent('o', 'r', CONFIG)).content)).toEqual({
      vapidPublicKey: 'AAAA',
      subscriptions: [{ endpoint: 'other-device' }, { endpoint: 'this-device' }],
    });
  });
});
