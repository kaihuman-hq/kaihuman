---
name: kb-agent-capture
description: >-
  Capture a note to the knowledge base by DRIVING the native kh-capture window
  through native-sdk's automation server — open it, type the note, submit, and
  assert success — and use the same flow to smoke-test apps/kh-capture-native.
  Use when the user asks to capture something to the KB "via the app", to
  demonstrate agent-driven GUI capture, or to verify the native app end-to-end.
  Falls back to `cli capture` when automation isn't available. EXPERIMENTAL:
  depends on apps/kh-capture-native compiling and being built with automation.
---

# Agent-driven knowledge capture

Capture a note into `.kh/raw/` by **driving the `kh-capture` native window**
(native-sdk automation server) as an agent action: open it, type the note,
submit, and assert the result. This doubles as the app's end-to-end acceptance
test — it is how an agent both *operates* and *verifies* the GUI, which is the
whole reason to prefer native-sdk over a plain toolkit here.

> For plain, reliable capture that doesn't need the GUI, prefer
> `cli capture "<text>"` — it's simpler and offline-safe. Reach for this skill
> when the point is to exercise or verify the native app through automation.

## Status

**Experimental.** Requires `apps/kh-capture-native` to compile and be built with
the automation flag. Steps marked `VERIFY` need confirming against
`native automate --help` — the exact input-dispatch subcommand isn't pinned in
the public docs. If any step is uncertain or fails, fall back to `cli capture`
and say that automation wasn't available.

## Prerequisites

1. `cli` logged in once — the app reuses `~/.config/cli/auth.json`:
   run `cli`, press `l` (log in), `s` (select the `.kh/` repo).
2. Build with automation enabled:
   ```sh
   cd apps/kh-capture-native
   native build -Dautomation=true      # → zig-out/bin/kh-capture
   ```

## Do it

Run the bundled driver — it performs the sequence and falls back to `cli capture`
on any failure:

```sh
apps/kh-capture-native/scripts/agent-capture.sh "the note text"
# or:  echo "the note text" | apps/kh-capture-native/scripts/agent-capture.sh
```

### Or drive it manually

All `native automate` commands run from `apps/kh-capture-native/`.

1. Launch `zig-out/bin/kh-capture &` if no window is up.
2. `native automate wait` — block until the window is ready.
3. `native automate snapshot` — inspect the accessibility tree; confirm the text
   input and a `Save` button:
   `native automate assert 'role=button name="Save"'`.
4. Type the note into the autofocused input.
   **VERIFY** the subcommand via `native automate --help` (assumed
   `native automate type "<text>"`; may be `key`/`text`/`input`).
5. Submit: `native automate widget-click canvas <n>` on the Save button (take
   `<n>` from the snapshot), or dispatch Enter.
6. Verify success: on a good push the app sets its status to `captured ✓` and
   auto-closes. `native automate assert 'name~="captured"'`, or re-snapshot and
   confirm the window closed.
7. (Optional) Confirm `.kh/raw/<ts>-<slug>.md` landed on GitHub.

## Fallback — always works

```sh
cli capture "the note text"
```

Offline-safe: it spools locally and pushes with retry. If the automation drive
fails for any reason, use this instead and report that automation was
unavailable.

## Why this exists

- **Agent-driven capture**: a Claude Code session can capture a thought by
  operating the real UI, not just calling an API — the native-sdk differentiator.
- **Acceptance test**: the same `native automate assert …` sequence regression-
  tests the native UI (CI-friendly), which is the check we otherwise can't run.
- **No lost notes**: the app reads auth from the CLI and, on a failed push,
  spools into the CLI's spool dir — so a note captured by either path is never
  lost.
