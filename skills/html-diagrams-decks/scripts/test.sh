#!/usr/bin/env bash
# Run every test: each page in tests/ headless (it writes "ok" or its failures into <pre id="out">),
# then the Python tools' tests and the themes' contrast.
#   scripts/test.sh
# Chrome as in shot.sh. GSAP comes from cdnjs, so tests/steps.html needs the network.
set -euo pipefail
cd "$(dirname "$0")/.."
CH=${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | tail -1 || true)}
[ -n "$CH" ] || CH=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -n "$CH" ] || { echo "no Chrome found; set CHROME or run: npx playwright install chromium-headless-shell" >&2; exit 69; }
[ -x "$CH" ] || { echo "test.sh: $CH is not an executable Chrome" >&2; exit 69; }
rc=0
for t in tests/*.html; do
  out=$("$CH" --headless --no-sandbox --window-size=1280,900 --virtual-time-budget=3000 --dump-dom "file://$PWD/$t" 2>/dev/null |
        python3 -c 'import html,re,sys; m=re.search(r"<pre id=\"out\">(.*?)</pre>", sys.stdin.read(), re.S); print(html.unescape(m.group(1)) if m and m.group(1) else "no result")')
  echo "$t: $out"; [ "$out" = ok ] || rc=1
done
out=$(python3 -m unittest discover -s tests -p 'test_*.py' 2>&1) || rc=1
echo "tests/test_*.py: $(echo "$out" | tail -1)"; [ $rc = 0 ] || echo "$out"
if command -v node >/dev/null; then for f in lib/*.js; do node --check "$f" || rc=1; done; fi
exit $rc
