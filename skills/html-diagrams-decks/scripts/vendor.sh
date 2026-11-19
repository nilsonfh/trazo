#!/bin/sh
# Copy the library, the themes and the tools into another project, flat, with the version they came from.
#
#   scripts/vendor.sh DEST            # DEST/edgediagram.js edgesketch.js edgedeck.js icons.js inline.py shot.sh themes/ VERSION
#   scripts/vendor.sh --check DEST    # list what differs from this copy of the skill; exit 1 if anything does
#
# inline.py and shot.sh find the library beside themselves in this layout. A project that keeps such a
# copy runs --check to see whether it is behind, and vendor.sh again to update it; its own changes belong
# upstream, in the skill, or they are lost on the next copy.
set -eu
here=$(cd "$(dirname "$0")/.." && pwd)
check=0; [ "${1:-}" = --check ] && { check=1; shift; }
[ $# -eq 1 ] || { echo "usage: vendor.sh [--check] DEST" >&2; exit 64; }
dest=$1
files="lib/edgediagram.js lib/edgesketch.js lib/edgedeck.js lib/icons.js scripts/inline.py scripts/shot.sh"
if [ $check = 1 ]; then
  rc=0
  echo "skill $(cat "$here/VERSION"), copy $(cat "$dest/VERSION" 2>/dev/null || echo 'without VERSION')"
  for f in $files; do cmp -s "$here/$f" "$dest/$(basename "$f")" || { echo "  differs: $(basename "$f")"; rc=1; }; done
  for t in "$here"/themes/*.css; do cmp -s "$t" "$dest/themes/$(basename "$t")" || { echo "  differs: themes/$(basename "$t")"; rc=1; }; done
  exit $rc
fi
mkdir -p "$dest/themes"
for f in $files; do cp "$here/$f" "$dest/"; done
cp "$here"/themes/*.css "$dest/themes/"
cp "$here/VERSION" "$dest/VERSION"
chmod +x "$dest/inline.py" "$dest/shot.sh"
echo "copied html-diagrams-decks $(cat "$here/VERSION") into $dest"
