# Console views

The web console's main layout, `MainApp` in `packages/ui/src/LifeOS/Layouts/MainApp.tsx`, has views beyond the dashboard and files: a knowledge graph, commit history, a local AI chat panel, a scratch "quick dump" editor and overdue-todo push notifications. Most are opened from the centre **kaihuman** menu button in the bottom status bar, which is a drawer on desktop and the **More** sheet on mobile.

## Seeing how notes link to each other in the knowledge graph
<!-- docspack: tags=graph,knowledge graph,links,backlinks,force graph -->

Open it with the menu item **Graph**, or add **Graph** to the bottom navbar in Settings → **BOTTOM NAVBAR**. It has no URL and no keyboard shortcut; **X** closes it.

- Nodes are every `.md` file in the repository tree, labelled with the file name.
- Links come from `[[path|alias]]` wiki links and `[text](path)` Markdown links; `http` links are skipped.
- A link target resolves by exact path, then path plus `.md`, then file name.
- Links are computed only from files already loaded. **Analyze All Links** fetches every `.md` file, five at a time, and shows `Analyzing N...` while it runs.
- Clicking a node closes the graph and opens the file in Files view.

The header counts `N Nodes • M Links`. The view is `packages/ui/src/LifeOS/Organisms/GraphView.tsx`, drawn with `react-force-graph-2d`, loaded lazily.

## Viewing the repository's commit history
<!-- docspack: tags=commits,recent commits,commit history,git log,repository history -->

Open it with the menu item **Commits**, or add **Commits** to the bottom navbar. The overlay is titled **REPOSITORY HISTORY** and lists the latest 30 commits, with no paging.

| Column | Content |
|---|---|
| Message | First line; the full message on hover |
| Author | Commit author |
| Date | Commit date |
| Hash | Seven characters, linking to the commit on GitHub |

It calls `githubCommitStore.loadRepoCommits()`, which runs `githubService.listCommits(owner, repo, undefined, 1)`: `GET /repos/{owner}/{repo}/commits?page=1&per_page=30`. In demo mode the call goes to the in-memory service. Code: `packages/ui/src/LifeOS/Organisms/CommitsView.tsx` and `packages/core/src/stores/github-commit.store.ts`.

## Viewing the history of one file
<!-- docspack: tags=file history,commits,timeline,versions -->

In a focused file, the **HISTORY** button (tooltip "Toggle History") shows the file's commits as a timeline titled `HISTORY: <path>`. The button reads **HISTORY ON** while active; on mobile it is an icon only. It calls the same `listCommits` with the file's `path`. An empty result shows "No history found for this file." Code: `packages/ui/src/LifeOS/Organisms/FileHistoryView.tsx`.

## Chatting with a local AI from the console
<!-- docspack: tags=ai,copilot,claude,gemini,chat,ai panel,lifeos copilot -->

The **AI** toggle at the right of the desktop status bar opens the **LifeOS Copilot** panel. There is no AI button on mobile and no keyboard shortcut.

- Opening it calls `GET http://127.0.0.1:4000/health` with a one-second timeout. The panel opens even when the check fails.
- The provider select offers **Copilot**, **Claude** and **Gemini**; the default is `copilot` and the choice is not saved.
- `Enter` sends, `Shift+Enter` adds a new line, and the trash button clears the chat.
- A message is sent as `POST http://127.0.0.1:4000/chat` with `{ "message", "provider" }`; the reply is `{ "response" }`.
- Only the typed text is sent: no file content, repository or chat history.
- The chat lives in memory and is lost on reload.

The address is fixed in `SERVER_URL` in `packages/core/src/stores/ai.store.ts`. The panel is `packages/ui/src/LifeOS/Templates/AIPanel.tsx`.

## Fixing "AI Server Disconnected" in the console
<!-- docspack: tags=ai,disconnected,localhost 4000,kaihuman server,retry connection -->

The AI panel talks to the terminal CLI's `server` subcommand on port 4000. Start it on the same machine as the browser:

```sh
cd apps/cli
cargo run -- server      # or: kaihuman server
```

The console always uses port `4000`, so do not pass a different `--port`. The server binds to `127.0.0.1`, allows CORS from any origin and runs `claude -p`, `gemini -p` or `copilot -p` as a subprocess. Each provider CLI must be on the `PATH` and signed in; the console stores no API keys. After starting the server, press **Retry Connection**. The service worker never caches `http://127.0.0.1:4000/` (`NetworkOnly` in `apps/console/vite.config.ts`).

## Writing scratch text in the quick dump editor
<!-- docspack: tags=dump,quick dump,scratch,new file,/new,csv table,jsonl -->

The route `/new` opens a full-screen **QUICK DUMP** editor. It is the **New File** card on the `/shortcuts` page ("KH New" as a phone shortcut). The text is held in memory (`layoutStore.dumpContent`), not in a file, and is lost on reload.

- Pasted CSV (a first line with two or more `,` or `;` fields) or a JSON array of objects offers **RAW / TABLE** views.
- JSONL (at least 80% of lines are objects) offers **RAW / TABLE / LOG**.
- **SAVE** opens the new-file wizard (URL `/new/save`) with the name `quicknote-YYYY-MM-DD-HH:MM` in `<appFolder>/quicknotes`, where `<appFolder>` is `.kh` (or legacy `.lifeos`).
- The file is created through the GitHub contents API and opened in Files view. **X** returns to `/`.

## Quick dump, quick note and the Quick Note menu item compared
<!-- docspack: tags=dump.md,quick note,quicknotes,difference -->

| Entry point | Writes | When |
|---|---|---|
| `/new` (QUICK DUMP) | A new file `<appFolder>/quicknotes/quicknote-YYYY-MM-DD-HH:MM` | Only after **SAVE** and the wizard |
| `/quick-note` (NOTE) | Prepends `- YYYY-MM-DD <text>` to `<appFolder>/dump.md` | On **SAVE NOTE** or `Ctrl/⌘+Enter` |
| Menu **Quick Note** | A new file `<appFolder>/quicknotes/quicknote-<timestamp>.md` with front matter `type: generic`, opened at once | Immediately |

There is no dedicated viewer for `dump.md`. Open it like any other file from Files or `Ctrl+K` search.

## Getting push notifications for overdue milestones
<!-- docspack: tags=notifications,push,reminders,overdue,milestones,vapid,web push -->

Open the menu, then **Settings** → **NOTIFICATIONS** (shown when a repository is selected), and press **Enable**. Setup is `setupPushNotifications(owner, repo)` in `packages/core/src/utils/push-notifications.ts`:

1. Asks for notification permission. A denied permission must be re-allowed in the browser settings.
2. Reuses the VAPID public key from `.kh/push-config.json`, or on first setup generates a key pair and stores the private key as the repository secret `VAPID_PUSH_PRIVATE_KEY`.
3. Subscribes this device and commits `.kh/push-config.json` as `{ vapidPublicKey, subscriptions[] }`.
4. On first setup, commits `.kh/push-notify.js` and `.github/workflows/todo-reminders.yml`.

Enable again on each device you want notified. Settings shows "Enabled on this device" when this browser has a subscription.

## When and why reminder notifications are sent
<!-- docspack: tags=todo reminders,github action,cron,overdue,workflow scope -->

The GitHub Actions workflow **Todo Reminders** (`.github/workflows/todo-reminders.yml` in your data repository) runs at 07:00, 12:00 and 17:00 UTC (`cron: '0 7,12,17 * * *'`), or by hand with `workflow_dispatch`. It installs `web-push` and runs `node .kh/push-notify.js`.

- The script reads milestones from the front matter of `.kh/**/*.todos.md` files.
- A milestone is overdue when its `dueDate` is before today (UTC).
- The notification title is "1 overdue milestone" or "N overdue milestones"; the body lists `name (due YYYY-MM-DD)`.
- Expired subscriptions (HTTP 410) are logged, not removed.

Committing the workflow needs a token with the `workflow` scope. Without it, Settings shows the YAML with a **COPY** button so you can add the file yourself.

## Focusing on one file with zen mode
<!-- docspack: tags=zen mode,focus,distraction free,shortcut -->

`Ctrl+Shift+Z` (`⌘+Shift+Z` on a Mac) toggles zen mode, or press **ZEN MODE** in a focused file's header (**EXIT ZEN** leaves it). Zen mode hides the bottom status bar and switches the editor to muted colours by overriding its `--cascivo-editor-*` properties. The focused-file header also has **HISTORY**, `[+ DASHBOARD]` (add the file to a dashboard) and `[CLOSE]`.
