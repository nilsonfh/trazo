/* Injected by todrawio.sh: finds the figure window.TODRAWIO_TARGET names, once the page has loaded and its
   fonts are ready, and dumps it as JSON in a pre element with id dump, for todrawio.py.
   - an EdgeDiagram svg (.ed-root), at its last step: zones, nodes, links with their ends, link labels;
   - any other svg, drawn by hand or with EdgeSketch, EdgeSequence or EdgeTimeline: rects, circles, diamonds,
     text, sprite icons, and lines and paths drawn as wires, with their arrowheads, in the svg's own units
     and in document order;
   - an HTML element: every box with a background or a border, every line of text, every sprite icon.
   The target is an id, or a CSS selector when it starts with "." or "#". If nothing matches, the dump
   says so. */
(function () {
  function done(out) { var pre = document.createElement('pre'); pre.id = 'dump'; pre.textContent = JSON.stringify(out); document.body.appendChild(pre); }
  function run() {
    var T = window.TODRAWIO_TARGET;
    var root = /^[.#]/.test(T) ? document.querySelector(T) : document.getElementById(T);
    if (!root) return done({error: 'no element matches ' + T});
    if (root.tagName.toLowerCase() === 'svg') return done(root.classList.contains('ed-root') ? edge(root) : svgFig(root));
    done(htmlFig(root));
  }
  function cs(e) { var c = getComputedStyle(e); return {fill: c.fill, stroke: c.stroke, sw: c.strokeWidth, dash: c.strokeDasharray, color: c.color, ff: c.fontFamily, fw: c.fontWeight, ls: c.letterSpacing, op: c.opacity}; }

  /* ---------- an EdgeDiagram figure ---------- */
  function edge(svg) {
    svg.querySelectorAll('.ed-wire').forEach(function (p) { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; });
    svg.querySelectorAll('.ed-item').forEach(function (g) { g.style.opacity = '1'; });
    function texts(g) {
      return Array.from(g.querySelectorAll(':scope > text')).map(function (t) {
        return {cls: t.getAttribute('class'), x: +t.getAttribute('x'), y: +t.getAttribute('y'), fs: +t.getAttribute('font-size') || parseFloat(getComputedStyle(t).fontSize),
          anchor: t.getAttribute('text-anchor'), s: t.textContent, st: cs(t)};
      });
    }
    var vb = svg.viewBox.baseVal;
    var out = {kind: 'edge', id: svg.id, vb: [vb.x, vb.y, vb.width, vb.height], zones: [], nodes: [], links: [], labels: [], icons: {}, free: []};
    svg.querySelectorAll('.ed-zone').forEach(function (g) {
      var r = g.querySelector('.ed-zshape');
      out.zones.push({id: g.dataset.id, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), rx: +r.getAttribute('rx'), st: cs(r), label: texts(g.querySelector('.ed-item') || g)});
    });
    svg.querySelectorAll('.ed-node').forEach(function (g) {
      var r = g.querySelector('.ed-shape'); if (!r) return;
      var u = g.querySelector('use');
      var n = {id: g.dataset.id, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), rx: +r.getAttribute('rx'), st: cs(r), texts: texts(g)};
      if (u) {
        var href = u.getAttribute('href'); n.icon = {href: href, x: +u.getAttribute('x'), y: +u.getAttribute('y'), w: +u.getAttribute('width'), h: +u.getAttribute('height'), color: getComputedStyle(u).color};
        var sym = document.querySelector(href); if (sym) out.icons[href] = {vb: sym.getAttribute('viewBox'), html: sym.innerHTML};
      }
      out.nodes.push(n);
    });
    svg.querySelectorAll('.ed-link').forEach(function (g) {
      var p = g.querySelector('.ed-wire');
      out.links.push({id: g.dataset.id, d: p.getAttribute('d'), st: cs(p), ms: !!(p.getAttribute('marker-start') || p.dataset.ms), me: !!(p.getAttribute('marker-end') || p.dataset.me)});
    });
    svg.querySelectorAll('.ed-lgroup').forEach(function (g) {
      var r = g.querySelector('rect'), t = g.querySelector('text');
      out.labels.push({id: g.dataset.id, x: +r.getAttribute('x'), y: +r.getAttribute('y'), w: +r.getAttribute('width'), h: +r.getAttribute('height'), bg: cs(r), s: t.textContent, tst: cs(t), fs: parseFloat(getComputedStyle(t).fontSize)});
    });
    out.dots = Array.from(svg.querySelectorAll('circle.ed-dot')).map(function (c) {   // a fan's junctions
      return {x: +c.getAttribute('cx'), y: +c.getAttribute('cy'), r: +c.getAttribute('r'), fill: getComputedStyle(c).fill};
    });
    svg.querySelectorAll('text.ed-text').forEach(function (t) {
      out.free.push({x: +t.getAttribute('x'), y: +t.getAttribute('y'), fs: +t.getAttribute('font-size') || parseFloat(getComputedStyle(t).fontSize), anchor: t.getAttribute('text-anchor'), s: t.textContent, st: cs(t)});
    });
    return out;
  }

  /* ---------- any other svg ---------- */
  function svgFig(svg) {
    var vb = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width ? svg.viewBox.baseVal : null;
    var R = svg.getBoundingClientRect();
    var V = vb ? [vb.x, vb.y, vb.width, vb.height] : [0, 0, R.width, R.height];
    var toRoot = svg.getScreenCTM().inverse();
    function M(e) { return toRoot.multiply(e.getScreenCTM()); }
    function P(m, x, y) { var p = svg.createSVGPoint(); p.x = x; p.y = y; p = p.matrixTransform(m); return [+p.x.toFixed(2), +p.y.toFixed(2)]; }
    function opacity(e) { var o = 1; for (var n = e; n && n !== svg.parentNode; n = n.parentNode) { if (n.nodeType === 1) o *= +getComputedStyle(n).opacity; } return o; }
    function shown(e) {
      if (e.closest('defs,marker,symbol,title,mask,clipPath,pattern,.sk-debug,.ed-debug')) return false;
      for (var n = e; n && n !== svg.parentNode; n = n.parentNode) {
        if (n.nodeType !== 1) continue;
        var c = getComputedStyle(n); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false;
      }
      return true;
    }
    function marker(c, which) { var v = c[which]; return !!v && v !== 'none'; }
    var out = {kind: 'svg', id: svg.id || 'figure', vb: V, items: [], sym: {}, skipped: {}};
    function skip(tag) { out.skipped[tag] = (out.skipped[tag] || 0) + 1; }
    svg.querySelectorAll('*').forEach(function (e) {
      var tag = e.tagName.toLowerCase();
      if (['g', 'defs', 'marker', 'symbol', 'title', 'desc', 'style', 'tspan', 'clippath', 'mask', 'stop', 'lineargradient', 'radialgradient', 'pattern'].indexOf(tag) >= 0) return;
      if (!shown(e)) return;
      var c = getComputedStyle(e), m = M(e), op = +opacity(e).toFixed(3), b;
      if (tag === 'rect') {
        b = e.getBBox(); var a = P(m, b.x, b.y), z = P(m, b.x + b.width, b.y + b.height);
        out.items.push({t: 'rect', x: Math.min(a[0], z[0]), y: Math.min(a[1], z[1]), w: Math.abs(z[0] - a[0]), h: Math.abs(z[1] - a[1]),
          rx: (+e.getAttribute('rx') || 0) * Math.abs(m.a || 1), fill: c.fill, fo: +c.fillOpacity, stroke: c.stroke, so: +c.strokeOpacity, sw: parseFloat(c.strokeWidth) * Math.abs(m.a || 1), dash: c.strokeDasharray, op: op});
      } else if (tag === 'circle' || tag === 'ellipse') {
        b = e.getBBox(); var a2 = P(m, b.x, b.y), z2 = P(m, b.x + b.width, b.y + b.height);
        out.items.push({t: 'ellipse', x: a2[0], y: a2[1], w: z2[0] - a2[0], h: z2[1] - a2[1], fill: c.fill, fo: +c.fillOpacity, stroke: c.stroke, so: +c.strokeOpacity, sw: parseFloat(c.strokeWidth), dash: c.strokeDasharray, op: op});
      } else if (tag === 'text') {
        if (!e.textContent.trim()) return;
        b = e.getBBox(); var ang = Math.round(Math.atan2(m.b, m.a) * 180 / Math.PI);
        var ctr = P(m, b.x + b.width / 2, b.y + b.height / 2), sc = Math.sqrt(m.a * m.a + m.b * m.b);
        var anchor = c.textAnchor || e.getAttribute('text-anchor') || 'start';
        out.items.push({t: 'text', s: e.textContent.replace(/\s+/g, ' ').trim(), cx: ctr[0], cy: ctr[1], w: b.width * sc, h: b.height * sc, rot: ang, anchor: anchor,
          ff: c.fontFamily, fs: parseFloat(c.fontSize) * sc, fw: c.fontWeight, color: c.fill, ls: c.letterSpacing, op: op});
      } else if (tag === 'use') {
        var href = e.getAttribute('href') || e.getAttribute('xlink:href'), sym = href && document.querySelector(href);
        if (!sym || sym.tagName.toLowerCase() !== 'symbol') return skip('use');
        // the use's own box, not the bounds of what the symbol draws inside it
        var ux = e.x.baseVal.value, uy = e.y.baseVal.value, uw = e.width.baseVal.value, uh = e.height.baseVal.value;
        b = uw && uh ? {x: ux, y: uy, width: uw, height: uh} : e.getBBox();
        var a3 = P(m, b.x, b.y), z3 = P(m, b.x + b.width, b.y + b.height);
        out.sym[href] = {vb: sym.getAttribute('viewBox'), html: sym.innerHTML};
        out.items.push({t: 'icon', href: href, x: Math.min(a3[0], z3[0]), y: Math.min(a3[1], z3[1]), w: Math.abs(z3[0] - a3[0]), h: Math.abs(z3[1] - a3[1]), color: c.color, op: op});
      } else if (tag === 'line' || tag === 'polyline' || tag === 'path' || tag === 'polygon') {
        var stroked = c.stroke && c.stroke !== 'none' && parseFloat(c.strokeWidth) > 0;
        var filled = (tag === 'path' || tag === 'polygon') && c.fill && c.fill !== 'none' && !/rgba\([^)]*,\s*0\)/.test(c.fill) && +c.fillOpacity > 0;
        if (filled && tag === 'path') {   // a diamond (a timeline's milestone) is a rhombus
          var dp = corners(e.getAttribute('d')), db = e.getBBox();
          if (/^[\sMmLlZz\d.,-]*$/.test(e.getAttribute('d') || '') && dp.length >= 4 && dp.slice(0, 4).every(function (q) {
            return (Math.abs(q[0] - db.x - db.width / 2) < 0.5 && (Math.abs(q[1] - db.y) < 0.5 || Math.abs(q[1] - db.y - db.height) < 0.5)) ||
                   (Math.abs(q[1] - db.y - db.height / 2) < 0.5 && (Math.abs(q[0] - db.x) < 0.5 || Math.abs(q[0] - db.x - db.width) < 0.5));
          })) {
            var a4 = P(m, db.x, db.y), z4 = P(m, db.x + db.width, db.y + db.height);
            out.items.push({t: 'rect', shape: 'rhombus', x: Math.min(a4[0], z4[0]), y: Math.min(a4[1], z4[1]), w: Math.abs(z4[0] - a4[0]), h: Math.abs(z4[1] - a4[1]),
              rx: 0, fill: c.fill, fo: +c.fillOpacity, stroke: c.stroke, so: +c.strokeOpacity, sw: parseFloat(c.strokeWidth) * Math.abs(m.a || 1), dash: c.strokeDasharray, op: op});
            return;
          }
        }
        if (filled || !stroked) return skip(tag);   // any other filled shape than a rect, an ellipse or a diamond is not exported
        var pts = [], len = 0;
        try { len = e.getTotalLength(); } catch (x) {}
        var straight = tag !== 'path' || !/[CcSsQqTtAa]/.test(e.getAttribute('d') || '');
        if (tag === 'line') pts = [[+e.getAttribute('x1'), +e.getAttribute('y1')], [+e.getAttribute('x2'), +e.getAttribute('y2')]];
        else if (tag !== 'path') pts = (e.getAttribute('points') || '').trim().split(/[\s,]+/).reduce(function (a, v, i, all) { if (i % 2) a.push([+all[i - 1], +v]); return a; }, []);
        else if (straight) pts = corners(e.getAttribute('d'));
        else for (var k = 0; k <= 32; k++) { var q = e.getPointAtLength(len * k / 32); pts.push([q.x, q.y]); }
        if (tag === 'polygon' && pts.length) pts.push(pts[0]);
        pts = pts.map(function (p) { return P(m, p[0], p[1]); });
        if (pts.length < 2) return skip(tag);
        out.items.push({t: 'wire', pts: pts, stroke: c.stroke, so: +c.strokeOpacity, sw: parseFloat(c.strokeWidth), dash: c.strokeDasharray,
          ms: marker(c, 'markerStart') || !!e.getAttribute('marker-start'), me: marker(c, 'markerEnd') || !!e.getAttribute('marker-end'), curved: !straight, op: op});
      } else if (tag !== 'svg' && tag !== 'a' && tag !== 'switch' && tag !== 'foreignobject') skip(tag);
    });
    return out;
  }
  // the corners of a path drawn with M, L, H, V and Z only, in its own units
  function corners(d) {
    var tok = (d || '').match(/[MmLlHhVvZz]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [], i = 0, x = 0, y = 0, sx = 0, sy = 0, cmd = 'M', pts = [];
    function n() { return parseFloat(tok[i++]); }
    while (i < tok.length) {
      if (/[A-Za-z]/.test(tok[i])) cmd = tok[i++];
      var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase();
      if (C === 'Z') { x = sx; y = sy; pts.push([x, y]); continue; }
      if (C === 'M') { x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); sx = x; sy = y; cmd = rel ? 'l' : 'L'; }
      else if (C === 'L') { x = (rel ? x : 0) + n(); y = (rel ? y : 0) + n(); }
      else if (C === 'H') { x = (rel ? x : 0) + n(); }
      else if (C === 'V') { y = (rel ? y : 0) + n(); }
      else { i++; continue; }
      pts.push([x, y]);
    }
    return pts;
  }

  /* ---------- an HTML figure ---------- */
  function htmlFig(root) {
    for (var e = root; e && e !== document.body; e = e.parentElement) { e.style.opacity = '1'; e.style.visibility = 'visible'; if (getComputedStyle(e).display === 'none') e.style.display = 'block'; }
    root.style.transform = 'none';
    root.querySelectorAll('*').forEach(function (el) { el.style.opacity = '1'; el.style.visibility = 'visible'; el.style.transform = 'none'; });
    var R = root.getBoundingClientRect(), k = R.width / root.offsetWidth;
    function box(r) { return {x: (r.left - R.left) / k, y: (r.top - R.top) / k, w: r.width / k, h: r.height / k}; }
    function rgb(c) { return c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent' ? c : null; }
    var out = {kind: 'html', id: root.id || 'figure', vb: [0, 0, root.offsetWidth, root.offsetHeight], boxes: [], texts: [], icons: [], sym: {}};
    root.querySelectorAll('*').forEach(function (el) {
      if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') return;
      var c = getComputedStyle(el), b = box(el.getBoundingClientRect()); if (!b.w || !b.h) return;
      if (el.tagName.toLowerCase() === 'svg') {
        var u = el.querySelector('use');
        if (u) { var h = u.getAttribute('href'), s = document.querySelector(h); if (s) out.sym[h] = {vb: s.getAttribute('viewBox'), html: s.innerHTML}; out.icons.push({href: h, color: c.color, x: b.x, y: b.y, w: b.w, h: b.h}); }
        return;
      }
      var bw = parseFloat(c.borderTopWidth) || 0, bg = rgb(c.backgroundColor);
      if (bg || (bw && c.borderTopStyle !== 'none'))
        out.boxes.push({x: b.x, y: b.y, w: b.w, h: b.h, fill: bg || 'none', stroke: bw ? c.borderTopColor : 'none', sw: bw, style: c.borderTopStyle, radius: Math.min(parseFloat(c.borderTopLeftRadius) || 0, b.h / 2, b.w / 2)});
    });
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), n;
    while ((n = walker.nextNode())) {
      if (!n.textContent.trim() || n.parentElement.closest('svg')) continue;
      var p = n.parentElement, c = getComputedStyle(p), lines = [], re = /\S+/g, mm;
      while ((mm = re.exec(n.textContent))) {
        var rg = document.createRange(); rg.setStart(n, mm.index); rg.setEnd(n, mm.index + mm[0].length);
        var rr = rg.getClientRects()[0]; if (!rr) continue;
        var b2 = box(rr), L = lines[lines.length - 1];
        if (L && Math.abs(L.y - b2.y) < 2) { L.s += ' ' + mm[0]; L.w = b2.x + b2.w - L.x; } else lines.push({s: mm[0], x: b2.x, y: b2.y, w: b2.w, h: b2.h});
      }
      lines.forEach(function (L) {
        if (c.textTransform === 'uppercase') L.s = L.s.toUpperCase();
        out.texts.push({s: L.s, x: L.x, y: L.y, w: L.w, h: L.h, ff: c.fontFamily, fs: parseFloat(c.fontSize), fw: c.fontWeight, color: c.color, ls: c.letterSpacing});
      });
    }
    return out;
  }

  window.addEventListener('load', function () {
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () { setTimeout(function () { try { run(); } catch (e) { done({error: String(e && e.stack || e)}); } }, 600); });
  });
})();
