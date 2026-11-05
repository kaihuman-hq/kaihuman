import { blake2b } from '@noble/hashes/blake2b';
import nacl from 'tweetnacl';
import { githubService } from '../services/github.service.js';

// ── VAPID key generation (Web Crypto, P-256) ─────────────────────────────────

function b64url(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

async function generateVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
  const kp = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveKey',
  ]);
  // Raw public key = uncompressed P-256 point (65 bytes)
  const rawPub = new Uint8Array(await crypto.subtle.exportKey('raw', kp.publicKey));
  // JWK 'd' field = raw 32-byte private scalar, already base64url-encoded
  const jwkPriv = (await crypto.subtle.exportKey('jwk', kp.privateKey)) as JsonWebKey;
  return { publicKey: b64url(rawPub), privateKey: jwkPriv.d as string };
}

// ── Encrypt a secret for the GitHub Secrets API (NaCl sealed box) ────────────
// GitHub uses libsodium crypto_box_seal which is:
//   eph_kp = X25519 keypair
//   nonce  = blake2b(eph_pk || recipient_pk, dkLen=24)
//   ct     = nacl.box(message, nonce, recipient_pk, eph_sk)
//   output = eph_pk || ct

function encryptForGitHub(value: string, repoKeyBase64: string): string {
  const recipientPK = Uint8Array.from(atob(repoKeyBase64), (c) => c.charCodeAt(0));
  const eph = nacl.box.keyPair();
  const nonce = blake2b(new Uint8Array([...eph.publicKey, ...recipientPK]), { dkLen: 24 });
  const msg = new TextEncoder().encode(value);
  const ct = nacl.box(msg, nonce, recipientPK, eph.secretKey);
  const out = new Uint8Array(eph.publicKey.length + ct.length);
  out.set(eph.publicKey);
  out.set(ct, eph.publicKey.length);
  return btoa(Array.from(out, (b) => String.fromCharCode(b)).join(''));
}

// ── File paths committed to the user's repo ──────────────────────────────────

const PUSH_CONFIG_PATH = '.kh/push-config.json';
const NOTIFY_SCRIPT_PATH = '.kh/push-notify.js';
const WORKFLOW_PATH = '.github/workflows/todo-reminders.yml';

// The notify script is intentionally CJS (no ES module syntax) so it runs
// directly with `node` without any build step inside the GitHub Action.
const NOTIFY_SCRIPT = `#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const webPush = require('web-push');

const configPath = path.join(process.cwd(), '.kh', 'push-config.json');
if (!fs.existsSync(configPath)) {
  console.log('No push-config.json found, skipping.');
  process.exit(0);
}

const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const vapidPrivateKey = process.env.VAPID_PUSH_PRIVATE_KEY;
if (!vapidPrivateKey) {
  console.error('VAPID_PUSH_PRIVATE_KEY secret is not set.');
  process.exit(1);
}

webPush.setVapidDetails('mailto:noreply@kaihuman.com', config.vapidPublicKey, vapidPrivateKey);

const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

function findTodoFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(function(e) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return findTodoFiles(full);
    return e.name.endsWith('.todos.md') ? [full] : [];
  });
}

function parseOverdueMilestones(content) {
  const fm = content.match(/---\\n([\\s\\S]*?)\\n---/);
  if (!fm) return [];
  const blocks = fm[1].split('\\n  - ').slice(1);
  const results = [];
  for (const block of blocks) {
    const nameM = block.match(/name:\\s*(.+)/);
    const dateM = block.match(/dueDate:\\s*(\\d{4}-\\d{2}-\\d{2})/);
    if (nameM && dateM) {
      const dueDate = dateM[1].trim();
      if (dueDate < today) results.push({ name: nameM[1].trim(), dueDate: dueDate });
    }
  }
  return results;
}

const overdue = findTodoFiles(path.join(process.cwd(), '.kh'))
  .flatMap(function(f) { return parseOverdueMilestones(fs.readFileSync(f, 'utf8')); });

if (!overdue.length) {
  console.log('No overdue milestones found.');
  process.exit(0);
}

const count = overdue.length;
const payload = JSON.stringify({
  title: count === 1 ? '1 overdue milestone' : (count + ' overdue milestones'),
  body: overdue.map(function(m) { return m.name + ' (due ' + m.dueDate + ')'; }).join(', '),
});

Promise.all(
  (config.subscriptions || []).map(function(sub) {
    return webPush.sendNotification(sub, payload).catch(function(err) {
      console.error('Failed to send notification (status ' + err.statusCode + '):', err.body);
      if (err.statusCode === 410) {
        console.log('Subscription expired — remove it from push-config.json:', sub.endpoint);
      }
    });
  })
).then(function() { console.log('Done.'); });
`;

const WORKFLOW_YAML = `name: Todo Reminders
on:
  schedule:
    # Runs at 07:00, 12:00, and 17:00 UTC every day
    - cron: '0 7,12,17 * * *'
  workflow_dispatch: # Also triggerable manually from the Actions tab

jobs:
  notify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm install web-push
      - name: Send overdue todo notifications
        env:
          VAPID_PUSH_PRIVATE_KEY: \${{ secrets.VAPID_PUSH_PRIVATE_KEY }}
        run: node .kh/push-notify.js
`;

// ── Public API ────────────────────────────────────────────────────────────────

export interface PushConfig {
  vapidPublicKey: string;
  subscriptions: PushSubscriptionJSON[];
}

export interface PushSetupResult {
  /** Whether the GitHub Actions workflow was committed to the repo. False when
   *  the token lacks the `workflow` OAuth scope — the user must add the file
   *  manually. Use `workflowYaml` to display the content. */
  workflowCreated: boolean;
  workflowYaml: string;
  workflowPath: string;
}

/**
 * One-shot setup:
 *  1. Requests notification permission.
 *  2. Reuses existing VAPID public key (multi-device) or generates a new pair.
 *  3. Subscribes this device, merges it into push-config.json in the repo.
 *  4. On first setup: stores the private key as a GitHub Actions Secret and
 *     commits the workflow + notification script.
 *
 * The private key never leaves GitHub Secrets — not stored in the repo file.
 * Returns a result indicating whether the workflow file was committed (requires
 * the `workflow` OAuth scope); if not, the caller should show the YAML for
 * manual setup.
 */
export async function setupPushNotifications(
  owner: string,
  repo: string,
): Promise<PushSetupResult> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    throw new Error('Push notifications are not supported in this browser.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error(
      'Notification permission was denied. Enable it in your browser settings and try again.',
    );
  }

  // Load existing config to reuse the VAPID public key across devices.
  let existingConfig: PushConfig | null = null;
  try {
    const { content } = await githubService.getFileContent(owner, repo, PUSH_CONFIG_PATH);
    existingConfig = JSON.parse(content);
  } catch {
    // File doesn't exist yet — this is the first setup.
  }

  let vapidPublicKey: string;
  const isFirstSetup = existingConfig === null;

  if (existingConfig) {
    // Reuse the existing key so other devices' subscriptions stay valid.
    vapidPublicKey = existingConfig.vapidPublicKey;
  } else {
    // Generate a fresh VAPID key pair and store the private key as a GitHub Secret.
    const keys = await generateVapidKeys();
    vapidPublicKey = keys.publicKey;

    const repoKey = await githubService.getActionsPublicKey(owner, repo);
    const encryptedPrivate = encryptForGitHub(keys.privateKey, repoKey.key);
    await githubService.setActionsSecret(
      owner,
      repo,
      'VAPID_PUSH_PRIVATE_KEY',
      encryptedPrivate,
      repoKey.key_id,
    );
  }

  // Decode VAPID public key for the browser Push API.
  const padded =
    vapidPublicKey.replace(/-/g, '+').replace(/_/g, '/') +
    '=='.slice((vapidPublicKey.length * 3) % 4 === 0 ? 4 : (vapidPublicKey.length * 3) % 4);
  const applicationServerKey = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));

  // Unsubscribe any existing subscription before creating a new one so we
  // always register a fresh, valid endpoint.
  const reg = await navigator.serviceWorker.ready;
  const oldSub = await reg.pushManager.getSubscription();
  if (oldSub) await oldSub.unsubscribe();

  const newSub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey,
  });
  const subJson = newSub.toJSON() as PushSubscriptionJSON;

  // Merge into subscriptions list (replace any entry with the same endpoint).
  const subscriptions = (existingConfig?.subscriptions ?? []).filter(
    (s) => s.endpoint !== subJson.endpoint,
  );
  subscriptions.push(subJson);

  // Merge into the CURRENT remote config at write time, so a subscription another device
  // added since `existingConfig` was read is kept.
  await githubService.upsertRepoFile(
    owner,
    repo,
    PUSH_CONFIG_PATH,
    (current) => {
      let remote: PushConfig | null = null;
      try {
        remote = current ? (JSON.parse(current) as PushConfig) : null;
      } catch {
        // Unreadable remote config: fall back to the subscriptions read earlier.
      }
      const others = (remote?.subscriptions ?? subscriptions).filter(
        (s) => s.endpoint !== subJson.endpoint,
      );
      const config: PushConfig = {
        vapidPublicKey: remote?.vapidPublicKey ?? vapidPublicKey,
        subscriptions: [...others, subJson],
      };
      return JSON.stringify(config, null, 2);
    },
    'Update push notification subscription',
  );

  let workflowCreated = !isFirstSetup; // already existed on non-first setup

  if (isFirstSetup) {
    await githubService.upsertRepoFile(
      owner,
      repo,
      NOTIFY_SCRIPT_PATH,
      NOTIFY_SCRIPT,
      'Add push notification script',
    );
    // Creating workflow files requires the `workflow` OAuth scope. Tokens with
    // only `repo` scope get a 404. Treat this as non-fatal and let the caller
    // show a manual-setup fallback.
    try {
      await githubService.upsertRepoFile(
        owner,
        repo,
        WORKFLOW_PATH,
        WORKFLOW_YAML,
        'Add todo reminder workflow',
      );
      workflowCreated = true;
    } catch {
      workflowCreated = false;
    }
  }

  return { workflowCreated, workflowYaml: WORKFLOW_YAML, workflowPath: WORKFLOW_PATH };
}

/** Returns whether this device currently has an active push subscription. */
export async function isPushEnabled(): Promise<boolean> {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    return sub !== null;
  } catch {
    return false;
  }
}
