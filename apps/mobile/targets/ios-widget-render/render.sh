#!/usr/bin/env bash
# CI-only: compiles the widget views with RenderMain.swift for the iOS Simulator and runs it there.
# Usage: render.sh <output dir>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="$(mkdir -p "$1" && cd "$1" && pwd)"
build="$(mktemp -d)"
cp "$here"/../ios-widget/*.swift "$build/"
# The extension's @main bundle would clash with the harness's @main.
sed -i '' 's/^@main$//' "$build/KaihumanWidgets.swift"
sdk="$(xcrun --sdk iphonesimulator --show-sdk-path)"
xcrun --sdk iphonesimulator swiftc -parse-as-library -O \
  -target "$(uname -m)-apple-ios17.0-simulator" -sdk "$sdk" \
  "$build"/*.swift "$here/RenderMain.swift" -o "$build/render"
device="$(xcrun simctl list devices available | grep -m1 -E 'iPhone' | grep -oE '[0-9A-F-]{36}')"
xcrun simctl boot "$device" || true
xcrun simctl bootstatus "$device" -b
xcrun simctl spawn "$device" "$build/render" "$out"
ls -la "$out"
