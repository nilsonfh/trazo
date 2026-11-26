"""Tests for the tools: inline.py, check_theme.py, theme_from_design.py, topdf.sh, the icon gallery and the version stamps. Run with scripts/test.sh, or python3 -m unittest discover -s tests."""
import glob, os, re, shutil, subprocess, sys, tempfile, unittest

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INLINE = os.path.join(ROOT, "scripts", "inline.py")
CHECK = os.path.join(ROOT, "scripts", "check_theme.py")


def chrome():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    found = sorted(glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell"))
                   + glob.glob(os.path.expanduser("~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell")))
    return found[-1] if found else shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")


def run(*args):
    return subprocess.run([sys.executable, *args], capture_output=True, text=True)


class Inline(unittest.TestCase):
    def page(self, body):
        d = tempfile.mkdtemp()
        p = os.path.join(d, "page.html")
        with open(p, "w", encoding="utf-8") as f:
            f.write(body)
        return p

    def test_inlines_library_and_theme_whatever_the_attributes(self):
        p = self.page('<link rel="stylesheet" href="../themes/engineering.css">\n'
                      '<script defer src="../lib/edgediagram.js"></script>\n'
                      '<script src="../lib/edgesketch.js" async></script>\n'
                      '<script src="../lib/icons.js"></script>\n'
                      '<script src="https://cdnjs.cloudflare.com/ajax/libs/gsap/3.12.5/gsap.min.js"></script>')
        r = run(INLINE, p)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("EdgeDiagram v1.6.0", r.stdout)
        self.assertIn("EdgeSketch v1.6.0", r.stdout)
        self.assertIn("window.EDGE_ICONS", r.stdout)
        self.assertIn("--ed-p3:", r.stdout)
        self.assertIn("gsap.min.js", r.stdout)
        self.assertNotIn('src="../lib', r.stdout)
        self.assertNotIn("</script", r.stdout.replace("</script>", ""))

    def test_missing_theme_is_an_error(self):
        r = run(INLINE, self.page('<link rel="stylesheet" href="themes/nope.css">'))
        self.assertEqual(r.returncode, 1)
        self.assertIn("theme nope not found", r.stderr)

    def test_a_library_file_twice_is_an_error(self):
        r = run(INLINE, self.page('<script src="a/icons.js"></script><script src="b/icons.js"></script>'))
        self.assertEqual(r.returncode, 1)
        self.assertIn("icons.js is included twice", r.stderr)

    def test_other_local_scripts_are_reported(self):
        r = run(INLINE, self.page('<script src="mine.js"></script>'))
        self.assertEqual(r.returncode, 0)
        self.assertIn("mine.js", r.stderr)
        self.assertIn('<script src="mine.js"></script>', r.stdout)

    def test_a_vendored_copy_finds_its_files_beside_it(self):
        d = tempfile.mkdtemp()
        r = subprocess.run(["sh", os.path.join(ROOT, "scripts", "vendor.sh"), d], capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        p = self.page('<link rel="stylesheet" href="x/themes/drafting.css"><script src="x/edgedeck.js"></script>')
        r = run(os.path.join(d, "inline.py"), p)
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("EdgeDeck v1.6.0", r.stdout)
        self.assertIn("Barlow", r.stdout)


class Themes(unittest.TestCase):
    def test_every_theme_passes(self):
        themes = sorted(os.path.join(ROOT, "themes", f) for f in os.listdir(os.path.join(ROOT, "themes")) if f.endswith(".css"))
        r = run(CHECK, *themes)
        self.assertEqual(r.returncode, 0, r.stdout)

    def test_drifting_dark_blocks_fail(self):
        with open(os.path.join(ROOT, "themes", "engineering.css"), encoding="utf-8") as f:
            src = f.read()
        i = src.index(':root[data-theme="dark"]')
        bad = src[:i] + src[i:].replace("--ink:#e6ece9", "--ink:#ffffff", 1)
        d = tempfile.mkdtemp()
        p = os.path.join(d, "drift.css")
        with open(p, "w", encoding="utf-8") as f:
            f.write(bad)
        r = run(CHECK, p)
        self.assertEqual(r.returncode, 1)
        self.assertIn("the two dark blocks differ", r.stdout)

    def test_low_contrast_fails(self):
        with open(os.path.join(ROOT, "themes", "engineering.css"), encoding="utf-8") as f:
            src = f.read()
        bad = src.replace("--muted:#5a6963", "--muted:#c8d0cc", 1)
        d = tempfile.mkdtemp()
        p = os.path.join(d, "pale.css")
        with open(p, "w", encoding="utf-8") as f:
            f.write(bad)
        r = run(CHECK, p)
        self.assertEqual(r.returncode, 1)
        self.assertIn("FAIL --muted", r.stdout)


class ThemeFromDesign(unittest.TestCase):
    TOOL = os.path.join(ROOT, "scripts", "theme_from_design.py")

    def make(self, design, *extra):
        d = tempfile.mkdtemp()
        out = os.path.join(d, "t.css")
        r = run(self.TOOL, design, "--fonts", "none", "-o", out, *extra)
        self.assertEqual(r.returncode, 0, r.stderr)
        c = run(CHECK, out)
        self.assertEqual(c.returncode, 0, c.stdout)
        with open(out, encoding="utf-8") as f:
            return f.read(), r

    def test_example_keeps_its_own_colours(self):
        css, _ = self.make(os.path.join(ROOT, "examples", "design-md", "DESIGN.md"))
        self.assertIn("own mode is light", css)
        self.assertIn("accent <- primary", css)
        self.assertIn("--accent:#1f5f8b;", css)
        self.assertIn("--card:#fbf8f2;", css)
        self.assertIn('--display:Fraunces,', css)
        self.assertIn("p3 <- tertiary", css)

    def test_prose_without_front_matter_and_a_dark_native_palette(self):
        css, _ = self.make(os.path.join(ROOT, "tests", "fixtures", "night.md"))
        self.assertIn("own mode is dark", css)
        dark = css[css.index(':root[data-theme="dark"]'):]
        self.assertIn("--bg:#0d1013;", dark)
        self.assertIn("--card:#161b20;", dark)
        self.assertIn("--ink:#e8ecef;", dark)

    def test_light_and_dark_groups_and_a_description_that_is_not_valid_yaml(self):
        css, _ = self.make(os.path.join(ROOT, "tests", "fixtures", "modes.md"))
        light = css[:css.index("@media")]
        dark = css[css.index(':root[data-theme="dark"]'):]
        self.assertIn("--card:#ffffff;", light)
        self.assertIn("--card:#262626;", dark)
        self.assertIn("--ink:#f4f4f4;", dark)

    def test_a_tone_with_the_accents_hue_is_replaced(self):
        css, _ = self.make(os.path.join(ROOT, "tests", "fixtures", "clash.md"))
        self.assertIn("ok <- #0f766e (its own had the accent's hue)", css)

    def test_explain_reports_every_role(self):
        _, r = self.make(os.path.join(ROOT, "examples", "design-md", "DESIGN.md"), "--explain")
        self.assertIn("light: accent <- primary", r.stderr)


class Icons(unittest.TestCase):
    def names(self):
        src = open(os.path.join(ROOT, "lib", "icons.js"), encoding="utf-8").read()
        return src, re.findall(r'<symbol id=\\"i-([^\\"]+)\\"', src)

    def test_the_count_is_the_one_the_docs_give(self):
        src, names = self.names()
        self.assertEqual(len(names), len(set(names)), "a name twice")
        self.assertIn("%d icons" % len(names), src.split("\n")[0])
        self.assertIn("There are %d." % len(names), open(os.path.join(ROOT, "references", "api.md"), encoding="utf-8").read())

    @unittest.skipUnless(chrome(), "no Chrome")
    def test_the_gallery_shows_every_icon(self):
        _, names = self.names()
        d = tempfile.mkdtemp()
        page = os.path.join(d, "icons.html")
        r = run(INLINE, os.path.join(ROOT, "templates", "icons.html"))
        self.assertEqual(r.returncode, 0, r.stderr)
        with open(page, "w", encoding="utf-8") as f:
            f.write(r.stdout)
        dom = subprocess.run([chrome(), "--headless", "--no-sandbox", "--virtual-time-budget=2000", "--dump-dom", "file://" + page],
                             capture_output=True, text=True).stdout
        self.assertEqual(re.findall(r'class="tile" data-name="([^"]+)"', dom), names)
        self.assertIn('id="count" aria-live="polite">%d / %d<' % (len(names), len(names)), dom)


@unittest.skipUnless(chrome(), "no Chrome")
class ToPdf(unittest.TestCase):
    TOOL = os.path.join(ROOT, "scripts", "topdf.sh")

    def pdf(self, template, *opts):
        d = tempfile.mkdtemp()
        page, out = os.path.join(d, "page.html"), os.path.join(d, "out.pdf")
        r = run(INLINE, os.path.join(ROOT, "templates", template))
        with open(page, "w", encoding="utf-8") as f:
            f.write(r.stdout)
        r = subprocess.run(["bash", self.TOOL, *opts, page, out], capture_output=True, text=True, env=dict(os.environ, CHROME=chrome()))
        self.assertEqual(r.returncode, 0, r.stderr)
        data = open(out, "rb").read()
        boxes = [tuple(float(v) for v in m.split()) for m in re.findall(rb"/MediaBox\s*\[([^\]]*)\]", data)]
        return len(re.findall(rb"/Type\s*/Page\b", data)), boxes

    def test_a_deck_prints_a_169_page_per_slide(self):
        n, boxes = self.pdf("deck.html")
        self.assertEqual(n, 2)
        for b in boxes:
            self.assertAlmostEqual((b[2] - b[0]) / (b[3] - b[1]), 16 / 9, places=2)

    def test_steps_print_a_page_per_step(self):
        n, _ = self.pdf("deck.html", "--steps", "--dark")
        self.assertEqual(n, 4)   # the title, and the three steps of the second slide

    def test_a_plain_page_prints(self):
        n, _ = self.pdf("sketch.html")
        self.assertGreaterEqual(n, 1)

    def test_trazo_pdf_runs_it(self):
        top = os.path.dirname(os.path.dirname(ROOT))
        if not os.path.exists(os.path.join(top, "src", "trazo", "cli.py")):
            self.skipTest("the skill without the package")
        sys.path.insert(0, os.path.join(top, "src"))
        try:
            from trazo import cli
        finally:
            sys.path.pop(0)
        self.assertEqual(cli.TOOLS["pdf"], ("topdf.sh", []))


class Versions(unittest.TestCase):
    def test_every_stamp_says_the_same_version(self):
        import re
        want = open(os.path.join(ROOT, "VERSION")).read().strip()
        top = os.path.dirname(os.path.dirname(ROOT))
        stamps = {"pyproject.toml": r'^version = "([^"]+)"', "src/trazo/__init__.py": r'__version__ = "([^"]+)"'}
        for f in ("edgediagram", "edgelayout", "edgesketch", "edgesequence", "edgetimeline", "edgematrix", "edgetext", "edgedeck", "icons"):
            stamps[os.path.join(ROOT, "lib", f + ".js")] = r"v(\d+\.\d+\.\d+)"
        for f, rx in stamps.items():
            p = f if os.path.isabs(f) else os.path.join(top, f)
            if not os.path.exists(p):   # the skill copied alone, without the package around it
                continue
            m = re.search(rx, open(p, encoding="utf-8").read(), re.M)
            self.assertEqual(m and m.group(1), want, f)


if __name__ == "__main__":
    unittest.main()
