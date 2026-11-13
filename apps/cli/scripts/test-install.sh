#!/bin/sh
# Tests the installer against a fake release served from file://. Run: sh scripts/test-install.sh
set -eu
here=$(cd "$(dirname "$0")" && pwd)
installer=$here/../../landing-page-nextgen/public/install.sh
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

case "$(uname -s)-$(uname -m)" in
  Linux-x86_64) platform=linux-x86_64 ;;
  Linux-aarch64 | Linux-arm64) platform=linux-aarch64 ;;
  Darwin-arm64) platform=darwin-arm64 ;;
  Darwin-x86_64) platform=darwin-x86_64 ;;
esac

rel=$work/dl/cli-v9.9.9
name=kaihuman-9.9.9-$platform
mkdir -p "$rel" "$work/$name"
printf '#!/bin/sh\necho fake kaihuman\n' > "$work/$name/kaihuman"
tar -czf "$rel/$name.tar.gz" -C "$work" "$name"
(cd "$rel" && { sha256sum "$name.tar.gz" 2>/dev/null || shasum -a 256 "$name.tar.gz"; } > SHA256SUMS)

run() {
  KAIHUMAN_VERSION=9.9.9 KAIHUMAN_BASE_URL=file://$work/dl KAIHUMAN_INSTALL_DIR=$work/bin sh "$installer" "$@"
}

run > "$work/out.txt"
[ "$("$work/bin/kaihuman")" = "fake kaihuman" ] || { echo "FAIL: binary not installed"; exit 1; }
grep -q "kaihuman skills install" "$work/out.txt" || { echo "FAIL: no next steps"; exit 1; }

rm -rf "$work/bin"
echo tampered >> "$rel/$name.tar.gz"
if run > "$work/out2.txt" 2>&1; then echo "FAIL: tampered archive accepted"; exit 1; fi
grep -q "checksum mismatch" "$work/out2.txt" || { echo "FAIL: wrong error"; cat "$work/out2.txt"; exit 1; }
[ ! -e "$work/bin/kaihuman" ] || { echo "FAIL: installed despite mismatch"; exit 1; }
echo "install.sh: ok"
