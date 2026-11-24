"""scripts/visual.py without Chrome: its PNG reader and writer, the comparison, the deck's shots."""
import os, sys, tempfile, unittest, zlib, struct

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "scripts"))
import visual  # noqa: E402


def image(w, h, at=None, colour=b"\x00\x00\x00"):
    rows = [bytearray(b"\xf0\xf0\xf0" * w) for _ in range(h)]
    for x, y in at or []:
        rows[y][x * 3:x * 3 + 3] = colour
    return w, h, [bytes(r) for r in rows]


class Png(unittest.TestCase):
    def test_write_then_read_gives_the_pixels_back(self):
        w, h, rows = image(7, 5, [(1, 1), (6, 4), (3, 0)], b"\x12\x80\xfe")
        with tempfile.TemporaryDirectory() as d:
            visual.png_write(os.path.join(d, "a.png"), w, h, rows)
            self.assertEqual(visual.png_read(os.path.join(d, "a.png")), (w, h, rows))

    def test_every_filter_and_rgba_are_read(self):
        w, h = 4, 5
        px = [[(x * 40 + y, y * 50, (x * y * 13) % 256, 255) for x in range(w)] for y in range(h)]
        raw, prev = bytearray(), bytearray(w * 4)
        for y in range(h):   # filter y on row y: None, Sub, Up, Average, Paeth
            cur = bytearray(v for p in px[y] for v in p)
            out = bytearray(len(cur))
            for i in range(len(cur)):
                a = cur[i - 4] if i >= 4 else 0
                b, c = prev[i], (prev[i - 4] if i >= 4 else 0)
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                pred = [0, a, b, (a + b) // 2, a if pa <= pb and pa <= pc else b if pb <= pc else c][y]
                out[i] = (cur[i] - pred) & 255
            raw += bytes([y]) + out
            prev = cur

        def chunk(k, body):
            return struct.pack(">I", len(body)) + k + body + struct.pack(">I", zlib.crc32(k + body))
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "f.png")
            open(p, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)) +
                                chunk(b"IDAT", zlib.compress(bytes(raw))) + chunk(b"IEND", b""))
            _, _, rows = visual.png_read(p)
        self.assertEqual(rows, [bytes(v for p in r for v in p[:3]) for r in px])


class Compare(unittest.TestCase):
    def test_same_image(self):
        big, small, _ = visual.compare(image(5, 5), image(5, 5), 32)
        self.assertEqual((big, small), (0, 0))

    def test_small_and_large_differences(self):
        a = image(5, 5, [(1, 1)], b"\xe0\xe0\xe0")   # 16 off: within the threshold
        b = image(5, 5, [(2, 2), (3, 3)])            # far off
        big, small, (w, h, rows) = visual.compare(a, image(5, 5), 32)
        self.assertEqual((big, small), (0, 1))
        big, small, (w, h, rows) = visual.compare(b, image(5, 5), 32)
        self.assertEqual((big, small, w, h), (2, 0, 5, 5))
        self.assertEqual(rows[2][6:9], b"\xe0\x10\x10")

    def test_a_size_difference_counts_the_pixels_outside(self):
        big, _, (w, h, _) = visual.compare(image(5, 6), image(5, 5), 32)
        self.assertEqual((big, w, h), (5, 5, 6))


class Shots(unittest.TestCase):
    def test_a_deck_is_shot_slide_by_slide(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "talk.html")
            open(p, "w").write('<section class="slide s-title"></section><section class="slide"></section><script>EdgeDeck.run({})</script>')
            self.assertEqual(visual.shots(p), [("talk-1", 720, 1), ("talk-2", 720, 2)])
            q = os.path.join(d, "fig.html")
            open(q, "w").write('<svg role="img"></svg>')
            self.assertEqual(visual.shots(q), [("fig", None, None)])


if __name__ == "__main__":
    unittest.main()
