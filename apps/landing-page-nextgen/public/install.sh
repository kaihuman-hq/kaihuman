#!/bin/sh
# Installs the kaihuman CLI from its GitHub release:
#   curl -fsSL https://kaihuman.com/install.sh | sh
# Env: KAIHUMAN_VERSION (e.g. 0.1.0; default: latest), KAIHUMAN_INSTALL_DIR (default ~/.local/bin),
# KAIHUMAN_BASE_URL (release download base, for mirrors and tests).
set -eu

repo=kaihuman-hq/kaihuman
dir=${KAIHUMAN_INSTALL_DIR:-$HOME/.local/bin}

die() { echo "kaihuman install: $*" >&2; exit 1; }
need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required"; }

need curl
need tar

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux-x86_64 ;;
  Linux-aarch64 | Linux-arm64) platform=linux-aarch64 ;;
  Darwin-arm64) platform=darwin-arm64 ;;
  Darwin-x86_64) platform=darwin-x86_64 ;;
  *) die "no prebuilt binary for $(uname -s) $(uname -m). Build it instead: cargo install --git https://github.com/$repo cli" ;;
esac

version=${KAIHUMAN_VERSION:-}
if [ -z "$version" ]; then
  # The repo also tags desktop-v* releases, so /releases/latest may not be the CLI.
  version=$(curl -fsSL "https://api.github.com/repos/$repo/releases?per_page=30" |
    sed -n 's/.*"tag_name": *"cli-v\([^"]*\)".*/\1/p' | head -n 1) || true
  [ -n "$version" ] || die "could not find a CLI release; set KAIHUMAN_VERSION"
fi

base=${KAIHUMAN_BASE_URL:-https://github.com/$repo/releases/download}/cli-v$version
name=kaihuman-$version-$platform
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

echo "Downloading kaihuman $version ($platform)"
curl -fsSL -o "$tmp/$name.tar.gz" "$base/$name.tar.gz" || die "download failed: $base/$name.tar.gz"
curl -fsSL -o "$tmp/SHA256SUMS" "$base/SHA256SUMS" || die "download failed: $base/SHA256SUMS"

expected=$(awk -v f="$name.tar.gz" '$2 == f || $2 == "*" f { print $1 }' "$tmp/SHA256SUMS")
[ -n "$expected" ] || die "$name.tar.gz is not in SHA256SUMS"
if command -v sha256sum >/dev/null 2>&1; then
  actual=$(sha256sum "$tmp/$name.tar.gz" | awk '{ print $1 }')
else
  need shasum
  actual=$(shasum -a 256 "$tmp/$name.tar.gz" | awk '{ print $1 }')
fi
[ "$expected" = "$actual" ] || die "checksum mismatch for $name.tar.gz"

tar -xzf "$tmp/$name.tar.gz" -C "$tmp"
mkdir -p "$dir"
install -m 755 "$tmp/$name/kaihuman" "$dir/kaihuman"
echo "Installed $dir/kaihuman"

case ":$PATH:" in
  *":$dir:"*) ;;
  *) echo "Add it to your PATH: export PATH=\"$dir:\$PATH\"" ;;
esac
cat <<'NEXT'

Next:
  kaihuman                  open the app; it signs you in with GitHub in your browser
  kaihuman skills install   teach your AI agents (Claude Code, Codex, Gemini...) to use it
  kaihuman todo list --json
NEXT
