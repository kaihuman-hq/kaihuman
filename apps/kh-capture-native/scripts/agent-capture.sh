#!/usr/bin/env bash
#
# agent-capture.sh — capture a note by DRIVING the kh-capture native window via
# native-sdk's automation server. This is the executable half of the
# `kb-agent-capture` skill and doubles as the app's end-to-end acceptance test.
#
# It degrades gracefully: if `native`, the built binary, or any automation step
# is unavailable, it falls back to `cli capture` — so capture never fails.
#
# Usage:  agent-capture.sh "note text"   |   echo "note text" | agent-capture.sh
#
set -euo pipefail

# ── Resolve the note text (args or stdin) ─────────────────────────────────────
text="${*:-}"
if [ -z "$text" ] && [ ! -t 0 ]; then text="$(cat)"; fi
if [ -z "${text//[[:space:]]/}" ]; then echo "nothing to capture"; exit 0; fi

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BIN="$APP_DIR/zig-out/bin/kh-capture"
AUTO_DIR="$APP_DIR/.zig-cache/native-sdk-automation"

fallback() {
  echo "→ automation unavailable ($1); capturing via cli"
  printf '%s\n' "$text" | cli capture
  exit $?
}

# A short-lived wrapper so `native automate` steps can't hang the whole flow.
auto() { ( cd "$APP_DIR" && timeout 15 native automate "$@" ); }

command -v native >/dev/null 2>&1 || fallback "native CLI not found"
[ -x "$BIN" ] || fallback "not built — run: native build -Dautomation=true"

# Launch the app if no automation snapshot is present yet.
if [ ! -e "$AUTO_DIR/snapshot.txt" ]; then
  "$BIN" >/dev/null 2>&1 &
fi

auto wait                               || fallback "window never appeared"
auto assert 'role=button name="Save"'   || fallback "capture UI not found"

# Type into the autofocused input, then submit by clicking Save.
# VERIFY(api): confirm the input-dispatch subcommand via `native automate --help`
# (`type` assumed; may be `key`/`text`/`input`) and the Save widget index.
auto type "$text"                       || fallback "could not type note"
auto widget-click canvas 1              || true

# Success = the app set its "captured" status (it then auto-closes the window).
# VERIFY(api): confirm the regex-match assertion syntax (`name~=`).
if auto assert 'name~="captured"'; then
  echo "captured via native automation ✓"
else
  fallback "could not confirm capture"
fi
