#!/bin/sh
# Packs the release build into release/kaihuman-<version>-<os>-<arch>.tar.gz, with the README and
# the license. `pnpm run package` builds first. Set TARGET (a Rust target triple) to pack a
# cross-compiled build from target/<triple>/release; the name then follows the triple, not this host.
set -eu
cd "$(dirname "$0")/.."

version=$(sed -n 's/^version = "\(.*\)"$/\1/p' Cargo.toml | head -n 1)
bin_dir=target/release
case "${TARGET:-}" in
  "") os=$(uname -s | tr '[:upper:]' '[:lower:]'); arch=$(uname -m) ;;
  x86_64-apple-darwin) os=darwin; arch=x86_64; bin_dir=target/$TARGET/release ;;
  aarch64-apple-darwin) os=darwin; arch=arm64; bin_dir=target/$TARGET/release ;;
  *) echo "Unsupported TARGET $TARGET" >&2; exit 1 ;;
esac
name="kaihuman-$version-$os-$arch"
stage="release/$name"

rm -rf "$stage" "$stage.tar.gz"
mkdir -p "$stage"
cp "$bin_dir/kaihuman" README.md ../../LICENSE "$stage/"
strip "$stage/kaihuman"
tar -czf "$stage.tar.gz" -C release "$name"
rm -rf "$stage"
echo "Packaged $stage.tar.gz"
