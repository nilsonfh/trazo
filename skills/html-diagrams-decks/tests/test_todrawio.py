"""Tests for todrawio.sh: the three kinds of figure, state machines and swimlanes, and the errors. They need a headless Chrome (see shot.sh)."""
import glob, os, shutil, subprocess, sys, tempfile, unittest
import xml.etree.ElementTree as ET

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(ROOT, "scripts", "todrawio.sh")
CHROME = os.environ.get("CHROME") or next(iter(sorted(glob.glob(os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-*/chrome-headless-shell-*/chrome-headless-shell")) + glob.glob(os.path.expanduser(
    "~/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell")))), None) \
    or shutil.which("chromium") or shutil.which("google-chrome")


@unittest.skipUnless(CHROME, "no headless Chrome")
class ToDrawio(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.dir = tempfile.mkdtemp(dir=os.path.join(ROOT, "tests"))   # beside the tests, so file:// pages load
        for name in ("diagram", "sketch", "state", "swimlane"):
            out = subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "inline.py"), os.path.join(ROOT, "templates", name + ".html")],
                                 capture_output=True, text=True, check=True).stdout
            with open(os.path.join(cls.dir, name + ".html"), "w", encoding="utf-8") as f:
                f.write(out)

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(cls.dir, ignore_errors=True)

    def export(self, page, target):
        out = os.path.join(self.dir, "out.drawio")
        if os.path.exists(out):
            os.remove(out)
        r = subprocess.run(["bash", TOOL, page, target, out, "Test"], capture_output=True, text=True)
        return r, out

    def cells(self, out):
        root = ET.parse(out).getroot()   # well-formed, or this raises
        self.assertEqual(root.tag, "mxfile")
        return root.findall(".//mxCell")

    def test_an_edgediagram_figure_keeps_its_links_attached(self):
        r, out = self.export(os.path.join(self.dir, "diagram.html"), "rq")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("kind edge", r.stdout)
        cells = self.cells(out)
        attached = [c for c in cells if c.get("edge") == "1" and c.get("source") and c.get("target")]
        self.assertGreaterEqual(len(attached), 4)
        self.assertTrue(any("stencil(" in (c.get("style") or "") for c in cells))
        self.assertTrue(any((c.get("value") or "") == "Queue" for c in cells))

    def test_a_fan_keeps_its_branches_attached_and_its_junction_dot(self):
        r, out = self.export(os.path.join(ROOT, "tests", "connectors.html"), "d1")
        self.assertEqual(r.returncode, 0, r.stderr)
        cells = self.cells(out)
        branches = [c for c in cells if c.get("edge") == "1" and c.get("source") and c.get("target")]
        self.assertEqual(len(branches), 4, "three branches and one link")
        self.assertEqual(len([c for c in cells if (c.get("style") or "").startswith("ellipse;")]), 1, "the junction dot")

    def test_a_state_machine_keeps_its_shapes_and_every_transition_attached(self):
        r, out = self.export(os.path.join(self.dir, "state.html"), "lc")
        self.assertEqual(r.returncode, 0, r.stderr)
        cells = self.cells(out)
        styles = [c.get("style") or "" for c in cells]
        self.assertEqual(len([s for s in styles if "shape=startState" in s]), 2, "the two initial states")
        self.assertEqual(len([s for s in styles if "shape=endState" in s]), 1, "the final state")
        self.assertTrue(any(s.startswith("rhombus;") for s in styles), "the choice")
        edges = [c for c in cells if c.get("edge") == "1"]
        self.assertEqual(len(edges), 13)
        self.assertTrue(all(c.get("source") and c.get("target") for c in edges), "every transition attached at both ends")
        self.assertTrue(any(c.get("source") == c.get("target") for c in edges), "the self-transition")
        self.assertIn("quote [EK valid] / store PCRs", [c.get("value") for c in cells])

    def test_lanes_become_swimlanes_and_events_ellipses(self):
        r, out = self.export(os.path.join(self.dir, "swimlane.html"), "ob")
        self.assertEqual(r.returncode, 0, r.stderr)
        cells = self.cells(out)
        lanes = [c for c in cells if (c.get("style") or "").startswith("swimlane;")]
        self.assertEqual(len(lanes), 4)
        self.assertTrue(all("horizontal=0" in c.get("style") for c in lanes), "titles in a head on the left")
        self.assertIn("Operator", lanes[0].get("value"))
        self.assertNotIn("Operator", [c.get("value") for c in cells if c not in lanes], "the title is the lane's, not a loose text")
        self.assertEqual(len([c for c in cells if (c.get("style") or "").startswith("ellipse;") and c.get("vertex") == "1"]), 3, "the start event and the two end events")
        self.assertTrue(any((c.get("style") or "").startswith("rhombus;") for c in cells), "the decision")
        edges = [c for c in cells if c.get("edge") == "1"]
        self.assertTrue(edges and all(c.get("source") and c.get("target") for c in edges), "every flow attached at both ends")

    def test_a_hand_drawn_figure_keeps_boxes_text_icons_and_both_arrowheads(self):
        r, out = self.export(os.path.join(self.dir, "sketch.html"), "mp")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("kind svg", r.stdout)
        cells = self.cells(out)
        styles = [c.get("style") or "" for c in cells]
        values = [c.get("value") or "" for c in cells]
        self.assertIn("Subscriptions", values)
        self.assertTrue(any("rotation=-90" in s for s in styles), "the vertical column titles")
        self.assertTrue(any("endArrow=block" in s and "startArrow=block" in s for s in styles), "two-headed arrows")
        self.assertTrue(any("stencil(" in s for s in styles), "icons")
        self.assertTrue(any("dashed=1" in s and "fillColor=" in s for s in styles), "the dashed planned box")

    def test_an_html_figure(self):
        r, out = self.export(os.path.join(self.dir, "sketch.html"), ".legend")
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("kind html", r.stdout)
        self.assertIn("planned", [c.get("value") for c in self.cells(out)])

    def test_a_target_that_matches_nothing_is_an_error(self):
        r, out = self.export(os.path.join(self.dir, "sketch.html"), "nope")
        self.assertEqual(r.returncode, 1)
        self.assertIn("no element matches nope", r.stderr)
        self.assertFalse(os.path.exists(out))

    def test_an_empty_figure_is_an_error(self):
        shutil.copy(os.path.join(ROOT, "tests", "fixtures", "empty.html"), self.dir)
        r, out = self.export(os.path.join(self.dir, "empty.html"), "e")
        self.assertEqual(r.returncode, 1)
        self.assertIn("came out empty", r.stderr)


if __name__ == "__main__":
    unittest.main()
