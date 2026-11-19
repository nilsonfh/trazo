#!/usr/bin/env bash
# Export one figure of a built page to a draw.io file, in the page's light theme.
#
#   todrawio.sh page.html TARGET out.drawio ["diagram name"]
#
# TARGET is the id of an svg, or a CSS selector when it starts with "." or "#":
#   - an EdgeDiagram svg exports at its last step, with its links attached to their nodes;
#   - any other svg (drawn by hand or with EdgeSketch) exports its rects, ellipses, text, sprite icons
#     and wires, in the page's order;
#   - any other element exports as an HTML figure: its boxes, sprite icons and lines of text.
# Headless Chrome renders the page; todrawio-extract.js dumps the rendered geometry, computed colours,
# faces and icons; todrawio.py writes the draw.io XML. Use the built page (after inline.py), so the
# library and the theme are in it. Exit 1 if the target is not found or the figure comes out empty.
# Chrome: $CHROME, else chrome-headless-shell from Playwright's cache, else chromium/google-chrome.
set -euo pipefail
[ $# -ge 3 ] || { sed -n '2,16p' "$0" >&2; exit 64; }
page=$1; target=$2; out=$3; name=${4:-}
here=$(dirname "$(realpath "$0")")
CH=${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | tail -1 || true)}
[ -n "$CH" ] || CH=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -n "$CH" ] || { echo "todrawio.sh: no Chrome found; set CHROME or run: npx playwright install chromium-headless-shell" >&2; exit 69; }
[ -x "$CH" ] || { echo "todrawio.sh: $CH is not an executable Chrome" >&2; exit 69; }
tmp=$(mktemp --suffix=.html -p "$(dirname "$(realpath "$page")")"); json=${tmp%.html}.json
trap 'rm -f "$tmp" "$json"' EXIT
python3 - "$page" "$tmp" "$target" "$here/todrawio-extract.js" <<'PY'
import sys, json
src, dst, target, js = sys.argv[1:5]
s = open(src, encoding="utf-8").read()
inject = ('<style>*{transition:none!important;animation:none!important}</style><script>window.TODRAWIO_TARGET=%s;%s</script>'
          % (json.dumps(target), open(js, encoding="utf-8").read().replace("</script", "<\\/script")))
s = s.replace('</body>', inject + '</body>') if '</body>' in s else s + inject
open(dst, "w", encoding="utf-8").write(s)
PY
"$CH" --headless --no-sandbox --window-size=1600,1600 --virtual-time-budget=8000 --dump-dom "file://$tmp" 2>/dev/null |
  python3 -c 'import sys, re, html; m = ([None] + re.findall(r"<pre id=\"dump\">(.*?)</pre>", sys.stdin.read(), re.S))[-1]; m or sys.exit("todrawio.sh: the page gave no dump; did it load?"); print(html.unescape(m))' > "$json"
python3 "$here/todrawio.py" "$json" "$out" ${name:+"$name"}
