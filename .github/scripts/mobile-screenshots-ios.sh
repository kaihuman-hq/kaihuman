#!/usr/bin/env bash
# Boots a simulator, installs the Release .app (JS bundle embedded, no Metro) and screenshots each route.
# Deep links go through Maestro because `simctl openurl` raises an "Open in app?" confirmation for custom
# schemes that nothing can dismiss on a headless runner; Maestro taps it.
set -euo pipefail
APP="$1"; OUT="$2"; BUNDLE_ID=com.kaihuman.app
mkdir -p "$OUT"
export PATH="$HOME/.maestro/bin:$PATH"

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
Y

# name:link pairs; `login` is the cold-start screen, `demo` loads the sample data and lands on the dashboard.
ROUTES="dashboard:demo board:board analytics:analytics quick-todo:quick-todo ideas:ideas wiki:wiki knowledge:knowledge files:files repos:repos"

shot() { sleep "${2:-4}"; xcrun simctl io "$UDID" screenshot "$OUT/ios-$MODE-$1.png"; }

for MODE in light dark; do
  xcrun simctl ui "$UDID" appearance "$MODE"
  xcrun simctl terminate "$UDID" "$BUNDLE_ID" 2>/dev/null || true
  xcrun simctl launch "$UDID" "$BUNDLE_ID"
  shot login 10
  for pair in $ROUTES; do
    name=${pair%%:*}; link=${pair##*:}
    maestro --device "$UDID" test -e URL="kaihuman://$link" "$RUNNER_TEMP/open.yaml"
    shot "$name" 5
  done
done
ls -l "$OUT"
