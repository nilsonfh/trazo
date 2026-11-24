#!/usr/bin/env bash
# Print a page to PDF with headless Chrome: a deck one 16:9 page per slide, any other page as the browser
# prints it (the theme keeps a figure on one page).
#
#   topdf.sh [--steps] [--dark] page.html out.pdf
#
# A deck (EdgeDeck) prints every slide at its last step, every build done; --steps prints one page per
# step instead. The light theme by default, --dark for the dark one. The page is printed as the browser's
# own print would print it: EdgeDeck and the themes carry the print styles. Build the page first
# (inline.py), or keep it beside the library it links. Fonts and GSAP come from the network.
# Chrome as in shot.sh.
set -euo pipefail
steps=0 theme=light
while [ $# -gt 0 ]; do
  case $1 in
    --steps) steps=1; shift ;;
    --dark) theme=dark; shift ;;
    --light) theme=light; shift ;;
    -h|--help) sed -n '2,11p' "$0"; exit 0 ;;
    --*) echo "topdf.sh: unknown option $1" >&2; exit 64 ;;
    *) break ;;
  esac
done
[ $# -eq 2 ] || { echo "usage: topdf.sh [--steps] [--dark] page.html out.pdf" >&2; exit 64; }
page=$1; out=$2
[ -f "$page" ] || { echo "topdf.sh: $page not found" >&2; exit 66; }
CH=${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | tail -1 || true)}
[ -n "$CH" ] || CH=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -n "$CH" ] || { echo "topdf.sh: no Chrome found; set CHROME or run: npx playwright install chromium-headless-shell" >&2; exit 69; }
[ -x "$CH" ] || { echo "topdf.sh: $CH is not an executable Chrome" >&2; exit 69; }
# a copy beside the page, so that its relative links still work, with the theme and the print mode set first
tmp=$(mktemp --suffix=.html -p "$(dirname "$(realpath "$page")")")
trap 'rm -f "$tmp"' EXIT
python3 - "$page" "$tmp" "$theme" "$steps" <<'PY'
import sys
src, dst, theme, steps = sys.argv[1:5]
s = open(src, encoding="utf-8").read()
head = ('<script>document.documentElement.setAttribute("data-theme",%r);window.ED_PRINT={steps:%s,theme:%r}</script>'
        '<style>*{transition:none!important}</style>') % (theme, steps, theme)
after = '<script>window.gsap&&gsap.ticker.lagSmoothing(0)</script>'
s = head + s
s = s.replace('</body>', after + '</body>') if '</body>' in s else s + after
open(dst, "w", encoding="utf-8").write(s)
PY
rm -f "$out"
"$CH" --headless --no-sandbox --virtual-time-budget=8000 --run-all-compositor-stages-before-draw \
  --no-pdf-header-footer --print-to-pdf="$(realpath -m "$out")" "file://$tmp" >/dev/null 2>&1 || true
[ -s "$out" ] || { echo "topdf.sh: Chrome wrote no PDF" >&2; exit 1; }
pages=$(python3 -c 'import re,sys; print(len(re.findall(rb"/Type\s*/Page\b", open(sys.argv[1],"rb").read())))' "$out")
echo "$out: $pages page(s)"
