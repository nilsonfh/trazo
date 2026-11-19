#!/usr/bin/env python3
"""Write a draw.io file from a figure that todrawio-extract.js dumped. Use todrawio.sh, which renders the page first.

    todrawio.py figure.json out.drawio [diagram name]

- An EdgeDiagram figure: zones and nodes become rounded rectangles with the page's computed fill, stroke
  and dash; links become edges attached to their nodes at the rendered anchors, with the route's corners
  as waypoints and each label at its rendered place along the wire.
- Any other svg (drawn by hand or with EdgeSketch): rects and ellipses keep their fill, stroke, dash and
  corner radius, text keeps its place, size, weight and rotation, and lines and paths become edges with
  their arrowheads, not attached to anything. Everything keeps the page's order, so what was on top stays
  on top. Filled shapes other than rects and ellipses are not exported; the count is printed.
- An HTML figure: its boxes, its sprite icons and one text cell per rendered line.

Icons become draw.io stencils coloured from the cell's style, so draw.io's dark mode recolours them with
the text. Each text names its face, and its Google Fonts address when it is not a system face, so
draw.io loads it when it can. A figure that comes out empty is an error.
"""
import base64, html, json, re, sys, urllib.parse, zlib
from xml.sax.saxutils import quoteattr

SYSTEM_FACES = {'system-ui', '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'sans-serif', 'serif', 'monospace', 'ui-monospace',
                'sfmono-regular', 'menlo', 'consolas', 'helvetica', 'arial', 'arial narrow', 'times new roman', 'courier new', 'roboto'}


def hx(c, opacity=1.0):
    """A computed colour as hex; a translucent one, or one under a translucent group, is blended over white."""
    m = re.match(r'rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)', c or '')
    if not m:
        return 'none'
    a = (float(m.group(4)) if m.group(4) is not None else 1.0) * opacity
    if a <= 0.01:
        return 'none'
    return '#%02x%02x%02x' % tuple(round(int(v) * a + 255 * (1 - a)) for v in m.groups()[:3])


def px(v):
    return float(str(v).replace('px', '') or 0)


def dash_of(d):
    if not d or d in ('none', ''):
        return ''
    return 'dashed=1;dashPattern=%s;' % ' '.join(str(max(1, int(round(px(x))))) for x in re.split(r'[ ,]+', d.strip()) if x)


def face(ff):
    return (ff or 'sans-serif').split(',')[0].strip('" \'')


def font_style(ff, fw):
    f = face(ff)
    src = '' if f.lower() in SYSTEM_FACES else urllib.parse.quote('https://fonts.googleapis.com/css?family=%s:%s' % (f.replace(' ', '+'), fw), safe='')
    return 'fontFamily=%s;%s' % (f, 'fontSource=%s;' % src if src else '')


def r(v):
    return round(v, 2)


class Doc:
    def __init__(self):
        self.cells, self.n = [], 1

    def cell(self, attrs, geom, points=None):
        self.n += 1
        i = 'c%d' % self.n
        a = ' '.join('%s=%s' % (k, quoteattr(str(v))) for k, v in attrs.items())
        g = '<mxGeometry %s as="geometry">%s</mxGeometry>' % (' '.join('%s="%s"' % kv for kv in geom.items()), points or '')
        self.cells.append('<mxCell id="%s" %s parent="1">%s</mxCell>' % (i, a, g))
        return i


# ---------- icons as stencils ----------
def svg_path(dd):
    toks = re.findall(r'[MmLlHhVvCcSsQqTtAaZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?', dd)
    out = []; i = 0; cmd = None; x = y = sx = sy = 0.0; c2 = None
    def num():
        nonlocal i; i += 1; return float(toks[i - 1])
    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]): cmd = toks[i]; i += 1
        rel = cmd.islower(); C = cmd.upper(); ox, oy = (x, y) if rel else (0.0, 0.0)
        if C == 'Z':
            out.append('<close/>'); x, y = sx, sy; c2 = None; continue
        if C == 'M':
            x, y = ox + num(), oy + num(); sx, sy = x, y; out.append('<move x="%g" y="%g"/>' % (x, y)); cmd = 'l' if rel else 'L'; c2 = None
        elif C == 'L':
            x, y = ox + num(), oy + num(); out.append('<line x="%g" y="%g"/>' % (x, y)); c2 = None
        elif C == 'H':
            x = ox + num(); out.append('<line x="%g" y="%g"/>' % (x, y)); c2 = None
        elif C == 'V':
            y = oy + num(); out.append('<line x="%g" y="%g"/>' % (x, y)); c2 = None
        elif C in 'CS':
            if C == 'C': x1, y1 = ox + num(), oy + num()
            else: x1, y1 = (2 * x - c2[0], 2 * y - c2[1]) if c2 else (x, y)
            x2, y2 = ox + num(), oy + num(); x, y = ox + num(), oy + num(); c2 = (x2, y2)
            out.append('<curve x1="%g" y1="%g" x2="%g" y2="%g" x3="%g" y3="%g"/>' % (x1, y1, x2, y2, x, y))
        elif C in 'QT':
            if C == 'Q': x1, y1 = ox + num(), oy + num()
            else: x1, y1 = (2 * x - c2[0], 2 * y - c2[1]) if c2 else (x, y)
            x, y = ox + num(), oy + num(); c2 = (x1, y1)
            out.append('<quad x1="%g" y1="%g" x2="%g" y2="%g"/>' % (x1, y1, x, y))
        elif C == 'A':
            rx, ry, rot, la, sw = num(), num(), num(), num(), num(); x, y = ox + num(), oy + num(); c2 = None
            out.append('<arc rx="%g" ry="%g" x-axis-rotation="%g" large-arc-flag="%d" sweep-flag="%d" x="%g" y="%g"/>' % (rx, ry, rot, la, sw, x, y))
        else:
            raise ValueError('path command %s' % cmd)
    return '<path>%s</path>' % ''.join(out)


def stencil(sym):
    import xml.dom.minidom
    root = xml.dom.minidom.parseString('<g>%s</g>' % sym['html']).documentElement
    parts = []
    def walk(el, fill, stroke):
        for e in el.childNodes:
            if e.nodeType != 1: continue
            f = e.getAttribute('fill') or fill; st = e.getAttribute('stroke') or stroke
            if e.tagName == 'g': walk(e, f, st); continue
            a = lambda k: float(e.getAttribute(k) or 0)
            if e.tagName == 'path': g = svg_path(e.getAttribute('d'))
            elif e.tagName == 'rect':
                x, y, w, h, rx = a('x'), a('y'), a('width'), a('height'), a('rx')
                g = svg_path('M%g %gh%ga%g %g 0 0 1 %g %gv%ga%g %g 0 0 1 %g %gh%ga%g %g 0 0 1 %g %gv%ga%g %g 0 0 1 %g %gz' % (
                    x + rx, y, w - 2 * rx, rx, rx, rx, rx, h - 2 * rx, rx, rx, -rx, rx, -(w - 2 * rx), rx, rx, -rx, -rx, -(h - 2 * rx), rx, rx, rx, -rx)) if rx else '<rect x="%g" y="%g" w="%g" h="%g"/>' % (x, y, w, h)
            elif e.tagName in ('circle', 'ellipse'):
                rx = a('r') or a('rx'); ry = a('r') or a('ry')
                g = '<ellipse x="%g" y="%g" w="%g" h="%g"/>' % (a('cx') - rx, a('cy') - ry, 2 * rx, 2 * ry)
            elif e.tagName == 'line':
                g = '<path><move x="%g" y="%g"/><line x="%g" y="%g"/></path>' % (a('x1'), a('y1'), a('x2'), a('y2'))
            elif e.tagName in ('polyline', 'polygon'):
                v = [float(t) for t in re.split(r'[\s,]+', e.getAttribute('points').strip()) if t]
                g = svg_path('M' + ' L'.join('%g %g' % (v[k], v[k + 1]) for k in range(0, len(v) - 1, 2)) + ('z' if e.tagName == 'polygon' else ''))
            else: raise ValueError(e.tagName)
            filled = f not in ('', 'none'); stroked = st not in ('', 'none')
            parts.append(g + ('<fillstroke/>' if filled and stroked else '<fill/>' if filled else '<stroke/>'))
    walk(root, 'currentColor', 'none')
    sw = re.search(r'stroke-width="([\d.]+)"', sym['html']); vb = (sym['vb'] or '0 0 24 24').split()
    xml_ = ('<shape w="%s" h="%s" aspect="fixed" strokewidth="%s"><background/><foreground>'
            '<linecap cap="round"/><linejoin join="round"/>%s</foreground></shape>') % (vb[2], vb[3], sw.group(1) if sw else 1, ''.join(parts))
    co = zlib.compressobj(9, zlib.DEFLATED, -15)
    raw = co.compress(urllib.parse.quote(xml_, safe="-_.!~*'()").encode()) + co.flush()
    return 'stencil(%s)' % base64.b64encode(raw).decode()


def icon(doc, sym, color, x, y, w, h, op=1.0):
    col = hx(color, op)
    doc.cell({'value': '', 'style': 'shape=%s;html=1;aspect=fixed;strokeColor=%s;fillColor=%s;' % (stencil(sym), col, col), 'vertex': '1'},
             {'x': r(x), 'y': r(y), 'width': r(w), 'height': r(h)})


# ---------- an EdgeDiagram figure ----------
def edge_figure(d, doc):
    def text(s, x, y, st, fs, anchor, w=None):
        h = fs * 1.4
        w = w or len(s) * fs * 0.68 + 8
        left = {'start': x, 'middle': x - w / 2, 'end': x - w}[anchor or 'start']
        al = {'start': 'left', 'middle': 'center', 'end': 'right'}[anchor or 'start']
        ls = px(st['ls']) if st['ls'] != 'normal' else 0
        style = ('text;html=1;strokeColor=none;fillColor=none;spacing=0;whiteSpace=nowrap;verticalAlign=middle;align=%s;%sfontSize=%s;fontColor=%s;fontStyle=%d;'
                 % (al, font_style(st['ff'], st['fw']), fs, hx(st['fill']), 1 if int(st['fw']) >= 600 else 0))
        val = html.escape(s) if not ls else '<span style="letter-spacing:%spx">%s</span>' % (ls, html.escape(s))
        doc.cell({'value': val, 'style': style, 'vertex': '1'}, {'x': r(left), 'y': r(y - fs * 0.35 - h / 2), 'width': r(w), 'height': r(h)})
    for z in d['zones']:
        st = z['st']
        doc.cell({'value': '', 'style': 'rounded=1;absoluteArcSize=1;arcSize=%d;html=1;fillColor=%s;strokeColor=%s;strokeWidth=%s;%s' % (z['rx'] * 2, hx(st['fill']), hx(st['stroke']), px(st['sw']), dash_of(st['dash'])), 'vertex': '1'},
                 {'x': z['x'], 'y': z['y'], 'width': z['w'], 'height': z['h']})
        for t in z['label']: text(t['s'], t['x'], t['y'], t['st'], t['fs'], t['anchor'])
    ids = {}
    for n in d['nodes']:
        st = n['st']
        ids[n['id']] = doc.cell({'value': '', 'style': 'rounded=1;absoluteArcSize=1;arcSize=%d;html=1;fillColor=%s;strokeColor=%s;strokeWidth=%s;%s' % (n['rx'] * 2, hx(st['fill']), hx(st['stroke']), px(st['sw']), dash_of(st['dash'])), 'vertex': '1'},
                                {'x': n['x'], 'y': n['y'], 'width': n['w'], 'height': n['h']})
        ic = n.get('icon')
        if ic and ic['href'] in d['icons']:
            icon(doc, d['icons'][ic['href']], ic['color'], ic['x'], ic['y'], ic['w'], ic['h'])
        for t in n['texts']:
            text(t['s'], t['x'], t['y'], t['st'], t['fs'], t['anchor'], w=n['x'] + n['w'] - t['x'] - 4 if t['anchor'] in (None, 'start') else None)
    for t in d.get('free', []): text(t['s'], t['x'], t['y'], t['st'], t['fs'], t['anchor'])
    def owner(p):
        for n in d['nodes']:
            x, y = p
            if n['x'] - 0.6 <= x <= n['x'] + n['w'] + 0.6 and n['y'] - 0.6 <= y <= n['y'] + n['h'] + 0.6:
                return n
    def path_pts(dd):
        pts = []
        for cmd, args in re.findall(r'([MLQC])([^MLQC]*)', dd):
            v = list(map(float, args.split()))
            pts.append((v[0], v[1]) if cmd == 'Q' else (v[-2], v[-1]))   # Q: the control point is the corner
        out = []
        for p in pts:
            if not out or out[-1] != p: out.append(p)
        res = [out[0]]
        for i in range(1, len(out) - 1):
            a, b, c = res[-1], out[i], out[i + 1]
            if (b[0] - a[0]) * (c[1] - b[1]) != (b[1] - a[1]) * (c[0] - b[0]): res.append(b)
        res.append(out[-1]); return res
    labels = {l['id'][:-6]: l for l in d['labels']}
    for L in sorted(d['links'], key=lambda L: L['id'] in labels):   # labelled links last, so labels sit above wires
        pts = path_pts(L['d']); st = L['st']
        s, t = owner(pts[0]), owner(pts[-1])
        style = 'endArrow=%s;startArrow=%s;endFill=1;startFill=1;endSize=7;startSize=7;html=1;rounded=1;arcSize=16;edgeStyle=none;strokeColor=%s;strokeWidth=%s;%s' % (
            'block' if L['me'] else 'none', 'block' if L['ms'] else 'none', hx(st['stroke']), px(st['sw']), dash_of(st['dash']))
        attrs = {'value': '', 'style': style, 'edge': '1'}
        def con(n, p, pre):
            return '%sX=%s;%sY=%s;%sDx=0;%sDy=0;' % (pre, r((p[0] - n['x']) / n['w']), pre, r((p[1] - n['y']) / n['h']), pre, pre)
        if s: attrs['source'] = ids[s['id']]; attrs['style'] += con(s, pts[0], 'exit') + 'exitPerimeter=0;'
        if t: attrs['target'] = ids[t['id']]; attrs['style'] += con(t, pts[-1], 'entry') + 'entryPerimeter=0;'
        inner = '<mxPoint x="%s" y="%s" as="sourcePoint"/><mxPoint x="%s" y="%s" as="targetPoint"/>' % (pts[0] + pts[-1])
        if len(pts) > 2: inner += '<Array as="points">%s</Array>' % ''.join('<mxPoint x="%s" y="%s"/>' % p for p in pts[1:-1])
        eid = doc.cell(attrs, {'relative': '1'}, inner)
        lb = labels.get(L['id'])
        if lb:
            segs = list(zip(pts, pts[1:])); tot = sum(abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in segs) or 1
            cx, cy = lb['x'] + lb['w'] / 2, lb['y'] + lb['h'] / 2; acc = 0; frac = 0.5
            for a, b in segs:
                ln = abs(b[0] - a[0]) + abs(b[1] - a[1])
                if min(a[0], b[0]) - 1 <= cx <= max(a[0], b[0]) + 1 and min(a[1], b[1]) - 1 <= cy <= max(a[1], b[1]) + 1:
                    frac = (acc + abs(cx - a[0]) + abs(cy - a[1])) / tot; break
                acc += ln
            doc.n += 1
            doc.cells.append('<mxCell id="c%d" value=%s style=%s vertex="1" connectable="0" parent="%s"><mxGeometry x="%s" relative="1" as="geometry"><mxPoint as="offset"/></mxGeometry></mxCell>' % (
                doc.n, quoteattr(html.escape(lb['s'])),
                quoteattr('edgeLabel;html=1;align=center;verticalAlign=middle;resizable=0;points=[];labelBackgroundColor=%s;%sfontSize=%s;fontColor=%s;spacing=3;' % (
                    hx(lb['bg']['fill']), font_style(lb['tst']['ff'], lb['tst']['fw']), lb['fs'], hx(lb['tst']['fill']))),
                eid, r(frac * 2 - 1)))


# ---------- any other svg ----------
def svg_figure(d, doc):
    for it in d['items']:
        op = it.get('op', 1)
        if it['t'] in ('rect', 'ellipse'):
            fill = hx(it['fill'], op * it.get('fo', 1)); stroke = hx(it['stroke'], op * it.get('so', 1))
            if fill == 'none' and stroke == 'none':
                continue
            shape = 'ellipse;' if it['t'] == 'ellipse' else ('rounded=1;absoluteArcSize=1;arcSize=%s;' % r(it.get('rx', 0) * 2) if it.get('rx') else 'rounded=0;')
            doc.cell({'value': '', 'style': '%shtml=1;fillColor=%s;strokeColor=%s;strokeWidth=%s;%s' % (shape, fill, stroke, r(it['sw'] or 1), dash_of(it['dash'])), 'vertex': '1'},
                     {'x': r(it['x']), 'y': r(it['y']), 'width': r(max(it['w'], 0.5)), 'height': r(max(it['h'], 0.5))})
        elif it['t'] == 'icon':
            icon(doc, d['sym'][it['href']], it['color'], it['x'], it['y'], it['w'], it['h'], op)
        elif it['t'] == 'wire':
            stroke = hx(it['stroke'], op * it.get('so', 1))
            if stroke == 'none':
                continue
            pts = it['pts']
            style = ('endArrow=%s;startArrow=%s;endFill=1;startFill=1;endSize=6;startSize=6;html=1;rounded=0;edgeStyle=none;%sstrokeColor=%s;strokeWidth=%s;%s' % (
                'block' if it['me'] else 'none', 'block' if it['ms'] else 'none', 'curved=1;' if it.get('curved') else '', stroke, r(it['sw']), dash_of(it['dash'])))
            inner = '<mxPoint x="%s" y="%s" as="sourcePoint"/><mxPoint x="%s" y="%s" as="targetPoint"/>' % (pts[0][0], pts[0][1], pts[-1][0], pts[-1][1])
            if len(pts) > 2: inner += '<Array as="points">%s</Array>' % ''.join('<mxPoint x="%s" y="%s"/>' % (p[0], p[1]) for p in pts[1:-1])
            doc.cell({'value': '', 'style': style, 'edge': '1'}, {'relative': '1'}, inner)
        elif it['t'] == 'text':
            vertical = abs(abs(it['rot']) - 90) < 2
            w, h = (it['h'], it['w']) if vertical else (it['w'], it['h'])
            pad = max(6, it['fs'] * 0.6)   # draw.io's metrics differ a little: room on the side the text grows to
            al = {'start': 'left', 'middle': 'center', 'end': 'right'}.get(it['anchor'], 'left')
            if vertical: al = 'center'
            W = w + (2 * pad if al == 'center' else pad)
            x0 = it['cx'] - w / 2 - (pad if al in ('center', 'right') else 0)
            ls = px(it['ls']) if it['ls'] != 'normal' else 0
            val = html.escape(it['s']) if not ls else '<span style="letter-spacing:%spx">%s</span>' % (r(ls), html.escape(it['s']))
            style = ('text;html=1;strokeColor=none;fillColor=none;spacing=0;whiteSpace=nowrap;align=%s;verticalAlign=middle;%sfontSize=%s;fontColor=%s;fontStyle=%d;%s' % (
                al, font_style(it['ff'], it['fw']), r(it['fs']), hx(it['color'], op), 1 if int(float(it['fw'])) >= 600 else 0,
                'rotation=%d;' % it['rot'] if it['rot'] else ''))
            doc.cell({'value': val, 'style': style, 'vertex': '1'}, {'x': r(x0), 'y': r(it['cy'] - h / 2), 'width': r(W), 'height': r(h)})
    if d.get('skipped'):
        print('todrawio.py: not exported: ' + ', '.join('%d %s' % (v, k) for k, v in sorted(d['skipped'].items())) +
              ' (filled shapes other than rects and ellipses, and <use> of anything but a sprite symbol)', file=sys.stderr)


# ---------- an HTML figure ----------
def html_figure(d, doc):
    for b in d['boxes']:
        doc.cell({'value': '', 'style': 'rounded=1;absoluteArcSize=1;arcSize=%s;html=1;fillColor=%s;strokeColor=%s;strokeWidth=%s;%s' % (
            r(b['radius'] * 2), hx(b['fill']), hx(b['stroke']), b['sw'], 'dashed=1;dashPattern=4 3;' if b['style'] == 'dashed' else ''), 'vertex': '1'},
            {'x': r(b['x']), 'y': r(b['y']), 'width': r(b['w']), 'height': r(b['h'])})
    for ic in d['icons']:
        if ic['href'] in d['sym']:
            icon(doc, d['sym'][ic['href']], ic['color'], ic['x'], ic['y'], ic['w'], ic['h'])
    for t in d['texts']:
        ls = px(t['ls']) if t['ls'] != 'normal' else 0
        val = html.escape(t['s']) if not ls else '<span style="letter-spacing:%spx">%s</span>' % (r(ls), html.escape(t['s']))
        doc.cell({'value': val, 'style': 'text;html=1;strokeColor=none;fillColor=none;spacing=0;whiteSpace=nowrap;align=center;verticalAlign=middle;'
                  '%sfontSize=%s;fontColor=%s;fontStyle=%d;' % (font_style(t['ff'], t['fw']), t['fs'], hx(t['color']), 1 if int(t['fw']) >= 600 else 0), 'vertex': '1'},
                 {'x': r(t['x'] - 3), 'y': r(t['y']), 'width': r(t['w'] + 6), 'height': r(t['h'])})


def main(argv):
    if len(argv) < 2:
        print(__doc__.split('\n\n')[0], file=sys.stderr); return 64
    with open(argv[0], encoding='utf-8') as f:
        d = json.load(f)
    if d.get('error'):
        print('todrawio.py: ' + d['error'], file=sys.stderr); return 1
    doc = Doc()
    {'edge': edge_figure, 'svg': svg_figure, 'html': html_figure}[d.get('kind', 'edge')](d, doc)
    if not doc.cells:
        print('todrawio.py: the figure %s came out empty: nothing visible to export' % d.get('id'), file=sys.stderr); return 1
    vb = d['vb']; name = argv[2] if len(argv) > 2 else d.get('id') or 'figure'
    body = ''.join(doc.cells)   # in the figure's own units; draw.io takes a viewBox that starts below zero as it is
    xml = ('<mxfile host="todrawio" type="device"><diagram id=%s name=%s>'
           '<mxGraphModel dx="%d" dy="%d" grid="0" gridSize="10" guides="1" tooltips="1" connect="1" arrows="1" fold="1" page="1" pageScale="1" pageWidth="%d" pageHeight="%d" background="#ffffff" math="0" shadow="0">'
           '<root><mxCell id="0"/><mxCell id="1" parent="0"/>%s</root></mxGraphModel></diagram></mxfile>') % (
        quoteattr(str(d.get('id') or 'figure')), quoteattr(name), vb[2], vb[3], vb[2], vb[3], body)
    with open(argv[1], 'w', encoding='utf-8') as f:
        f.write(xml)
    print('%s: %d cells, kind %s' % (argv[1], len(doc.cells), d.get('kind')))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
