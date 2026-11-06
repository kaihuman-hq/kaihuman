#!/usr/bin/env bash
# Runs inside the emulator (reactivecircus/android-emulator-runner). Installs the Release APK (JS bundle
# embedded, no Metro) and screenshots each route reached through a VIEW intent.
set -euo pipefail
APK="$1"; OUT="$2"; PKG=com.kaihuman.app
mkdir -p "$OUT"
adb shell settings put global window_animation_scale 0
adb shell settings put global transition_animation_scale 0
adb shell settings put global animator_duration_scale 0
# The shared-CPU emulator is slow enough that Pixel Launcher ANR dialogs land on top of the app.
adb shell settings put global hide_error_dialogs 1
adb shell am start -a android.intent.action.MAIN -c android.intent.category.HOME >/dev/null || true
adb install -r "$APK"

ROUTES="dashboard:demo board:board analytics:analytics quick-todo:quick-todo ideas:ideas wiki:wiki knowledge:knowledge files:files repos:repos"

shot() { sleep "${2:-4}"; adb shell am broadcast -a android.intent.action.CLOSE_SYSTEM_DIALOGS >/dev/null 2>&1 || true; sleep 1; adb exec-out screencap -p > "$OUT/android-$MODE-$1.png"; }

for MODE in light dark; do
  adb shell cmd uimode night "$([ "$MODE" = dark ] && echo yes || echo no)"
  adb shell am force-stop "$PKG"
  adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null
  shot login 15
  # Crash diagnostics: a "keeps stopping" dialog in a screenshot is useless without the stack.
  adb logcat -d -b crash > "$OUT/logcat-crash-$MODE-login.txt" || true
  adb logcat -d -s AndroidRuntime:E ReactNativeJS:E ReactNative:E | tail -80 || true
  for pair in $ROUTES; do
    name=${pair%%:*}; link=${pair##*:}
    adb shell am start -a android.intent.action.VIEW -d "kaihuman://$link" "$PKG" >/dev/null
    shot "$name" 5
  done
done
adb logcat -d -b crash > "$OUT/logcat-crash.txt" || true
tail -60 "$OUT/logcat-crash.txt" || true
ls -l "$OUT"
