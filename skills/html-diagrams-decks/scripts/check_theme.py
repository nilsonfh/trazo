#!/usr/bin/env python3
"""Check a theme's contrast in light and dark (WCAG 2 ratios), before using it.

    check_theme.py themes/drafting.css [more.css ...]      # exit 1 if any pair fails

Light values are read from the first bare :root block, dark values from :root[data-theme="dark"], and
the dark block under prefers-color-scheme must define the same values (a theme whose two dark blocks
drift apart looks different with the toggle than with the system setting). Every token of the
contract must be defined. Text pairs need 4.5:1; tone strokes and the accent as a link or outline need 3:1.
"""
import re, sys

TEXT = [  # (foreground, background), 4.5:1
    ('ink', 'bg'), ('ink', 'card'), ('ink2', 'bg'), ('ink2', 'card'), ('muted', 'bg'), ('muted', 'card'),
    ('accent', 'card'), ('accent', 'accent-soft'),
    ('ok', 'ok-soft'), ('warn', 'warn-soft'), ('bad', 'bad-soft'), ('p3', 'p3-soft'), ('p3', 'card'),
    ('ed-ink', 'ed-surface'), ('ed-ink', 'ed-layer'), ('ed-ink2', 'ed-surface'), ('ed-muted', 'ed-surface'), ('ed-muted', 'ed-layer'),
    ('ed-ink', 'ed-accent-soft'), ('ed-ink', 'ed-gap-soft'), ('ed-ink', 'ed-add-soft'), ('ed-ink', 'ed-p3-soft'),
    ('ed-tip-ink', 'ed-tip-bg'),
    # muted text on a soft fill: a box's subtitle or a row's note, in a figure or on the page
    ('muted', 'accent-soft'), ('muted', 'ok-soft'), ('muted', 'warn-soft'), ('muted', 'bad-soft'), ('muted', 'p3-soft'),
    ('ed-muted', 'ed-accent-soft'), ('ed-muted', 'ed-gap-soft'), ('ed-muted', 'ed-add-soft'), ('ed-muted', 'ed-p3-soft'),
]
MARK = [  # strokes, arrowheads, outlines: 3:1
    ('ed-accent', 'ed-surface'), ('ed-accent', 'ed-layer'), ('ed-gap', 'ed-surface'), ('ed-gap', 'ed-layer'), ('ed-gap', 'ed-gap-soft'),
    ('ed-add', 'ed-surface'), ('ed-add', 'ed-layer'), ('ed-add', 'ed-add-soft'), ('accent', 'bg'),
    ('ed-p3', 'ed-surface'), ('ed-p3', 'ed-layer'), ('ed-p3', 'ed-p3-soft'),
]

def lum(h):
    h = h.lstrip('#'); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    c = [x / 12.92 if x <= 0.03928 else ((x + 0.055) / 1.055) ** 2.4 for x in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]

def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)

def tokens(block):
    return dict(re.findall(r'--([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{6})', block))

def failures(t):
    """The pairs of one mode's tokens that miss their ratio: [(fg, bg, ratio, need)]; a missing token has ratio None."""
    out = []
    for pairs, need in ((TEXT, 4.5), (MARK, 3.0)):
        for fg, bg in pairs:
            if fg not in t or bg not in t:
                out.append((fg, bg, None, need)); continue
            r = ratio(t[fg], t[bg])
            if r < need:
                out.append((fg, bg, r, need))
    return out


def main(paths):
    bad = 0
    for path in paths:
        css = re.sub(r'/\*.*?\*/', '', open(path, encoding='utf-8').read(), flags=re.S)
        light = tokens(re.search(r'(?m)^:root\s*\{(.*?)\}', css, re.S).group(1))
        dark_own = tokens(re.search(r':root\[data-theme="dark"\]\s*\{(.*?)\}', css, re.S).group(1))
        dark = dict(light); dark.update(dark_own)
        print(path)
        media = re.search(r'prefers-color-scheme:\s*dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{(.*?)\}', css, re.S)
        if not media:
            print('  no dark block under prefers-color-scheme'); bad += 1
        elif tokens(media.group(1)) != dark_own:
            diff = sorted(set(tokens(media.group(1)).items()) ^ set(dark_own.items()))
            print('  the two dark blocks differ: ' + ', '.join('--%s:%s' % kv for kv in diff)); bad += 1
        for mode, t in (('light', light), ('dark', dark)):
            for fg, bg, r, need in failures(t):
                if r is None:
                    print(f'  {mode:5} missing --{fg if fg not in t else bg}')
                else:
                    print(f'  {mode:5} FAIL --{fg} on --{bg}: {r:.2f} < {need}')
                bad += 1
            print(f'  {mode:5} checked {len(TEXT) + len(MARK)} pairs')
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
