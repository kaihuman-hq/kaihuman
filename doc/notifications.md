# Todo reminders and push notifications: study and proposal

Status: proposal only. Nothing in this document is implemented yet (2026-10-12).

## Goal

Replace TickTick for todos. The blocking feature is **reminders that arrive on time**:

- On the iPhone, as normal iOS notifications, also when the console is closed.
- On the desktop, in the installed console PWA, also when its window is closed (as far as the
  platform allows it).
- A reminder fires within about one minute of the time set on the todo.
- One reminder fires once per device, never twice, and stops when the todo is done.

**Not in scope:** an iOS home screen widget. A PWA cannot provide a widget (see
[The iOS widget](#the-ios-widget)); this document only says what comes closest.

## What exists today

kaihuman already has a push path, but it cannot do reminders:

| Part | Where | What it does |
| --- | --- | --- |
| Setup | `packages/core/src/utils/push-notifications.ts` (`setupPushNotifications`), Settings → NOTIFICATIONS | Makes a VAPID key pair in the browser, stores the private key as the Actions secret `VAPID_PUSH_PRIVATE_KEY`, subscribes the device and writes `.kh/push-config.json` (`{ vapidPublicKey, subscriptions[] }`) |
| Sender | `.kh/push-notify.js` + `.github/workflows/todo-reminders.yml` in the data repo | Runs at 07:00, 12:00 and 17:00 UTC and sends "N overdue milestones" |
| Service worker | `apps/console/vite.config.ts` (`vite-plugin-pwa`, `generateSW`) | Workbox precache only |

Problems in the current path:

1. **The service worker has no `push` handler.** The generated worker never calls
   `showNotification`. Chrome then shows a generic "This site has been updated in the background"
   message. On iOS and Safari, a push that does not show a notification counts against the site,
   and after a few such pushes the subscription is revoked. The payload `{title, body}` is not in
   the declarative format either (see below). **The current notifications most likely do not
   arrive on iOS at all.** This is inferred from the code and was not tested on a device.
2. **Only milestones have dates, and only a day.** Single todos have no due date, no time and no
   repeat (`TodoItem` in `packages/formats/src/todos.ts`).
3. **GitHub Actions cron cannot be on time.** Scheduled runs are best-effort and often run 5–30+
   minutes late, more around the full hour. On private repos each run costs at least one billed
   minute: one run every 5 minutes is about 8,600 minutes a month, but the free plan has 2,000.
4. **Committing the workflow needs the `workflow` scope**, but the auth worker asks for `repo`
   only, so most users get the "copy this YAML" fallback.
5. The script has its own copy of the parser instead of `@kaihuman/formats`. It also never removes
   expired (410) subscriptions.

Conclusion: keep the idea (Web Push, VAPID, one subscription per device), but replace the sender
and fix the service worker.

## Platform research: what can a PWA do in 2026?

### Ways to show a notification at a given time

| Mechanism | iOS (Home Screen app) | Android Chrome | Desktop Chrome/Edge | Desktop Safari | Server needed | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| **Web Push (VAPID)** | Yes, iOS 16.4+; installed app only | Yes | Yes, while the browser process runs | Yes, macOS 13+; web apps from "Add to Dock" too | Yes | **The only reliable way** |
| **Declarative Web Push** | Yes, iOS/iPadOS 18.4+ | Not yet; falls back to the service worker | Same as Android | macOS 15.5+ | Yes | Use its payload format: it is backwards compatible |
| Notification Triggers (`showTrigger`) | No | No | Origin trial ended, never shipped | No | No | Dead end |
| Periodic Background Sync | No | Installed only, ≥12 h, engagement-based | Same | No | No | Too coarse, not on iOS |
| `setTimeout` / `new Notification()` in the page | Only while the app is open | Same | Same | Same | No | Only as a "while open" extra |
| Calendar feed (`.ics` with `VALARM`) | Calendar app, not the PWA | Depends on app | Depends on app | Calendar.app | Static file | Fallback, see [Alternatives](#alternatives-without-web-push) |
| ntfy / Pushover | Their app, not the PWA | Their app | Their app | Their app | Their server | Fallback |

There is no way for a PWA to schedule a local notification without a server. So **some server
must send a Web Push at the right minute**. This is the part the Cloudflare Worker does.

### iOS details that drive the design

- Push works only for a **Home Screen web app** (Share → Add to Home Screen). From iOS 26 every site
  added to the Home Screen opens as a web app by default. In a Safari tab there is no push.
- `Notification.requestPermission()` must run in a **user gesture** (a button press). The existing
  Settings → Enable button meets this.
- Every push must show a notification. **Declarative Web Push** (iOS 18.4+) guarantees this. The
  system shows the notification from the JSON itself, without starting the service worker:

  ```json
  {
    "web_push": 8030,
    "notification": {
      "title": "Call the dentist",
      "body": "Due 09:00 · inbox",
      "navigate": "https://app.kaihuman.com/todos?file=.kh/inbox.todos.md&id=abc123",
      "tag": "todo-abc123",
      "silent": false,
      "app_badge": "3"
    }
  }
  ```

  Browsers without declarative support pass the same JSON to the service worker `push` event,
  which calls `showNotification` with the same fields. **So one payload format works everywhere.**
- `app_badge` sets the number on the app icon (Badging API). "Todos due today" on the icon is the
  closest a PWA gets to the TickTick widget.
- Action buttons on notifications (Done, Snooze) are **not shown on iOS**. They work on Android and
  desktop Chrome. Tapping the notification opens `navigate`, so Done and Snooze must be one tap in
  the opened view.
- Subscriptions are per origin and per VAPID key. Changing the VAPID key means every device must
  subscribe again. Pick the key once per sender and keep it.
- Apple rejects a VAPID JWT with an invalid `sub`. Use a real `mailto:` or `https:` contact.
- Delivery is by APNs. Focus modes and notification summaries apply as for native apps.

### Desktop details

- **Chrome/Edge (installed PWA or tab):** pushes arrive while the browser process runs, and the
  PWA window does not need to be open. On macOS Chrome keeps running after the last window closes
  (until ⌘Q). On Windows it depends on Chrome's background mode. On Linux Chrome usually exits with
  its last window. Pushes sent while the browser is closed are queued by the push service for the
  message `TTL` and appear on the next start. Set `TTL` to a few hours so a late reminder still
  arrives but a stale one does not.
- **Safari on macOS (Add to Dock web app):** pushes arrive through the system even when the web
  app and Safari are closed. The app has its own entry in System Settings → Notifications and
  gets a Dock badge. **This is the best desktop experience on a Mac.**
- **Firefox:** pushes arrive only while Firefox runs. Firefox has no installable PWA.
- **Linux (Hyprland):** a browser has to run. As an extra, the existing desktop palette daemon
  (Tauri) could show native notifications from the same schedule. That is optional and comes
  later.

## Architecture options for the sender

Two separate questions:

- **A. Who sends at the right minute?** (the sender)
- **B. Who knows which reminders exist?** (the schedule source)

### A. The sender

| Option | On time | Cost | Ops | Notes |
| --- | --- | --- | --- | --- |
| A1. GitHub Actions cron (today) | No (minutes to hours late) | Free only for 1–3 runs/day on private repos | None | Good for a daily digest only |
| A2. Cloudflare Worker, cron every minute + D1/KV query | ±1 min | Free plan | Low | Polls 1,440×/day even with nothing to send |
| **A3. Cloudflare Worker + one Durable Object per user, with an alarm** | **To the second** | Free plan (SQLite-backed DOs are free) | Low | The alarm wakes the object at the next due time. Nothing runs between reminders. |
| A4. Own Node server / VPS | Exact | VPS | High | Not needed |

**Recommendation: A3.** Each user (or each self-hosted deployment) gets one Durable Object. It
holds that user's subscriptions and upcoming reminders in its SQLite storage. It keeps exactly one
alarm, at the earliest reminder. When the alarm fires it sends everything due (up to 30 s ahead),
marks those as sent, and sets the alarm to the next one. Durable Objects run one request at a time,
so a reminder cannot fire twice.

Web Push sending (VAPID ES256 JWT, RFC 8292; payload encryption `aes128gcm`, RFC 8291) uses only
Web Crypto, which Workers have. There are small libraries made for Workers (`pushforge`,
`web-push-neo`, `web-push-browser`). By the repo's dependency policy, writing it in the repo
(about 150 lines) is also reasonable. The browser half of VAPID key handling already exists in
`push-notifications.ts`.

### B. The schedule source

| Option | Sees edits from CLI / GitHub web / palette | Worker holds a GitHub token | Fits "we store no tokens" (privacy policy) |
| --- | --- | --- | --- |
| **B1. The console sends the schedule.** Each time it saves or loads a `*.todos.md`, it computes the next reminders and `PUT`s them to the worker | Only after the console next opens | No | **Yes** |
| B2. GitHub webhook → worker reads the repo | Yes, within seconds | Yes, a read-only fine-grained token | Only when self-hosted (it is the user's own secret in their own account) |
| B3. GitHub Action on `push` → `PUT` to the worker | Yes, within ~1 min | No (the Action has the repo already) | Yes, but needs the `workflow` scope, and costs a billed minute per push |

**Recommendation: B1 first, B2 as an option for self-hosters.**

- B1 covers the main case. Todos with reminders are almost always created or changed in the
  console (desktop or phone), and the console already has the parsed data
  (`@kaihuman/formats`).
- The CLI and the extension can call the same `PUT` later. They write todos through the same
  `packages/formats` code.
- B2 makes edits from anywhere count, for users who are fine with storing one read-only token in
  their own Worker. The worker imports `@kaihuman/formats`, so there is one parser, not a third
  copy. The webhook is created by the console with the existing `repo` scope (repo hooks are
  covered by it).

### Identity without storing a token (hosted mode)

The worker has to know whose Durable Object a request is for. The console already has a GitHub
token. On each `PUT`, it sends the token in `Authorization`. The worker calls `GET /user` once,
uses the numeric GitHub user id as the Durable Object name, and **drops the token**. This is the
same "used, never stored" rule the auth worker follows. For self-hosting, an `ALLOWED_GITHUB_USERS`
variable limits the worker to its owner.

### Optional: the server never sees the todo text

Web Push payloads are encrypted for each subscription with its `p256dh` and `auth` keys. The
console knows these keys for all devices (they are in `.kh/push-config.json`). So in B1 the
console can **encrypt every payload itself** and send the worker only `{at, endpoint,
ciphertext}`. The worker adds the VAPID JWT and posts it. The hosted worker then never stores todo
titles. The cost is one ciphertext per reminder per device, and B2 cannot use it. This is
recommended for the hosted instance and not needed when self-hosted.

## Proposed design

### 1. Todo syntax: due time, reminder, repeat

Extend the existing metadata line of a todo (where `::updated::` and `::created::` already are).
Old files stay valid, and parsers that do not know the new keys ignore them:

```
- [ ] Call the dentist #health
  ::due:: 2026-10-14T09:00 ::remind:: -15m
- [ ] Water the plants
  ::due:: 2026-10-13T18:00 ::repeat:: weekly
- [ ] Pay rent
  ::due:: 2026-11-01 ::remind:: 08:30 ::repeat:: monthly
```

| Key | Value | Meaning |
| --- | --- | --- |
| `::due::` | `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm` | Local wall time, no zone. A date with no time is due all day. |
| `::remind::` | `-15m`, `-1h`, `-1d`, `HH:mm`, or a list `-1d,-15m` | When to notify. Default: at the due time if there is one; for all-day todos at the daily time from settings |
| `::repeat::` | `daily`, `weekdays`, `weekly`, `monthly`, `yearly`, `every 3d` | When the todo is done, the console writes the next occurrence (same as TickTick) |

- The time zone is one value in `.kh/notifications.json` (`{"timeZone": "Europe/Berlin",
  "allDayReminder": "09:00", "quietHours": null}`). The console fills it from
  `Intl.DateTimeFormat().resolvedOptions().timeZone`. Times in files are local, so they read well in
  GitHub and in the CLI and do not change with travel or DST.
- Milestone `dueDate` keeps working and can get an optional reminder later.
- `packages/formats` gets parse, serialize and "next occurrences" functions with tests. The
  console's todo editor gets a Carbon `DatePicker` + `TimePicker` and a reminder/repeat menu.

### 2. Worker: `apps/notify-worker`

A new Cloudflare Worker next to `apps/auth-worker`, in the same style (Wrangler, no build step,
README with self-host steps).

```
console (PWA) ──PUT /schedule──▶ Worker ──▶ Durable Object "user:<github-id>"
     ▲                                         │  SQLite: subscriptions, reminders
     │                                         │  alarm = next reminder
     └──── notification ◀── APNs / FCM / Mozilla ◀──┘  POST <endpoint> (VAPID + aes128gcm)
```

| Route | Purpose |
| --- | --- |
| `GET /vapid` | The deployment's VAPID public key (the console subscribes with it) |
| `POST /subscriptions` / `DELETE /subscriptions` | Add or remove this device's subscription |
| `PUT /schedule` | Replace the reminders of one file: `{file, reminders: [{id, at (UTC ms), title, body, url}]}`. Per file, so two devices editing different files do not overwrite each other |
| `POST /test` | Send a test notification now (Settings → "Send test") |
| `POST /snooze` | Move one reminder by N minutes (from the opened view; on Android/desktop also from an action button) |
| `POST /github` | B2 only: GitHub `push` webhook, checked by HMAC (`X-Hub-Signature-256`) |
| cron (daily, optional) | Re-reads the repo in B2 mode, and sends a morning digest ("5 todos today") if enabled |

Durable Object behaviour:

- `alarm()`: select reminders with `at <= now + 30 s` and `sent = 0`, send to all subscriptions,
  set `sent = 1`, and call `setAlarm(min(at))` for the rest.
- On `404`/`410` from a push endpoint, delete that subscription (today these are only logged).
- Headers: `TTL: 14400` (4 h), `Urgency: high`, `Topic: todo-<id>`. With `Topic`, a snooze
  replaces a pending message instead of adding a second one.
- The console sends a horizon of 30 days of occurrences (repeats expanded). It refreshes it on
  every app open, so a repeat never runs out while the app is in use.

Configuration (Wrangler secrets and vars):

| Name | Kind | Purpose |
| --- | --- | --- |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | secret | Made once with a script in the app (`pnpm run vapid`) |
| `VAPID_SUBJECT` | var | `mailto:you@example.com` (Apple requires a valid one) |
| `APP_URL` | var | CORS origin and base of `navigate` links |
| `ALLOWED_GITHUB_USERS` | var | Self-host: who may use it. Empty = anyone (hosted) |
| `GITHUB_READ_TOKEN`, `GITHUB_WEBHOOK_SECRET` | secret | B2 only |

Self-hosting is the same as for the auth worker: `wrangler login`, set the secrets,
`pnpm run deploy`. Then in the console: Settings → Notifications → "Notification server" =
`https://notify.<your-domain>` (default `https://notify.kaihuman.com`). The Free plan is enough
for one person: a few hundred requests and alarms a day, against a limit of 100,000 requests a
day.

### 3. Console changes

- **Service worker:** switch `vite-plugin-pwa` to `strategies: 'injectManifest'` (or keep
  `generateSW` and use `workbox.importScripts: ['push-sw.js']`), with:
  - `push`: parse the declarative JSON and call `showNotification(title, {body, tag, data:
    {navigate}, badge, actions})`; set `navigator.setAppBadge(app_badge)`.
  - `notificationclick`: focus an open console window or open `navigate`; handle Snooze on
    platforms that show actions.
- **Subscribing:** on iOS 18.4+ and macOS Safari, `window.pushManager` exists without the service
  worker. Use the service worker registration everywhere else. Store the subscription in the
  worker and keep `.kh/push-config.json` as the device list (needed for end-to-end payload
  encryption).
- **Settings → Notifications:**
  - Server URL
  - Enable on this device
  - Send test
  - Daily digest time
  - All-day reminder time
  - Quiet hours
  - A short iOS hint: "Add to Home Screen first". Show it when
    `navigator.standalone === false` on iOS.
- **In-app:** while the console is open, also show due reminders with a Carbon toast. This costs
  nothing and covers browsers without push.
- **Badge:** `navigator.setAppBadge(dueToday)` on every load and with each push.
- **Migration:** "Enable" moves existing users to the worker. Settings offers to delete
  `.kh/push-notify.js` and the workflow. The workflow stays a documented "no server" mode for a
  daily digest, using the same payload format.

## The iOS widget

A web app cannot add a home screen or lock screen widget. WidgetKit needs a native app. What is
possible:

1. **Badge with the number of todos due today** (above). Small but always visible.
2. **Home screen shortcuts:** the existing `manifest-quick-*.webmanifest` icons (quick todo and
   others) already open one view directly.
3. **Scriptable or Shortcuts widget** (no App Store work): a small Scriptable script that reads
   today's todos from the worker (`GET /today`, a read-only token per device) and shows them. A
   tap opens the console. It can be documented, not built.
4. **Later, a native shell:** a small Swift app with WidgetKit that reads the same `GET /today`.
   This needs an Apple developer account and is out of scope here.

## Alternatives without Web Push

For completeness. None of these puts notifications into the kaihuman app itself.

- **ntfy (ntfy.sh or self-hosted):** the worker or the console posts to a secret topic. ntfy can
  delay a message (`At:` header), so even the console alone could schedule reminders. There are
  native apps for iOS, Android and desktop. Downsides: a second app, and the topic name is the only
  secret. A good fallback channel: the worker could post to Web Push and/or ntfy.
- **Calendar feed:** the worker serves `/calendar.ics` with one event and one `VALARM` per todo
  with a due time, subscribed in iOS Calendar. There is no server push, but iOS refreshes
  subscribed calendars only every 15 min to hours, and alarms of subscribed calendars can be turned
  off by the "Remove Alerts" setting. Nice as a view in the calendar, not reliable for reminders.
- **Email** (Cloudflare Email Workers or Gmail): reliable, but it is not a notification.

## Plan

Each phase can be shipped on its own.

0. **Fix what exists.** Add the `push`/`notificationclick` service worker handlers and the
   declarative payload format to the current Action script, and remove 410 subscriptions.
   → verify: "Send test" from the Action (`workflow_dispatch`) shows a notification on an iPhone
   Home Screen app and in desktop Chrome.
1. **Todo dates.** Add `::due::`, `::remind::` and `::repeat::` to `packages/formats` (tests:
   parse, round-trip, next occurrence across DST), plus the editor UI and a "Due" view/sort.
   → verify: vitest; old files round-trip unchanged.
2. **`apps/notify-worker`** with a Durable Object, alarm and VAPID sender. The console subscribes
   and sends the schedule (B1), with Settings, test button, in-app toasts and badge.
   → verify: unit tests for the scheduler and JWT/encryption against RFC 8291 test vectors;
   `wrangler dev` end to end with a Chrome subscription; on-device test on iOS (exact fire time,
   app closed, phone locked).
3. **Self-host package:** README, `pnpm run vapid`, server URL setting, optional B2 webhook mode.
4. **Extras:** Snooze/Done, daily digest, quiet hours, ntfy channel, end-to-end payload encryption
   for the hosted instance, CLI `PUT /schedule`, Scriptable widget doc.

## Open questions

1. **Hosted or self-hosted first?** One `notify.kaihuman.com` for everyone (B1 with
   end-to-end-encrypted payloads), or only a self-host worker in this repo (B1 + B2, simpler,
   plain-text payloads)?
2. **Edits outside the console:** is "reminders update when the console next opens" acceptable,
   or are edits from the CLI, palette and GitHub web needed at once (B2 with a stored read-only
   token)?
3. **Syntax:** `::due::`/`::remind::`/`::repeat::` on the metadata line, or something shorter
   inline in the title (`@2026-10-14 09:00`, like TickTick's quick-add)? Inline is faster to type,
   but harder to keep apart from the text.
4. **Repeats:** are the fixed set (daily/weekdays/weekly/monthly/yearly/every N days) enough, or is
   an RRULE needed?
5. **Desktop:** which browser do you use on the desktop? On a Mac, Safari "Add to Dock" gives
   system notifications while it is closed. On Linux a browser has to run, or the palette daemon
   shows them.
6. **The current Action path:** remove it after the migration, or keep it as a documented
   "no server" daily digest?

## Sources

- WebKit: [Meet Declarative Web Push](https://webkit.org/blog/16535/meet-declarative-web-push/),
  [WebKit Features in Safari 18.4](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/)
- [Web Apps in iOS 26 (Michael Tsai)](https://mjtsai.com/blog/2025/10/03/web-apps-in-ios-26/)
- [Pushpad: iOS special requirements for web push](https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications)
- [Chrome: Notification Triggers API](https://developer.chrome.com/docs/web-platform/notification-triggers)
  (origin trial complete, launch not started)
- [Apple: Use Safari web apps on Mac](https://support.apple.com/en-au/104996)
- Cloudflare: [Durable Objects release notes](https://developers.cloudflare.com/durable-objects/release-notes/)
  (SQLite-backed DOs on the Free plan),
  [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)
- Workers-ready Web Push libraries: [pushforge](https://github.com/draphy/pushforge),
  [web-push-neo](https://github.com/ryoppippi/web-push-neo);
  [Web Push from a Cloudflare Worker](https://dev.to/mfauveau/waking-a-dead-service-worker-with-web-push-from-a-cloudflare-worker-1jnm)
- RFC 8030 (Web Push), RFC 8291 (message encryption), RFC 8292 (VAPID)
