#!/bin/sh
# Installs the desktop palette from a release tarball: run it from the unpacked directory.
#
#   ./install.sh                 # into ~/.local/bin
#   PREFIX=/usr/local/bin ./install.sh
#
# The binaries link the system's GTK 3, WebKitGTK 4.1 and gtk-layer-shell; anything missing is
# named below with the packages that provide it.
set -eu

here=$(cd "$(dirname "$0")" && pwd)
dest=${PREFIX:-"$HOME/.local/bin"}

# Both binaries must stay in one directory: the toggle starts the daemon from next to itself.
mkdir -p "$dest"
install -m 755 "$here/kaihuman-palette" "$here/kaihuman-palette-toggle" "$dest/"
echo "Installed kaihuman-palette and kaihuman-palette-toggle into $dest"

missing=$(ldd "$dest/kaihuman-palette" 2>/dev/null | awk '/not found/ { print $1 }')
if [ -n "$missing" ]; then
  echo
  echo "These libraries are missing:"
  echo "$missing" | sed 's/^/  /'
  echo "Install them with your package manager, for example:"
  echo "  Fedora:        sudo dnf install webkit2gtk4.1 gtk3 gtk-layer-shell"
  echo "  Debian/Ubuntu: sudo apt install libwebkit2gtk-4.1-0 libgtk-3-0 libgtk-layer-shell0"
  echo "  Arch:          sudo pacman -S webkit2gtk-4.1 gtk3 gtk-layer-shell"
fi

case ":$PATH:" in
  *":$dest:"*) ;;
  *) echo; echo "$dest is not on your PATH; add it so the key binding finds the toggle." ;;
esac

echo
echo "Next: bind kaihuman-palette-toggle to a key and run 'kaihuman-palette login'."
echo "See README.md (next to this script) for both."
