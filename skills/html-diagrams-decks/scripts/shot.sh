#!/usr/bin/env bash
# Screenshot a page headless, or check its figures' layout, to look at it before publishing.
#
#   shot.sh [--only SELECTOR] [--full] [--height N] page.html out.png [light|dark] [width] [js-to-run-after-load]
#   shot.sh --check [--diagrams-only] page.html [width]
#
#   shot.sh build/deck.html /tmp/s3.png dark 1600 'for(var i=0;i<3;i++)document.getElementById("b-next").click()'
#   shot.sh --only '#fig-2' build/page.html /tmp/fig2.png light 1280     # one element, cropped to its height
#   shot.sh --full build/page.html /tmp/page.png                         # the whole page, not the first 1600 px
#
# --only hides everything but the element and its ancestors, takes the ancestors' vertical margins and
# padding away, and sizes the window to the element's height; the width stays the page width, so the
# layout is the one the reader sees. --full sizes the window to the page's height. Both measure the page
# in a first headless run, after the js has run.
#
# --check runs the layout check of every figure, at every step for EdgeDiagram figures and in their
# resting state for the rest: EdgeDiagram's own check, and EdgeSketch.check on every other
# svg[role="img"] (figures drawn by hand), so text that runs out of its box, text on text and icons on
# text are found in any figure. EdgeSketch is injected if the page does not load it. --diagrams-only
# leaves the hand-drawn figures out. Exit 1 if any issue, 2 if no figure was checked.
#
# Transitions are switched off (*{transition:none}): with --virtual-time-budget a CSS transition
# freezes at its first frame, so a dimmed or hidden state would not show. GSAP's lag smoothing is
# switched off too: virtual time advances in large jumps, which GSAP would otherwise treat as lag
# and play back 33 ms at a time, leaving every tween half done. Packets on wires may still show near
# their start: virtual time delivers few animation frames once tweens settle. Check motion in a
# real browser.
# Chrome: $CHROME, else chrome-headless-shell from Playwright's cache, else chromium/google-chrome.
# Install one with: npx playwright install chromium-headless-shell
set -euo pipefail
here=$(dirname "$(realpath "$0")")
check=0 only= full=0 height=1600 sketch=1
while [ $# -gt 0 ]; do
  case $1 in
    --check) check=1; shift ;;
    --diagrams-only) sketch=0; shift ;;
    --only) only=$2; shift 2 ;;
    --full) full=1; shift ;;
    --height) height=$2; shift 2 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    --*) echo "shot.sh: unknown option $1" >&2; exit 64 ;;
    *) break ;;
  esac
done
if [ $check = 1 ]; then [ $# -ge 1 ] || { echo "usage: shot.sh --check page.html [width]" >&2; exit 64; }; set -- "$1" /dev/null light "${2:-1280}"; fi
[ $# -ge 2 ] || { echo "usage: shot.sh [options] page.html out.png [light|dark] [width] [js]" >&2; exit 64; }
page=$1; out=$2; theme=${3:-light}; width=${4:-1280}; js=${5:-}
CH=${CHROME:-$(ls -d ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell ~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell 2>/dev/null | tail -1 || true)}
[ -n "$CH" ] || CH=$(command -v chromium || command -v chromium-browser || command -v google-chrome || true)
[ -n "$CH" ] || { echo "shot.sh: no Chrome found; set CHROME or run: npx playwright install chromium-headless-shell" >&2; exit 69; }
[ -x "$CH" ] || { echo "shot.sh: $CH is not an executable Chrome" >&2; exit 69; }
sk=$here/../lib/edgesketch.js; [ -f "$sk" ] || sk=$here/edgesketch.js
tmp=$(mktemp --suffix=.html -p "$(dirname "$(realpath "$page")")")
trap 'rm -f "$tmp"' EXIT

# prepare PAGE -> $tmp; MODE is shot, measure or check
prepare() {
  python3 - "$page" "$tmp" "$theme" "$js" "$1" "$only" "$full" "$sketch" "$sk" <<'PY'
import json, sys
src, dst, theme, js, mode, only, full, sketch, skpath = sys.argv[1:10]
s = open(src, encoding="utf-8").read()
head = '<style>*{transition:none!important}</style><script>window.gsap&&gsap.ticker.lagSmoothing(0)</script>'
if mode == "check":
    s = '<script>window.ED_DEBUG=1;' + ('window.ED_DEBUG_ALL=1;' if sketch == "1" else '') + '</script>' + s
inject = head
if theme == "dark":
    inject += '<script>document.documentElement.setAttribute("data-theme","dark")</script>'
if mode == "check" and sketch == "1" and "EdgeSketch" not in s:
    inject += '<script>' + open(skpath, encoding="utf-8").read().replace("</script", "<\\/script") + '</script>'
now = js     # the page's own js runs on load, as before; isolating and measuring wait for the fonts
after = ''
if only:
    after += r''';(function(sel){var e=document.querySelector(sel);if(!e){window.__shotMissing=1;return;}
      for(var n=e;n.parentElement;n=n.parentElement){var p=n.parentElement;
        [].forEach.call(p.children,function(c){if(c!==n&&!/^(SCRIPT|STYLE|LINK|HEAD)$/.test(c.tagName))c.style.setProperty('display','none','important');});
        ['margin-top','margin-bottom','padding-top','padding-bottom'].forEach(function(k){p.style.setProperty(k,'0','important');});}
      e.style.setProperty('margin-top','0','important');e.style.setProperty('margin-bottom','0','important');window.scrollTo(0,0);
      window.__shotEl=e;})(''' + json.dumps(only) + ')'
if mode == "measure":
    after += r''';(function(){if(window.__shotMissing)return;var e=window.__shotEl,h=e?Math.ceil(e.getBoundingClientRect().bottom)+2:document.documentElement.scrollHeight;
      var p=document.createElement('pre');p.id='shot-size';p.textContent=String(h);document.body.appendChild(p);})()'''
if now:
    inject += '<script>window.addEventListener("load",function(){' + now + '})</script>'
if after:
    inject += ('<script>window.addEventListener("load",function(){var go=function(){' + after + '};'
               'var r=document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve();'
               'r.then(function(){setTimeout(go,120)});})</script>')
s = s.replace('</body>', inject + '</body>') if '</body>' in s else s + inject
open(dst, "w", encoding="utf-8").write(s)
PY
}

if [ $check = 1 ]; then
  prepare check
  "$CH" --headless --no-sandbox --window-size="$width",1600 --virtual-time-budget=6000 --dump-dom "file://$tmp" 2>/dev/null |
  python3 -c '
import html, re, sys
m = re.search(r"<pre id=\"ed-issues\"[^>]*data-diagrams=\"(\d+)\"[^>]*>(.*?)</pre>", sys.stdin.read(), re.S)
if not m: print("no figure was checked"); sys.exit(2)
issues = [l for l in html.unescape(m.group(2)).splitlines() if l.strip()]
print("%s figure(s) checked, %d issue(s)" % (m.group(1), len(issues)))
for l in issues: print("  " + l)
sys.exit(1 if issues else 0)'
  exit $?
fi

if [ -n "$only" ] || [ $full = 1 ]; then
  prepare measure
  mh=1600; [ -n "$only" ] || mh=200   # a short window, so the page's height is its content's
  height=$("$CH" --headless --no-sandbox --hide-scrollbars --window-size="$width",$mh --virtual-time-budget=4000 --dump-dom "file://$tmp" 2>/dev/null |
    python3 -c 'import re,sys; m=re.search(r"<pre id=\"shot-size\">(\d+)</pre>", sys.stdin.read()); print(min(16000, max(100, int(m.group(1)))) if m else "")')
  [ -n "$height" ] || { echo "shot.sh: could not measure ${only:-the page}; is the selector right?" >&2; exit 1; }
fi
prepare shot
"$CH" --headless --no-sandbox --hide-scrollbars --window-size="$width","$height" \
  --virtual-time-budget=4000 --screenshot="$(realpath -m "$out")" "file://$tmp" >/dev/null 2>&1
echo "$out"
