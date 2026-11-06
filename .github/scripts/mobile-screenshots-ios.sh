#!/usr/bin/env bash
# Boots a simulator, installs the Release .app (JS bundle embedded, no Metro) and screenshots each route.
# Deep links go through Maestro because `simctl openurl` raises an "Open in app?" confirmation for custom
# schemes that nothing can dismiss on a headless runner; Maestro taps it.
set -euo pipefail
APP="$1"; OUT="$2"; BUNDLE_ID=com.kaihuman.app
mkdir -p "$OUT"
export PATH="$HOME/.maestro/bin:$PATH"
# The XCTest driver can take minutes to come up on a cold runner; Maestro's default gives up early.
export MAESTRO_DRIVER_STARTUP_TIMEOUT=180000
touch "$RUNNER_TEMP/started"

UDID=$(xcrun simctl list devices available -j | node -e '
  const d=JSON.parse(require("fs").readFileSync(0,"utf8")).devices;
  const phones=Object.entries(d).filter(([k])=>k.includes("iOS")).flatMap(([,v])=>v).filter(x=>/iPhone/.test(x.name));
  const pick=phones.find(x=>/iPhone 1[5-9] Pro$/.test(x.name))||phones.at(-1);
  if(!pick) process.exit(1); console.log(pick.udid)')
echo "Simulator $UDID"
xcrun simctl boot "$UDID" || true
xcrun simctl bootstatus "$UDID" -b
xcrun simctl status_bar "$UDID" override --time 9:41 --batteryState charged --batteryLevel 100 || true
xcrun simctl install "$UDID" "$APP"

cat > "$RUNNER_TEMP/open.yaml" <<'Y'
appId: com.kaihuman.app
---
- openLink: ${URL}
# iOS asks "Open in kaihuman?" for custom schemes; openLink alone leaves it up.
- tapOn:
    text: Open
    optional: true
Y

# name:link pairs; `login` is the cold-start screen, `demo` loads the sample data and lands on the dashboard.
ROUTES="dashboard:demo board:board analytics:analytics quick-todo:quick-todo ideas:ideas wiki:wiki knowledge:knowledge files:files repos:repos"

# macOS has no `timeout`; perl's alarm kills a Maestro run whose driver hangs instead of the job.
with_timeout() { perl -e 'alarm shift; exec @ARGV' "$@"; }

# "iOS driver not ready in time" and boot hangs are transient: retry the flow, then give up loudly.
open_link() {
  for attempt in 1 2 3; do
    with_timeout 300 maestro --device "$UDID" test -e URL="$1" "$RUNNER_TEMP/open.yaml" && return 0
    echo "maestro attempt $attempt for $1 failed; retrying"
    xcrun simctl bootstatus "$UDID" -b
    sleep 10
  done
  echo "maestro could not open $1" >&2
  return 1
}

shot() { sleep "${2:-4}"; xcrun simctl io "$UDID" screenshot "$OUT/ios-$MODE-$1.png"; }

for MODE in light dark; do
  xcrun simctl ui "$UDID" appearance "$MODE"
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID"
  shot login 10
  for pair in $ROUTES; do
    name=${pair%%:*}; link=${pair##*:}
    open_link "kaihuman://$link"
    shot "$name" 5
  done
done
# Crash reports written during this run; an empty list means the app never crashed.
find "$HOME/Library/Logs/DiagnosticReports" -name 'kaihuman*' -newer "$RUNNER_TEMP/started" \
  -exec cp {} "$OUT/" \; 2>/dev/null || true
echo "iOS crash reports: $(find "$OUT" -name 'kaihuman*.ips' | wc -l | tr -d ' ')"
ls -l "$OUT"
