#!/bin/sh
# Packs the release build into release/kaihuman-palette-<version>-linux-<arch>.tar.gz, with
# install.sh, the README and the license. `pnpm run package` builds first.
set -eu
cd "$(dirname "$0")/.."

version=$(sed -n 's/^version = "\(.*\)"$/\1/p' src-tauri/Cargo.toml | head -n 1)
name="kaihuman-palette-$version-linux-$(uname -m)"
stage="release/$name"

rm -rf "$stage" "$stage.tar.gz"
mkdir -p "$stage"
cp src-tauri/target/release/kaihuman-palette src-tauri/target/release/kaihuman-palette-toggle \
  scripts/install.sh README.md ../../LICENSE "$stage/"
strip "$stage/kaihuman-palette" "$stage/kaihuman-palette-toggle"
tar -czf "$stage.tar.gz" -C release "$name"
rm -rf "$stage"
echo "Packaged $stage.tar.gz"
