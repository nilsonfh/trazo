#!/usr/bin/env python3
"""Visual regression test: render every templates/*.html and compare it with its baseline in tests/visual/.

    visual.py                      render, compare, exit 1 on a difference or a missing baseline
    visual.py --update             write the baselines anew (all, or the templates named)
    visual.py sequence deck        only these templates
    visual.py --out DIR            where the renders and diff images of the failures go

Each template is inlined (inline.py) and screenshot with shot.sh's headless Chrome in light and dark,
1280 px wide and as tall as the page (a deck: 1280x720, one shot per slide). The page is frozen:
window.TRAZO_STATIC = true makes EdgeDiagram, EdgeSequence and EdgeDeck skip every animation and
stand at the last step, packets on wires are not drawn, CSS animations and transitions are off.

Fonts are pinned: the theme's Google Fonts @import is taken out, and Chrome sees only the DejaVu faces
of the fonts-dejavu-core package (Sans, Sans Mono, Serif, each regular and bold), through a fontconfig
file of its own, so every family in a theme falls back to them, the same way on every Linux machine.
Install them with: sudo apt-get install fonts-dejavu-core. GSAP still comes from cdnjs.

A render matches when at most --max-pixels pixels differ by more than --threshold in some channel
(of 255). On a mismatch NAME.png (the render) and NAME.diff.png (the baseline greyed, differing pixels
red, small differences orange) are written to --out. tests/visual/env.txt records the Chrome and the
fonts the baselines were made with; another Chrome or other font files are reported, since they move
pixels. Linux only. Pure Python, standard library: PNG is read and written with zlib.
"""
import argparse, concurrent.futures, glob, hashlib, os, platform, re, shutil, struct, subprocess, sys, tempfile, zlib

HERE = os.path.dirname(os.path.abspath(__file__))
SKILL = os.path.dirname(HERE)
BASE = os.path.join(SKILL, "tests", "visual")
THEMES = ("light", "dark")
FONTS = ("DejaVuSans.ttf", "DejaVuSans-Bold.ttf", "DejaVuSansMono.ttf", "DejaVuSansMono-Bold.ttf",
         "DejaVuSerif.ttf", "DejaVuSerif-Bold.ttf")
FONT_DIRS = ("/usr/share/fonts/truetype/dejavu", "/usr/share/fonts/dejavu", "/usr/share/fonts/TTF",
             "/usr/share/fonts/dejavu-sans-fonts", "/usr/share/fonts/dejavu-sans-mono-fonts",
             "/usr/share/fonts/dejavu-serif-fonts", "/usr/local/share/fonts", os.path.expanduser("~/.local/share/fonts"))
FREEZE = ('<script>window.TRAZO_STATIC=true;%s</script>'
          '<style>*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}</style>\n')


# ---------- PNG, standard library only ----------
def png_read(path):
    """(width, height, rows): rows is a list of bytes, RGB, 3 bytes a pixel."""
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise ValueError("%s: not a PNG" % path)
    pos, idat, ihdr = 8, [], None
    while pos < len(data):
        n, kind = struct.unpack(">I4s", data[pos:pos + 8])
        body = data[pos + 8:pos + 8 + n]
        pos += 12 + n
        if kind == b"IHDR":
            ihdr = struct.unpack(">IIBBBBB", body)
        elif kind == b"IDAT":
            idat.append(body)
        elif kind == b"IEND":
            break
    w, h, depth, ctype, _, _, interlace = ihdr
    if depth != 8 or ctype not in (0, 2, 4, 6) or interlace:
        raise ValueError("%s: only 8-bit, non-interlaced grey, RGB or RGBA PNG is read" % path)
    bpp = {0: 1, 2: 3, 4: 2, 6: 4}[ctype]
    raw, stride = zlib.decompress(b"".join(idat)), w * bpp
    rows, prev = [], bytearray(stride)
    for y in range(h):
        f, cur = raw[y * (stride + 1)], bytearray(raw[y * (stride + 1) + 1:(y + 1) * (stride + 1)])
        if f == 1:
            for i in range(bpp, stride):
                cur[i] = (cur[i] + cur[i - bpp]) & 255
        elif f == 2:
            cur = bytearray((a + b) & 255 for a, b in zip(cur, prev))
        elif f == 3:
            for i in range(stride):
                cur[i] = (cur[i] + ((cur[i - bpp] if i >= bpp else 0) + prev[i]) // 2) & 255
        elif f == 4:
            for i in range(stride):
                a = cur[i - bpp] if i >= bpp else 0
                b = prev[i]
                c = prev[i - bpp] if i >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[i] = (cur[i] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(cur)
        prev = cur
    if ctype == 2:
        out = [bytes(r) for r in rows]
    elif ctype == 6:
        out = [bytes(r[i] for i in range(len(r)) if i % 4 != 3) for r in rows]
    elif ctype == 4:
        out = [bytes(v for v in r[0::2] for _ in range(3)) for r in rows]
    else:
        out = [bytes(v for v in r for _ in range(3)) for r in rows]
    return w, h, out


def png_write(path, w, h, rows):
    """RGB rows; each row filtered Up when that compresses better than None (cheap and near optimal for
    flat figures), then zlib at level 9."""
    out, prev = bytearray(), bytes(w * 3)
    for r in rows:
        up = bytes((a - b) & 255 for a, b in zip(r, prev))
        if sum(1 for v in up if v) < sum(1 for v in r if v):
            out += b"\x02" + up
        else:
            out += b"\x00" + r
        prev = r

    def chunk(kind, body):
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xffffffff)
    with open(path, "wb") as f:
        f.write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) +
                chunk(b"IDAT", zlib.compress(bytes(out), 9)) + chunk(b"IEND", b""))


def compare(a, b, threshold):
    """Pixels of a and b (from png_read) that differ by more than threshold, and those that differ less;
    the diff image's rows. A size difference counts every pixel outside the common area."""
    (wa, ha, ra), (wb, hb, rb) = a, b
    w, h = max(wa, wb), max(ha, hb)
    big = small = 0
    rows = []
    for y in range(h):
        x = ra[y] if y < ha else b""
        z = rb[y] if y < hb else b""
        if x == z and wa == wb:   # the common case: an equal row is drawn grey, quickly
            rows.append(bytes(150 + v * 2 // 5 for v in _grey(x)))
            continue
        row = bytearray(w * 3)
        for i in range(w):
            p, q = x[i * 3:i * 3 + 3], z[i * 3:i * 3 + 3]
            if len(p) < 3 or len(q) < 3:
                big += 1
                row[i * 3:i * 3 + 3] = b"\xe0\x10\x10"
                continue
            d = max(abs(p[0] - q[0]), abs(p[1] - q[1]), abs(p[2] - q[2]))
            if d > threshold:
                big += 1
                row[i * 3:i * 3 + 3] = b"\xe0\x10\x10"
            elif d:
                small += 1
                row[i * 3:i * 3 + 3] = b"\xf0\xa0\x20"
            else:
                g = 150 + (q[0] * 3 + q[1] * 6 + q[2]) // 25
                row[i * 3:i * 3 + 3] = bytes((g, g, g))
        rows.append(bytes(row))
    return big, small, (w, h, rows)


def _grey(row):
    return bytes(v for i in range(0, len(row), 3) for v in [(row[i] * 3 + row[i + 1] * 6 + row[i + 2]) // 10] * 3)


# ---------- the environment: Chrome and fonts ----------
def find_chrome():
    ch = os.environ.get("CHROME")
    if not ch:
        found = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell")) +
                       glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell")))
        ch = found[-1] if found else next((shutil.which(c) for c in ("chromium", "chromium-browser", "google-chrome") if shutil.which(c)), None)
    if not ch or not os.access(ch, os.X_OK):
        sys.exit("visual.py: no Chrome found; set CHROME or run: npx playwright install chromium-headless-shell")
    return ch


def find_fonts():
    dirs = list(FONT_DIRS)
    try:   # wherever fontconfig knows the files to be
        out = subprocess.run(["fc-list", "-f", "%{file}\n", "DejaVu Sans"], capture_output=True, text=True).stdout
        dirs = sorted({os.path.dirname(l) for l in out.splitlines() if l}) + dirs
    except OSError:
        pass
    have = {}
    for name in FONTS:
        for d in dirs:
            if os.path.isfile(os.path.join(d, name)):
                have[name] = os.path.join(d, name)
                break
    missing = [n for n in FONTS if n not in have]
    if missing:
        sys.exit("visual.py: fonts not found: %s; install them with: sudo apt-get install fonts-dejavu-core" % ", ".join(missing))
    return have


def setup_fonts(tmp, fonts):
    d = os.path.join(tmp, "fonts")
    os.makedirs(d)
    for name, path in fonts.items():
        os.symlink(path, os.path.join(d, name))
    conf = os.path.join(tmp, "fonts.conf")
    alias = "".join('<alias><family>%s</family><prefer><family>DejaVu %s</family></prefer></alias>' % (g, f)
                    for g, f in (("sans-serif", "Sans"), ("system-ui", "Sans"), ("serif", "Serif"), ("monospace", "Sans Mono"), ("ui-monospace", "Sans Mono")))
    with open(conf, "w") as f:
        f.write('<?xml version="1.0"?>\n<!DOCTYPE fontconfig SYSTEM "fonts.dtd">\n<fontconfig>\n'
                '<dir>%s</dir><cachedir>%s</cachedir>\n'
                '<match target="font"><edit name="antialias" mode="assign"><bool>true</bool></edit>'
                '<edit name="hinting" mode="assign"><bool>true</bool></edit><edit name="hintstyle" mode="assign"><const>hintslight</const></edit>'
                '<edit name="rgba" mode="assign"><const>none</const></edit><edit name="embeddedbitmap" mode="assign"><bool>false</bool></edit></match>\n'
                '%s\n</fontconfig>\n' % (d, os.path.join(tmp, "fc-cache"), alias))
    return conf


def environment(chrome, fonts):
    ver = subprocess.run([chrome, "--version"], capture_output=True, text=True).stdout.strip() or "unknown"
    h = hashlib.sha256()
    for name in FONTS:
        h.update(open(fonts[name], "rb").read())
    return "chrome: %s\nfonts: DejaVu (fonts-dejavu-core) sha256 %s\n" % (ver, h.hexdigest()[:16])


# ---------- rendering ----------
def shots(template):
    """[(name, height or None, slide or None)]: one per page, one per slide of a deck."""
    src = open(template, encoding="utf-8").read()
    stem = os.path.splitext(os.path.basename(template))[0]
    if "EdgeDeck.run" in src:
        n = len(re.findall(r'<section\b[^>]*\bclass="[^"]*\bslide\b', src)) or 1
        return [("%s-%d" % (stem, i), 720, i) for i in range(1, n + 1)]
    return [(stem, None, None)]


def prepare(template, tmp):
    out = os.path.join(tmp, os.path.basename(template))
    r = subprocess.run([sys.executable, os.path.join(HERE, "inline.py"), template], capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("inline.py %s: %s" % (template, r.stderr.strip()))
    # no web fonts: the @import of Google Fonts goes, and any other remote font with it
    page = re.sub(r'@import\s+url\(\s*["\']?https?://[^)]*\)\s*;?', "", r.stdout)
    open(out, "w", encoding="utf-8").write(page)
    return out


def render(page, name, height, slide, theme, out, env):
    src = open(page, encoding="utf-8").read()
    frozen = os.path.join(os.path.dirname(page), "%s-%s.html" % (name, theme))
    open(frozen, "w", encoding="utf-8").write(FREEZE % ("location.hash='%d';" % slide if slide else "") + src)
    png = os.path.join(out, "%s-%s.png" % (name, theme))
    args = ["bash", os.path.join(HERE, "shot.sh")] + (["--height", str(height)] if height else ["--full"]) + [frozen, png, theme, "1280"]
    r = subprocess.run(args, capture_output=True, text=True, env=env)
    if r.returncode or not os.path.isfile(png):
        raise RuntimeError("shot.sh %s %s: %s" % (name, theme, (r.stderr or r.stdout).strip()))
    return png


def main(argv):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0], epilog=__doc__.split("\n", 2)[2],
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("names", nargs="*", help="templates to render (default: every templates/*.html)")
    ap.add_argument("--update", action="store_true", help="write the baselines from this render")
    ap.add_argument("--out", default=os.path.join(tempfile.gettempdir(), "trazo-visual"), help="folder for renders and diffs of the failures (default: %(default)s)")
    ap.add_argument("--threshold", type=int, default=32, help="a pixel differs when a channel moves by more than this (default: %(default)s)")
    ap.add_argument("--max-pixels", type=int, default=25, help="differing pixels allowed per image (default: %(default)s)")
    ap.add_argument("--jobs", type=int, default=min(4, os.cpu_count() or 1), help="renders run at once (default: %(default)s)")
    a = ap.parse_args(argv)
    if platform.system() != "Linux":
        print("visual.py: the baselines are made on Linux; elsewhere Chrome draws text otherwise and every image may differ", file=sys.stderr)

    templates = sorted(glob.glob(os.path.join(SKILL, "templates", "*.html")))
    if a.names:
        want = {os.path.splitext(os.path.basename(n))[0] for n in a.names}
        unknown = want - {os.path.splitext(os.path.basename(t))[0] for t in templates}
        if unknown:
            sys.exit("visual.py: no such template: %s" % ", ".join(sorted(unknown)))
        templates = [t for t in templates if os.path.splitext(os.path.basename(t))[0] in want]
    chrome, fonts = find_chrome(), find_fonts()
    env_now = environment(chrome, fonts)
    env_file = os.path.join(BASE, "env.txt")
    env_base = open(env_file).read() if os.path.isfile(env_file) else ""
    if not a.update and env_base and env_base != env_now:
        print("visual.py: the baselines were made with\n  %s\nthis run uses\n  %s\ndifferences may come from that, not from the code"
              % (env_base.strip().replace("\n", "\n  "), env_now.strip().replace("\n", "\n  ")), file=sys.stderr)

    tmp = tempfile.mkdtemp(prefix="trazo-visual-")
    os.makedirs(a.out, exist_ok=True)
    renders = os.path.join(tmp, "png")
    os.makedirs(renders)
    env = dict(os.environ, CHROME=chrome, FONTCONFIG_FILE=setup_fonts(tmp, fonts))
    env.pop("FONTCONFIG_PATH", None)
    jobs = []
    try:
        for t in templates:
            page = prepare(t, tmp)
            for name, height, slide in shots(t):
                for theme in THEMES:
                    jobs.append((page, name, height, slide, theme, t))
                    for old in ("%s-%s.png" % (name, theme), "%s-%s.diff.png" % (name, theme)):   # a past run's
                        if os.path.isfile(os.path.join(a.out, old)):
                            os.remove(os.path.join(a.out, old))
        with concurrent.futures.ThreadPoolExecutor(max(1, a.jobs)) as pool:
            done = list(pool.map(lambda j: (j, render(*j[:5], out=renders, env=env)), jobs))
        rc, seen = 0, set()
        for (page, name, height, slide, theme, t), png in done:
            key = "%s-%s" % (name, theme)
            seen.add(key + ".png")
            base = os.path.join(BASE, key + ".png")
            if a.update:
                w, h, rows = png_read(png)
                os.makedirs(BASE, exist_ok=True)
                png_write(base, w, h, rows)
                print("%s: written (%dx%d, %d KB)" % (key, w, h, os.path.getsize(base) // 1024))
                continue
            if not os.path.isfile(base):
                shutil.copy(png, os.path.join(a.out, key + ".png"))
                print("%s: MISSING baseline tests/visual/%s.png; check the render %s and run visual.py --update %s"
                      % (key, key, os.path.join(a.out, key + ".png"), os.path.splitext(os.path.basename(t))[0]))
                rc = 1
                continue
            got, want = png_read(png), png_read(base)
            big, small, (w, h, rows) = compare(got, want, a.threshold)
            if big > a.max_pixels and got[:2] == want[:2]:   # once in a while a glyph renders differently under load: shoot again before failing
                png = render(page, name, height, slide, theme, out=renders, env=env)
                got = png_read(png)
                big, small, (w, h, rows) = compare(got, want, a.threshold)
            size = "" if got[:2] == want[:2] else " (size %dx%d, baseline %dx%d)" % (got[0], got[1], want[0], want[1])
            if big <= a.max_pixels and not size:
                print("%s: ok%s" % (key, " (%d px within tolerance)" % (big + small) if big + small else ""))
                continue
            shutil.copy(png, os.path.join(a.out, key + ".png"))
            png_write(os.path.join(a.out, key + ".diff.png"), w, h, rows)
            print("%s: DIFFERS: %d px over %d%s; see %s" % (key, big, a.threshold, size, os.path.join(a.out, key + ".diff.png")))
            rc = 1
        if a.update:
            open(env_file, "w").write(env_now)
        elif not a.names:
            for f in sorted(glob.glob(os.path.join(BASE, "*.png"))):
                if os.path.basename(f) not in seen:
                    print("%s: baseline without a template (remove it, or run --update)" % os.path.relpath(f, SKILL))
        return rc
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
