#!/bin/sh
# Packs the release build into release/kaihuman-<version>-<os>-<arch>.tar.gz, with the README and
# the license. `pnpm run package` builds first.
set -eu
cd "$(dirname "$0")/.."

version=$(sed -n 's/^version = "\(.*\)"$/\1/p' Cargo.toml | head -n 1)
os=$(uname -s | tr '[:upper:]' '[:lower:]')
name="kaihuman-$version-$os-$(uname -m)"
stage="release/$name"

rm -rf "$stage" "$stage.tar.gz"
mkdir -p "$stage"
cp target/release/kaihuman README.md ../../LICENSE "$stage/"
strip "$stage/kaihuman"
tar -czf "$stage.tar.gz" -C release "$name"
rm -rf "$stage"
echo "Packaged $stage.tar.gz"
