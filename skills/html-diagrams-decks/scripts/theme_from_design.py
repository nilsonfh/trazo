#!/usr/bin/env python3
"""Make a theme from a DESIGN.md file: its colours and faces, mapped onto this library's token contract.

    theme_from_design.py DESIGN.md > themes/harbor.css
    theme_from_design.py DESIGN.md --name harbor --fonts none -o themes/harbor.css
    theme_from_design.py DESIGN.md --explain          # how each token was chosen, on stderr

DESIGN.md is the open format of Google Labs (github.com/google-labs-code/design.md): YAML front matter
with `colors`, `typography` and more, then prose. Colour names are free, so the roles are found by name:

    surfaces   background, canvas, surface, paper, bg (not on-*, inverse-* or tint)
    ink        on-surface, on-background, ink, text, foreground; ink2 and muted from their -secondary,
               -muted, -variant, -subtle, -tertiary siblings
    rule       hairline, border, outline, divider, rule
    accent     primary, else brand or accent, else the most saturated colour
    ok, warn, bad, p3   success, warning, error and danger, and a violet or a tertiary that is not the accent

A `light` and a `dark` group under `colors` give both modes. Otherwise the palette's own mode is the
one its background shows (Linear's is dark, Stripe's light), and the other is derived: from its
inverse-* colours where it has them, else from its ink and surfaces. A role the file does not have
takes the engineering theme's tone, moved towards the accent's lightness. Every pair that
check_theme.py checks is then brought to its ratio, by moving the foreground towards black or white,
and the header of the theme lists what was found, derived and adjusted.

Faces: display from a display, headline or heading level, body from a body level, mono from a code or
mono level or a family named Mono. With --fonts google (the default) each family is looked up on Google
Fonts and imported when it is there; a family that is not (a brand's own face) keeps the stack the file
gives, so it falls back to system faces. --fonts none imports nothing.
"""
import argparse, colorsys, os, re, sys, urllib.parse, urllib.request

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from check_theme import failures, ratio, lum  # noqa: E402

DEFAULTS = {  # the engineering theme's tones, used when a file has no such role
    'ok': '#0b7a0b', 'warn': '#8f5f00', 'gap': '#ad7600', 'bad': '#b42318', 'p3': '#6b46c1', 'accent': '#2456a4',
}
SANS = 'system-ui,-apple-system,"Segoe UI",sans-serif'
MONO = 'ui-monospace,SFMono-Regular,Menlo,monospace'


# ---------- front matter ----------
def front_matter(text):
    text = text.lstrip('﻿')
    m = re.match(r'---\s*\n(.*?)\n---\s*(\n|$)', text, re.S)
    if not m:
        return prose(text)
    src = m.group(1)
    try:
        import yaml
        fm = yaml.safe_load(src) or {}
    except ImportError:
        fm = mini_yaml(src)
    except Exception:   # not valid YAML (an unquoted colon in a description): the small parser is more forgiving
        fm = mini_yaml(src)
    if not fm.get('colors'):
        fm['colors'] = prose(text)['colors']
    return fm


# a colour given in prose: "- **Spotify Green** (`#1ed760`): Primary brand accent"
PROSE_ROLES = [
    (r'\b(error|negative|danger|destructive)\b', 'error'), (r'\bwarning\b', 'warning'), (r'\b(success|positive)\b', 'success'),
    (r'(\bprimary (cta|button|brand|accent|action|colou?r|interactive)|\bbrand (colou?r|accent)|\baccent\b|\bcta\b|call to action)', 'primary'),
    (r'(tertiary text|muted (text|label)|placeholder|disabled|caption)', 'ink-subtle'), (r'secondary text', 'ink-secondary'),
    (r'\b(primary text|body text|text|heading|foreground)\b', 'ink'), (r'\b(border|divider|separator|hairline|stroke)\b', 'hairline'),
    (r'\b(background|canvas|page)\b', 'background'), (r'\b(surface|card|container|panel)\b', 'surface'),
    (r'\b(primary|brand|accent|cta|call to action)\b', 'primary'), (r'(violet|purple|lavender|magenta)', 'violet'),
]


def prose(text):
    """The colours of a DESIGN.md without front matter, from its bullet lines, named by what they say they are for."""
    name = re.search(r'^#\s+(.+)$', text, re.M)
    cols = {}
    for line in text.split('\n'):
        m = re.match(r'\s*[-*]\s+\*\*([^*]+)\*\*\s*\(?`?(#[0-9a-fA-F]{3,8})`?\)?\s*[:\-—]\s*(.*)$', line)
        if not m:
            continue
        label, hx, desc = m.group(1), m.group(2), m.group(3)
        words = (label + ' ' + re.split(r'\s[\u2014\u2013-]\s|[(;]', desc)[0]).lower()   # the label and the first clause
        if re.search(r'\b(rare|light-mode|light mode|dark-mode|dark mode)\b', words):
            continue
        for pat, role in PROSE_ROLES:
            if re.search(pat, words):
                key = role
                if role in ('background', 'surface') and role in cols:   # keep every surface: roles are chosen by lightness
                    key = 'surface-%d' % len(cols)
                cols.setdefault(key, hx)
                break
    return {'name': name.group(1).strip() if name else None, 'colors': cols}


def mini_yaml(src):
    """Enough YAML for DESIGN.md front matter: nested maps of scalars, comments, quoted strings, block scalars."""
    root, stack = {}, [(-1, None)]
    stack[0] = (-1, root)
    lines = src.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i]; i += 1
        if not line.strip() or line.lstrip().startswith('#') or line.lstrip().startswith('- '):
            continue
        ind = len(line) - len(line.lstrip())
        m = re.match(r'\s*([^:]+?)\s*:\s*(.*)$', line)
        if not m:
            continue
        key, val = m.group(1).strip().strip('"\''), m.group(2)
        while stack and stack[-1][0] >= ind:
            stack.pop()
        parent = stack[-1][1]
        if val in ('', '|', '>', '|-', '>-'):
            if val:   # a block scalar: the more indented lines that follow
                buf = []
                while i < len(lines) and (not lines[i].strip() or len(lines[i]) - len(lines[i].lstrip()) > ind):
                    buf.append(lines[i].strip()); i += 1
                parent[key] = ' '.join(b for b in buf if b)
            else:
                parent[key] = {}
                stack.append((ind, parent[key]))
            continue
        val = val.strip()
        if val[:1] in '"\'':
            q = val[0]; end = val.find(q, 1)
            val = val[1:end] if end > 0 else val[1:]
        else:
            val = re.sub(r'\s+#.*$', '', val)
        parent[key] = val
    return root


# ---------- colour ----------
def parse_color(v):
    if not isinstance(v, str):
        return None
    v = v.strip()
    m = re.fullmatch(r'#([0-9a-fA-F]{3,8})', v)
    if m:
        h = m.group(1)
        if len(h) in (3, 4):
            h = ''.join(c * 2 for c in h[:3])
        return '#' + h[:6].lower()
    m = re.fullmatch(r'rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+).*\)', v)
    if m:
        return '#%02x%02x%02x' % tuple(int(round(float(x))) for x in m.groups())
    m = re.fullmatch(r'hsla?\(\s*([\d.]+)(?:deg)?[ ,]+([\d.]+)%[ ,]+([\d.]+)%.*\)', v)
    if m:
        r, g, b = colorsys.hls_to_rgb(float(m.group(1)) / 360, float(m.group(3)) / 100, float(m.group(2)) / 100)
        return '#%02x%02x%02x' % (round(r * 255), round(g * 255), round(b * 255))
    named = {'white': '#ffffff', 'black': '#000000'}
    return named.get(v.lower())


def rgb(h):
    return [int(h[i:i + 2], 16) for i in (1, 3, 5)]


def hexof(c):
    return '#%02x%02x%02x' % tuple(max(0, min(255, round(x))) for x in c)


def mix(a, b, t):
    """a moved a fraction t of the way to b."""
    return hexof([x + (y - x) * t for x, y in zip(rgb(a), rgb(b))])


def sat(h):
    r, g, b = (x / 255 for x in rgb(h))
    return colorsys.rgb_to_hls(r, g, b)[2]


def hue(h):
    r, g, b = (x / 255 for x in rgb(h))
    return colorsys.rgb_to_hls(r, g, b)[0] * 360


def chroma(h):
    c = rgb(h)
    return (max(c) - min(c)) / 255


def ensure(fg, bgs, need):
    """fg moved towards black or white, whichever the backgrounds call for, until it reaches `need` on all of them."""
    if all(ratio(fg, b) >= need for b in bgs):
        return fg
    dark_bg = sum(lum(b) for b in bgs) / len(bgs) < 0.18
    target = '#ffffff' if dark_bg else '#000000'
    for k in range(1, 41):
        c = mix(fg, target, k / 40)
        if all(ratio(c, b) >= need for b in bgs):
            return c
    return target


# ---------- roles ----------
def flatten(colors, prefix=''):
    out = {}
    for k, v in (colors or {}).items():
        k = str(k).lower()
        if isinstance(v, dict):
            out.update(flatten(v, prefix + k + '.'))
        else:
            c = parse_color(v)
            if c:
                out[prefix + k] = c
    return out


def resolve_refs(fm):
    """{colors.x} references inside colors, resolved."""
    cols = fm.get('colors') or {}
    flat = {}
    def walk(d, p):
        for k, v in d.items():
            if isinstance(v, dict):
                walk(v, p + str(k) + '.')
            else:
                flat[p + str(k)] = v
    walk(cols, 'colors.')
    def res(v, depth=0):
        m = re.fullmatch(r'\{(colors\.[^}]+)\}', str(v).strip())
        return res(flat.get(m.group(1), v), depth + 1) if m and depth < 8 else v
    def fix(d):
        return {k: fix(v) if isinstance(v, dict) else res(v) for k, v in d.items()}
    return fix(cols)


def pick(cols, patterns, exclude=r'^(on-|inverse)|tint'):
    for p in patterns:
        for k, v in cols.items():
            base = k.split('.')[-1]
            if re.search(exclude, base):
                continue
            if re.search(p, base):
                return k, v
    return None, None


def roles(cols, why):
    """One mode's roles from a flat {name: hex} map."""
    r = {}
    surf = {k: v for k, v in cols.items() if re.search(r'(background|canvas|surface|paper|^bg$|^base$)', k.split('.')[-1])
            and not re.search(r'^(on-|inverse)|tint|variant|bright|overlay', k.split('.')[-1])}
    if surf:
        ordered = sorted(surf.items(), key=lambda kv: lum(kv[1]))
        polarity = 'dark' if lum(ordered[0][1]) < 0.18 and lum(ordered[-1][1]) < 0.35 else 'light'
        page = next((v for k, v in surf.items() if k.split('.')[-1] in ('background', 'canvas')), None)
        if page:   # the page's own background decides
            polarity = 'dark' if lum(page) < 0.18 else 'light'
            ordered = [kv for kv in ordered if (lum(kv[1]) < 0.35) == (polarity == 'dark')] or ordered
        if polarity == 'light':
            card = ordered[-1]; rest = [kv for kv in ordered[:-1] if lum(kv[1]) > 0.5]
            bg = rest[-1] if rest else None
        else:
            bg = ordered[0]; rest = [kv for kv in ordered[1:] if lum(kv[1]) < 0.2]
            card = rest[0] if rest else None
        if card: r['card'] = card[1]; why['card'] = card[0]
        if bg: r['bg'] = bg[1]; why['bg'] = bg[0]
    for role, pats in (
        ('ink', [r'^(on-surface|on-background|ink|text|foreground|fg|body|neutral-900)$', r'^(ink|text|foreground)(-primary|-1)?$']),
        ('ink2', [r'^(ink|text|on-surface|foreground)[-_]?(secondary|2|variant)$', r'^(ink|text)[-_]?(muted|soft)$']),
        ('muted', [r'^(ink|text|on-surface|foreground)[-_]?(subtle|tertiary|3|placeholder)$', r'^(ink|text|on-surface|foreground)[-_]?(mute[d]?|disabled)$', r'(muted|subtle)$']),
        ('rule', [r'^(hairline|border|divider|rule|outline-variant|stroke|line)$', r'(hairline|border|divider|outline)']),
        ('accent', [r'^primary$', r'^(brand|accent)(-primary)?$', r'^(brand|accent)']),
        ('ok', [r'(success|positive|^green)']),
        ('warn', [r'(warning|caution|amber|^yellow|^orange)']),
        ('bad', [r'(^error$|danger|negative|critical|^red|^ruby)', r'error']),
        ('p3', [r'(violet|purple|lavender|magenta|^tertiary$)']),
    ):
        k, v = pick(cols, pats, r'^inverse|tint' if role in ('ink', 'ink2', 'muted') else r'^(on-|inverse)|tint')
        if v and role == 'muted' and v == r.get('ink2'):
            continue
        if v:
            r[role] = v; why[role] = k
    # an accent with no colour of its own (white, grey) is no accent: try the next candidates
    if 'accent' in r and chroma(r['accent']) < 0.18:
        named = [kv for n in ('secondary', 'tertiary') for kv in cols.items() if kv[0].split('.')[-1] == n]
        for k, v in named + sorted(cols.items(), key=lambda kv: -chroma(kv[1])):
            if chroma(v) >= 0.18 and not re.search(r'^(on-|inverse)|error|danger|success|warning', k.split('.')[-1]):
                why['accent'] = k + ' (the primary has no colour of its own)'; r['accent'] = v; break
    if 'p3' in r and 'accent' in r and (abs(hue(r['p3']) - hue(r['accent'])) % 360 < 30 or chroma(r['p3']) < 0.18):
        del r['p3']; why.pop('p3', None)
    return r


def hue_gap(a, b):
    d = abs(hue(a) - hue(b)) % 360
    return min(d, 360 - d)


# what a tone falls back to when its own colour has the accent's hue: the same meaning in another hue
ALTERNATES = {'ok': ['#0b7a0b', '#0f766e', '#1d4ed8'], 'warn': ['#8f5f00', '#b42318', '#a21caf'],
              'p3': ['#6b46c1', '#a21caf', '#0f766e']}


def apart(c, accent, role, why):
    """A tone whose hue is the accent's is replaced, so the two never read as one. Bad keeps its red: it is a status, not a tone of the figures."""
    if role not in ALTERNATES or chroma(c) < 0.18 or chroma(accent) < 0.18 or hue_gap(c, accent) >= 30:
        return c
    for x in ALTERNATES[role]:
        if hue_gap(x, accent) >= 30:
            why[role] = '%s (its own had the accent\'s hue)' % x
            return x
    return c


def polarity_of(r):
    return 'dark' if lum(r.get('bg', r.get('card', '#ffffff'))) < 0.18 else 'light'


def complete(r, mode, accent_hint, why, inverse=None):
    """Fill the roles a file lacks, for one mode."""
    t = dict(r)
    ink_base = t.get('ink') or ('#15181d' if mode == 'light' else '#e8ebef')
    if mode == 'light':
        t.setdefault('card', (inverse or {}).get('card') or mix('#ffffff', accent_hint, 0.015))
        t.setdefault('bg', mix(t['card'], mix(ink_base, accent_hint, .3), 0.05))
        t.setdefault('ink', (inverse or {}).get('ink') or mix('#15181d', accent_hint, .12))
    else:
        t.setdefault('bg', mix('#090b0e', accent_hint, 0.06))
        t.setdefault('card', mix(t['bg'], '#ffffff', 0.045))
        t.setdefault('ink', mix('#eceff3', accent_hint, .05))
    t.setdefault('ink2', mix(t['ink'], t['card'], 0.22))
    t.setdefault('muted', mix(t['ink'], t['card'], 0.42))
    t.setdefault('rule', mix(t['card'], t['ink'], 0.14 if mode == 'light' else 0.17))
    t.setdefault('accent', accent_hint)
    for k in ('ok', 'warn', 'bad', 'p3'):
        if k not in t:
            t[k] = DEFAULTS[k]; why.setdefault(k, 'default (the file has none)')
    for k in ('card', 'bg', 'ink', 'ink2', 'muted', 'rule', 'accent'):
        why.setdefault(k, 'derived')
    return t


def tokens_for(t, mode):
    """The whole contract for one mode from its roles, every pair brought to its ratio."""
    L = mode == 'light'
    card, bg, ink = t['card'], t['bg'], t['ink']
    soft = (lambda c: mix(c, card, 0.88)) if L else (lambda c: mix(c, card, 0.78))
    out = {'bg': bg, 'card': card, 'ink': ink, 'ink2': t['ink2'], 'muted': t['muted'], 'rule': t['rule']}
    base = {k: t[k] for k in ('accent', 'ok', 'warn', 'bad', 'p3')}
    if not L:   # a tone drawn on a dark ground starts from a lighter version of itself
        base = {k: ensure(v, [card], 4.5) for k, v in base.items()}
    for k, v in base.items():
        out[k + '-soft'] = soft(v)
        out[k] = v
    out['ed-ink'], out['ed-ink2'], out['ed-muted'] = ink, t['ink2'], t['muted']
    out['ed-surface'] = card if L else mix(card, ink, 0.04)
    out['ed-layer'] = mix(bg, ink, 0.035) if L else mix(card, ink, 0.065)
    out['ed-rule'] = t['rule']
    out['ed-accent'], out['ed-accent-soft'] = base['accent'], out['accent-soft']
    out['ed-gap'], out['ed-gap-soft'] = base['warn'], out['warn-soft']
    out['ed-add'], out['ed-add-soft'] = base['ok'], out['ok-soft']
    out['ed-p3'], out['ed-p3-soft'] = base['p3'], out['p3-soft']
    out['ed-tip-bg'], out['ed-tip-ink'] = ink, card
    adjusted = []
    level = {k: (0.88 if L else 0.78) for k in base}
    mirror = {'accent': 'ed-accent-soft', 'warn': 'ed-gap-soft', 'ok': 'ed-add-soft', 'p3': 'ed-p3-soft'}
    for _ in range(12):
        fails = failures(out)
        if not fails:
            break
        # a soft fill that its own tone or the ink cannot be read on moves closer to the card
        softs = {b[3:] if b.startswith('ed-') else b for f, b, r, n in fails if b.endswith('-soft')}
        for sk in softs:
            k = {'gap-soft': 'warn', 'add-soft': 'ok'}.get(sk, sk[:-5])
            if k in level and level[k] < 0.96:
                level[k] = min(0.96, level[k] + 0.03)
                out[k + '-soft'] = mix(base[k], card, level[k])
                if k in mirror: out[mirror[k]] = out[k + '-soft']
        fails = failures(out)
        # then each failing foreground moves towards black or white until it reaches its ratio on all its backgrounds
        for fg in sorted({f[0] for f in fails}):
            need = max(n for f, b, r, n in fails if f == fg)
            allbgs = [out[b] for f, b, r, n in fails if f == fg]
            before = out[fg]
            out[fg] = ensure(out[fg], allbgs, need)
            if out[fg] != before:
                adjusted.append('%s %s -> %s' % (fg, before, out[fg]))
    return out, adjusted


# ---------- faces ----------
def faces(fm):
    typ = fm.get('typography') or {}
    def fam(pats):
        for p in pats:
            for k, v in typ.items():
                if isinstance(v, dict) and re.search(p, str(k).lower()) and v.get('fontFamily'):
                    return str(v['fontFamily'])
        return None
    display = fam([r'display', r'headline', r'heading', r'title', r'^h1'])
    body = fam([r'^body', r'paragraph', r'text', r'body'])
    mono = fam([r'mono', r'code']) or next((str(v.get('fontFamily')) for v in typ.values()
                                             if isinstance(v, dict) and 'mono' in str(v.get('fontFamily', '')).lower()), None)
    body = body or display
    display = display or body
    return display, body, mono


def first_family(stack):
    return stack.split(',')[0].strip().strip('"\'') if stack else None


def stack_of(given, generic):
    if not given:
        return generic
    parts = [p.strip() for p in given.split(',') if p.strip()]
    parts = ['"%s"' % p.strip('"\'') if ' ' in p.strip('"\'') and not p.startswith(('"', "'")) else p for p in parts]
    return ','.join(parts + ([generic] if not re.search(r'(sans-serif|serif|monospace)\s*$', given) else []))


def google_import(families, offline):
    merged = {}   # one entry per family, its weights joined
    for name, weights in families:
        if name:
            merged.setdefault(name, set()).update(weights)
    families = [(n, sorted(w, key=int)) for n, w in merged.items()]
    found = []
    for name, weights in families:
        if not name or offline:
            continue
        for spec in (name.replace(' ', '+') + ':wght@' + ';'.join(weights), name.replace(' ', '+')):
            url = 'https://fonts.googleapis.com/css2?family=' + urllib.parse.quote(spec, safe='+:@;') + '&display=swap'
            try:
                with urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=8) as r:
                    if r.status == 200:
                        found.append(spec); break
            except Exception:
                continue
    if not found:
        return None
    return '@import url("https://fonts.googleapis.com/css2?' + '&'.join('family=' + f for f in found) + '&display=swap");'


# ---------- output ----------
ORDER_PAGE = ['bg', 'card', 'ink', 'ink2', 'muted', 'rule', 'accent', 'accent-soft', 'ok', 'ok-soft', 'warn', 'warn-soft',
              'bad', 'bad-soft', 'p3', 'p3-soft']
ORDER_ED = ['ed-ink', 'ed-ink2', 'ed-muted', 'ed-surface', 'ed-layer', 'ed-rule', 'ed-accent', 'ed-accent-soft', 'ed-gap',
            'ed-gap-soft', 'ed-add', 'ed-add-soft', 'ed-p3', 'ed-p3-soft', 'ed-tip-bg', 'ed-tip-ink']


def decl(t, keys):
    return ' '.join('--%s:%s;' % (k, t[k]) for k in keys)


def main(argv):
    ap = argparse.ArgumentParser(description='Make a theme from a DESIGN.md file.')
    ap.add_argument('design')
    ap.add_argument('--name', help='the theme name in its header (default: the file\'s name field)')
    ap.add_argument('--fonts', choices=('google', 'none'), default='google', help='import the faces from Google Fonts when they are there')
    ap.add_argument('-o', '--output', help='write here instead of stdout')
    ap.add_argument('--explain', action='store_true', help='print how each role was found, on stderr')
    a = ap.parse_args(argv)
    fm = front_matter(open(a.design, encoding='utf-8').read())
    cols = resolve_refs(fm)
    name = a.name or str(fm.get('name') or os.path.splitext(os.path.basename(a.design))[0])
    groups = {k.lower(): v for k, v in cols.items() if isinstance(v, dict)}
    flat_top = flatten({k: v for k, v in cols.items() if not isinstance(v, dict)})
    why = {'light': {}, 'dark': {}}
    if 'light' in groups or 'dark' in groups:   # explicit modes; top-level colours are shared
        rl = roles({**flat_top, **flatten(groups.get('light', {}))}, why['light'])
        rd = roles({**flat_top, **flatten(groups.get('dark', {}))}, why['dark']) if 'dark' in groups else {}
        native = 'light'
    else:
        all_flat = flatten(cols)
        r0 = roles(all_flat, why['tmp'] if 'tmp' in why else why.setdefault('tmp', {}))
        native = polarity_of(r0)
        inv = {}
        for k, v in all_flat.items():   # inverse-* colours describe the other mode
            b = k.split('.')[-1]
            if b.startswith('inverse'):
                if re.search(r'(canvas|surface|background)', b): inv.setdefault('card', v)
                if re.search(r'(ink|on-surface|text)', b): inv.setdefault('ink', v)
        why[native] = why.pop('tmp')
        if native == 'light':
            rl, rd = r0, {}
        else:
            rd, rl = r0, {}
            if inv.get('card'): rl['card'] = inv['card']; why['light']['card'] = 'inverse colours'
            if inv.get('ink'): rl['ink'] = inv['ink']; why['light']['ink'] = 'inverse colours'
    accent = (rl.get('accent') or rd.get('accent') or DEFAULTS['accent'])
    for k in ('ok', 'warn', 'bad', 'p3', 'accent'):   # tones are shared between the modes unless a mode has its own
        if k in rl and k not in rd: rd[k] = rl[k]; why['dark'].setdefault(k, why['light'].get(k, ''))
        if k in rd and k not in rl: rl[k] = rd[k]; why['light'].setdefault(k, why['dark'].get(k, ''))
    for k in ('ok', 'warn', 'p3'):   # a tone must not read as the accent: same hue, two meanings
        for r_, w_ in ((rl, why['light']), (rd, why['dark'])):
            r_[k] = apart(r_.get(k) or DEFAULTS[k], accent, k, w_)
    tl = complete(rl, 'light', accent, why['light'])
    td = complete(rd, 'dark', accent, why['dark'])
    light, adj_l = tokens_for(tl, 'light')
    dark, adj_d = tokens_for(td, 'dark')

    disp, body, mono = faces(fm)
    imp = None
    if a.fonts == 'google':
        imp = google_import([(first_family(disp), ['500', '600', '700']), (first_family(body), ['400', '500', '600']),
                             (first_family(mono) or 'IBM Plex Mono', ['400', '500'])], False)
    ff = {'display': stack_of(disp, SANS), 'sans': stack_of(body, SANS),
          'mono': stack_of(mono, MONO) if mono else ('"IBM Plex Mono",' + MONO if imp and 'IBM+Plex+Mono' in imp else MONO)}
    desc = re.split(r'(?<=[.!?])\s', str(fm.get('description') or '').strip())[0][:150]
    mapping = ', '.join('%s <- %s' % (k, why[native].get(k, '')) for k in ('accent', 'bg', 'card', 'ink', 'ok', 'warn', 'bad', 'p3') if why[native].get(k))
    lines = []
    if imp:
        lines.append(imp)
    lines.append('/* %s -- made from %s by scripts/theme_from_design.py.' % (re.sub(r'[^a-z0-9-]+', '-', name.lower()).strip('-'), os.path.basename(a.design)))
    if desc:
        lines.append('   ' + desc.replace('*/', ''))
    lines.append('   The file\'s own mode is %s; the other one is derived. Roles: %s.' % (native, mapping or 'none found, all derived'))
    adj = adj_l + adj_d
    if adj:
        lines.append('   Adjusted for contrast: ' + '; '.join(adj[:12]) + ('; ...' if len(adj) > 12 else '') + '.')
    lines.append('   Tones: accent = the subject; gap = a gap, a risk, a failure; add = what is added; p3 = a further phase, dashed. */')
    faces_decl = '--display:%s; --sans:%s; --mono:%s;' % (ff['display'], ff['sans'], ff['mono'])
    lines.append(':root{\n  %s\n  %s\n  --ed-display:var(--display); --ed-sans:var(--sans); --ed-mono:var(--mono);\n  %s\n  '
                 '--f-display:var(--display); --f-body:var(--sans); --f-mono:var(--mono); --slide:var(--card);\n}'
                 % (decl(light, ORDER_PAGE), faces_decl, decl(light, ORDER_ED)))
    dk = 'color-scheme:dark; %s\n  %s' % (decl(dark, ORDER_PAGE), decl(dark, ORDER_ED))
    lines.append('@media (prefers-color-scheme: dark){ :root:not([data-theme="light"]){\n  %s } }' % dk)
    lines.append(':root[data-theme="dark"]{\n  %s }' % dk)
    css = '\n'.join(lines) + '\n'
    if a.explain:
        for m in ('light', 'dark'):
            print('%s: %s' % (m, ', '.join('%s <- %s' % kv for kv in sorted(why[m].items()))), file=sys.stderr)
        for x in adj:
            print('adjusted: ' + x, file=sys.stderr)
    if a.output:
        open(a.output, 'w', encoding='utf-8').write(css)
    else:
        sys.stdout.write(css)
    left = failures(light) + failures(dark)
    if left:
        print('theme_from_design.py: %d pair(s) still fail; see scripts/check_theme.py' % len(left), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
