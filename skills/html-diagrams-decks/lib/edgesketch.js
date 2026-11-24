/* EdgeSketch v1.4.1 — helpers for SVG figures drawn by hand, and a layout check for any SVG.
 *
 *   var s = EdgeSketch.create(svg, {icons: window.EDGE_ICONS});
 *   s.zone(0, 0, 400, 300, {label: 'SERVICE'});
 *   s.box(20, 40, 180, 52, {icon: 'server', title: 'API', sub: 'validates · enqueues', tone: 'accent', info: '...'});
 *   s.box(220, 40, 52, 220, {icon: 'broker', title: 'Event stream', sub: 'one profile', vertical: true});
 *   s.arrow(200, 66, 218, 66, {tone: 'accent', heads: 'both', dashed: true});
 *   s.connect(api, 'right', queue, 'left', {label: 'enqueue'});      // boxes by side, in line when they can be
 *   s.fan(api, 'bottom', [[w1, 'top'], [w2, 'top'], [w3, 'top']]);   // one point feeding several boxes
 *   s.text(20, 290, 'every arrow is used both ways', {cls: 'tag'});
 *
 * Wires run horizontally and vertically: an arrow between two points not in line turns at right
 * angles (route 'straight' keeps a deliberate diagonal), and its corners are rounded.
 *
 * For figures EdgeDiagram does not fit: layered stacks, left-to-right platform views, anything laid
 * out on a grid by hand, often with its own state and classes. Boxes fit their text to their width:
 * a title or a sub that is too long is set smaller, down to a floor, and is measured again once the
 * web fonts have loaded. A box with align 'center' centres its title and sub and puts the icon left
 * of the wider of the two. Everything else is plain SVG: s.el(tag, attrs, parent) adds any element.
 * Tones: neutral, accent, add, gap, p3 (a further phase, dashed), muted (outside, today), ink.
 *
 * EdgeSketch.check(svg) checks any SVG, drawn with this file or not, in its current state:
 *   - text outside the viewBox;
 *   - text running outside its box: a .sk-box or a [data-box] element, whose frame is its .sk-frame
 *     else its first rect; for a text in no marked box, the smallest painted rect beside it in the
 *     same group (not an svg element itself, where background bands live) that holds the text's centre, the
 *     last one drawn when two are the same size;
 *   - text on top of other text, an icon on top of text;
 *   - text partly on a box it does not belong to;
 *   - a wire that is slanted or curved: a path, line or polyline with an arrowhead or a class
 *     wire/arrow/link/connector, unless it or a parent has data-route="free";
 *   - boxes closer than 8 units to each other, or to the border of the .sk-zone they sit in;
 *   - and EdgeSketch.paint(svg), which EdgeDiagram, EdgeSequence, EdgeTimeline and EdgeMatrix also add to
 *     their own check when this file is on the page: text under 4.5:1 (3:1 at 18.66 px bold or 24 px),
 *     wires and icons under 3:1, against what is drawn behind them (fills, their opacity, the page), in
 *     the light and the dark theme (data-theme on the root is switched and put back); a wire through a
 *     text that is not its own (a label on a plate over its wire is fine, an arrowhead may touch its
 *     target); two wires closer than 6 units over 30 or more, which read as one. Anything faded below
 *     half its opacity is taken as faded on purpose.
 * Hidden elements are skipped, and so is anything inside [data-check="false"]. Each issue is
 * outlined in red and returned as a string. With window.ED_DEBUG set, every figure made with
 * create() and every svg[data-check] is checked once the fonts have loaded, and with
 * window.ED_DEBUG_ALL every svg[role="img"] that is not an EdgeDiagram figure is checked too;
 * the issues go into the same hidden <pre id="ed-issues"> as EdgeDiagram's, which
 * scripts/shot.sh --check reads.
 *
 * Colours come from the theme's tokens (--ed-ink, --ed-accent, --ed-p3, ...), as in EdgeDiagram.
 *
 * s.describe(), or EdgeSketch.describe(svg) for any figure, reads a text description from the drawing
 * (zones in reading order with their boxes, arrows between boxes); the svg points aria-describedby at it.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', VERSION = '1.4.1', UID = 0;
  var TONES = ['neutral', 'accent', 'add', 'gap', 'p3', 'muted', 'ink'];

  var CSS = [
    '.sk-root{--_ink:var(--ed-ink,#15201d);--_ink2:var(--ed-ink2,#3f4f4a);--_muted:var(--ed-muted,#5a6963);',
    '--_surface:var(--ed-surface,#fff);--_layer:var(--ed-layer,#e9eeec);--_rule:var(--ed-rule,#d2dbd7);',
    '--_accent:var(--ed-accent,#2456a4);--_accent-soft:var(--ed-accent-soft,#e3ebf6);--_gap:var(--ed-gap,#ad7600);',
    '--_gap-soft:var(--ed-gap-soft,#fbf1d9);--_add:var(--ed-add,#0b8a0b);--_add-soft:var(--ed-add-soft,#e3f3e3);',
    '--_p3:var(--ed-p3,#6b46c1);--_p3-soft:var(--ed-p3-soft,#efe9fb)}',
    '.sk-root text{font-family:var(--ed-sans,system-ui,sans-serif);fill:var(--_ink)}',
    '.sk-root .sk-t{font-weight:600}',
    '.sk-root .sk-s,.sk-root text.tag,.sk-root text.mono{font-family:var(--ed-mono,ui-monospace,monospace);fill:var(--_muted)}',
    '.sk-root text.tag{fill:var(--_ink2)}.sk-root text.mono{letter-spacing:.08em}',
    '.sk-root text.head{font-family:var(--ed-display,sans-serif);font-weight:700}',
    '.sk-root .sk-zone rect{fill:var(--_layer);stroke:var(--_rule)}.sk-root .sk-zone.t-accent rect{fill:var(--_accent-soft);stroke:none}',
    '.sk-root .sk-zone text{font-family:var(--ed-mono,ui-monospace,monospace);letter-spacing:.09em;fill:var(--_muted)}',
    '.sk-box .sk-frame{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.2}.sk-box use{color:var(--_ink2)}',
    '.sk-box .sk-shadow{fill:var(--_accent);opacity:.18}',
    '.sk-box.t-accent .sk-frame{fill:var(--_accent-soft);stroke:var(--_accent);stroke-width:1.6}.sk-box.t-accent use{color:var(--_accent)}',
    '.sk-box.t-add .sk-frame{fill:var(--_add-soft);stroke:var(--_add);stroke-width:1.4}.sk-box.t-add use{color:var(--_add)}',
    '.sk-box.t-gap .sk-frame{fill:var(--_gap-soft);stroke:var(--_gap);stroke-width:1.4}.sk-box.t-gap use{color:var(--_gap)}',
    '.sk-box.t-p3 .sk-frame{fill:var(--_p3-soft);stroke:var(--_p3);stroke-width:1.4;stroke-dasharray:5 3}.sk-box.t-p3 use{color:var(--_p3)}',
    '.sk-box.t-muted .sk-frame{stroke:var(--_muted)}',
    '.sk-box.t-accent .sk-s,.sk-box.t-add .sk-s,.sk-box.t-gap .sk-s,.sk-box.t-p3 .sk-s,.sk-root .sk-zone.t-accent text{fill:var(--_ink2)}',   // muted is too faint on a soft fill
    '.sk-box.t-ink .sk-frame{fill:var(--_ink);stroke:var(--_ink)}.sk-box.t-ink text,.sk-box.t-ink use{fill:var(--_surface);color:var(--_surface)}',
    '.sk-box.dashed .sk-frame{stroke-dasharray:5 3}',
    '.sk-box[tabindex]{cursor:help;outline:none}.sk-box[tabindex]:focus-visible .sk-frame{stroke-width:3}',
    '.sk-wire{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
    '.sk-wire.dashed{stroke-dasharray:4 3}',
    '.sk-dot{stroke:none}.sk-dot.t-neutral,.sk-dot.t-ink{fill:var(--_ink2)}.sk-dot.t-accent{fill:var(--_accent)}.sk-dot.t-add{fill:var(--_add)}',
    '.sk-dot.t-gap{fill:var(--_gap)}.sk-dot.t-p3{fill:var(--_p3)}.sk-dot.t-muted{fill:var(--_muted)}',
    '.sk-wire.t-neutral,.sk-wire.t-ink{stroke:var(--_ink2)}.sk-wire.t-accent{stroke:var(--_accent)}.sk-wire.t-add{stroke:var(--_add)}',
    '.sk-wire.t-gap{stroke:var(--_gap)}.sk-wire.t-p3{stroke:var(--_p3)}.sk-wire.t-muted{stroke:var(--_muted)}',
    '.sk-head.t-neutral,.sk-head.t-ink{fill:var(--_ink2)}.sk-head.t-accent{fill:var(--_accent)}.sk-head.t-add{fill:var(--_add)}',
    '.sk-head.t-gap{fill:var(--_gap)}.sk-head.t-p3{fill:var(--_p3)}.sk-head.t-muted{fill:var(--_muted)}',
    '.sk-debug rect{fill:none;stroke:#e5004c;stroke-width:2;stroke-dasharray:4 2}'
  ].join('\n');

  function el(tag, a, parent) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function injectCSS() {
    if (document.getElementById('sk-css')) return;
    var s = document.createElement('style'); s.id = 'sk-css'; s.textContent = CSS; document.head.appendChild(s);
  }
  function injectIcons(icons) {
    if (!icons || document.getElementById('ed-icons')) return;
    var h = el('svg', {id: 'ed-icons', 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden'});
    h.innerHTML = '<defs>' + icons + '</defs>';
    document.body.insertBefore(h, document.body.firstChild);
  }
  // set a text's size so it fits `room`, between max and min; measured again after each step, since
  // a face at small sizes (mono above all) does not narrow in proportion to its size
  function fit(t, room, max, min) {
    var size = max, len;
    t.style.fontSize = size + 'px';
    for (var i = 0; i < 6 && size > min; i++) {
      try { len = t.getComputedTextLength(); } catch (e) { return; }
      if (!(len > room)) return;
      size = Math.max(min, Math.min(size - 0.1, size * room / len));
      t.style.fontSize = size.toFixed(2) + 'px';
    }
  }

  function same(a, b) { return Math.abs(a - b) < 0.01; }
  /* points joined at right angles: a pair not in line turns once halfway (bend 'mid', a Z), or once at
     a corner (bend 'hv': horizontal first, 'vh': vertical first), continuing the run it is on */
  function orthogonal(pts, bend) {
    var out = [pts[0]];
    for (var i = 1; i < pts.length; i++) {
      var p = out[out.length - 1], q = pts[i];
      if (!same(p[0], q[0]) && !same(p[1], q[1])) {
        var prev = out.length > 1 ? out[out.length - 2] : null;
        var horiz = bend === 'hv' ? true : bend === 'vh' ? false
          : prev ? same(prev[1], p[1]) : Math.abs(q[0] - p[0]) >= Math.abs(q[1] - p[1]);
        if (bend === 'hv' || bend === 'vh' || prev) out.push(horiz ? [q[0], p[1]] : [p[0], q[1]]);
        else if (horiz) { var mx = (p[0] + q[0]) / 2; out.push([mx, p[1]], [mx, q[1]]); }
        else { var my = (p[1] + q[1]) / 2; out.push([p[0], my], [q[0], my]); }
      }
      out.push(q);
    }
    return out.filter(function (p, i) { var l = out[i - 1]; return !l || !same(l[0], p[0]) || !same(l[1], p[1]); });
  }
  /* from p0 leaving along n0 to p1 entering against n1: one run, an L or a Z, or around the back (a U) */
  function route(p0, n0, p1, n1, stub) {
    var a = [p0[0] + n0[0] * stub, p0[1] + n0[1] * stub], b = [p1[0] + n1[0] * stub, p1[1] + n1[1] * stub];
    if (n0[0] === -n1[0] && n0[1] === -n1[1]) {   // facing sides
      var h = n0[1] === 0;
      if (h ? same(p0[1], p1[1]) : same(p0[0], p1[0])) return [p0, p1];
      var ahead = h ? (p1[0] - p0[0]) * n0[0] > 2 * stub : (p1[1] - p0[1]) * n0[1] > 2 * stub;
      if (ahead) { var m = h ? (p0[0] + p1[0]) / 2 : (p0[1] + p1[1]) / 2; return h ? [p0, [m, p0[1]], [m, p1[1]], p1] : [p0, [p0[0], m], [p1[0], m], p1]; }
      var mid = h ? (p0[1] + p1[1]) / 2 : (p0[0] + p1[0]) / 2;
      return h ? [p0, a, [a[0], mid], [b[0], mid], b, p1] : [p0, a, [mid, a[1]], [mid, b[1]], b, p1];
    }
    if (n0[0] === n1[0] && n0[1] === n1[1]) {   // the same side: out past both, across, and back
      var far = n0[0] ? (n0[0] > 0 ? Math.max(a[0], b[0]) : Math.min(a[0], b[0])) : (n0[1] > 0 ? Math.max(a[1], b[1]) : Math.min(a[1], b[1]));
      return n0[0] ? [p0, [far, p0[1]], [far, p1[1]], p1] : [p0, [p0[0], far], [p1[0], far], p1];
    }
    // across: an L when the corner lies ahead of both ends, else out through a stub first
    var c = n0[0] ? [p1[0], p0[1]] : [p0[0], p1[1]];
    var okA = (c[0] - p0[0]) * n0[0] + (c[1] - p0[1]) * n0[1] > 0, okB = (c[0] - p1[0]) * n1[0] + (c[1] - p1[1]) * n1[1] > 0;
    if (okA && okB) return [p0, c, p1];
    return orthogonal([p0, a, b, p1], n0[0] ? 'vh' : 'hv');
  }
  function rounded(pts, r, sharp) {   // corners rounded, except at the points in sharp (a junction)
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i - 1], c = pts[i], n = pts[i + 1];
      var l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
      var rr = Math.min(r, l1 / 2, l2 / 2);
      if ((sharp || []).some(function (s) { return same(s[0], c[0]) && same(s[1], c[1]); })) rr = 0;
      if (!(rr > 0.01) || !l1 || !l2) { d += ' L' + c[0] + ' ' + c[1]; continue; }
      d += ' L' + (c[0] - (c[0] - p[0]) / l1 * rr) + ' ' + (c[1] - (c[1] - p[1]) / l1 * rr) +
           ' Q' + c[0] + ' ' + c[1] + ' ' + (c[0] + (n[0] - c[0]) / l2 * rr) + ' ' + (c[1] + (n[1] - c[1]) / l2 * rr);
    }
    var last = pts[pts.length - 1];
    return d + ' L' + last[0] + ' ' + last[1];
  }

  /* ---------- accessibility: a figure's text description, made from its model, the ARIA that points
     to it, and a live region that reads each step. The same block is in every figure library; the
     first one loaded defines window.TrazoA11y and the others use it. ---------- */
  var A11Y = global.TrazoA11y || (global.TrazoA11y = (function () {
    var HIDE = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
    function uid(base) { var id = base, k = 1; while (document.getElementById(id)) id = base + '-' + (++k); return id; }
    function plain(s) {   // a caption or a title may hold markup; a middle dot reads as a comma
      if (s == null) return '';
      if (Array.isArray(s)) s = s.join(', ');
      var d = document.createElement('div'); d.innerHTML = String(s);
      return d.textContent.replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim();
    }
    function and(a) { a = a.filter(Boolean); return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' and ' + a[a.length - 1]; }
    function stop(s) { s = plain(s); return s && !/[.!?:…]$/.test(s) ? s + '.' : s; }
    // blocks: a string is a paragraph, {head, items} a lead-in and its list
    function text(blocks) {
      return blocks.map(function (b) {
        return typeof b === 'string' ? b : [b.head].concat(b.items.map(function (i) { return '- ' + i; })).join('\n');
      }).join('\n');
    }
    function fill(box, blocks) {
      box.textContent = '';
      blocks.forEach(function (b) {
        var p = document.createElement('p'); p.textContent = typeof b === 'string' ? b : b.head; box.appendChild(p);
        if (typeof b === 'string' || !b.items.length) return;
        var ul = document.createElement('ul');
        b.items.forEach(function (i) { var li = document.createElement('li'); li.textContent = i; ul.appendChild(li); });
        box.appendChild(ul);
      });
    }
    function after(e, ref) { if (ref.parentNode && e.parentNode !== ref.parentNode) ref.parentNode.insertBefore(e, ref.nextSibling); }
    /* attach(svg, options, kind, model): model() returns the blocks. The svg gets a name (its aria-label,
       its <title>, options.title or its figure's figcaption), role img (group when it holds focusable
       items) and aria-describedby on a visually hidden element after it (or the page's own
       [data-describe="<svg id>"]). options.describe === false leaves the figure alone. */
    function attach(svg, o, kind, model) {
      var off = o.describe === false, box = null, live = null, queued = false, busy = false;
      var deck = !!(svg.closest && svg.closest('#stage .slide'));   // EdgeDeck reads a slide's steps itself
      if (!off && !svg.getAttribute('aria-label') && !svg.getAttribute('aria-labelledby')) {
        var t = svg.querySelector('title'), fig = svg.closest && svg.closest('figure'), cap = fig && fig.querySelector('figcaption');
        if (o.title || (t && t.textContent.trim())) svg.setAttribute('aria-label', o.title || t.textContent.trim());
        else if (cap) { if (!cap.id) cap.id = uid((svg.id || 'trazo-fig') + '-cap'); svg.setAttribute('aria-labelledby', cap.id); }
        else svg.setAttribute('aria-label', kind);
      }
      function wire(blocks) {
        if (!box) {
          box = (svg.id && document.querySelector('[data-describe="' + svg.id + '"]')) || null;
          if (!box) { box = document.createElement('div'); box.className = 'trazo-desc'; box.style.cssText = HIDE; }
          if (!box.id) box.id = uid((svg.id || 'trazo-fig') + '-desc');
        }
        if (!box.parentNode) after(box, svg);
        fill(box, blocks);
        var ids = (svg.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean);
        if (ids.indexOf(box.id) < 0) svg.setAttribute('aria-describedby', ids.concat([box.id]).join(' '));
        var r = svg.getAttribute('role');
        if (!r || r === 'img' || r === 'group') {   // focusable items inside an img would be hidden from a screen reader
          var group = !!svg.querySelector('[tabindex]');
          svg.setAttribute('role', group ? 'group' : 'img');
          if (group) svg.setAttribute('aria-roledescription', kind.toLowerCase()); else svg.removeAttribute('aria-roledescription');
        }
      }
      var h = {
        box: function () { return box; },
        describe: function () {   // the text, and the figure's description brought up to date
          busy = true;
          try { var b = model(); if (!off) wire(b); return text(b); } finally { busy = false; }
        },
        touch: function () {   // after a change to the model: describe again once the page's script is done
          if (off || queued || busy) return; queued = true;
          Promise.resolve().then(function () {
            queued = false;
            try { h.describe(); } catch (e) { if (global.console) console.warn('[trazo] describe: ' + e.message); }
          });
        },
        prepare: function () {   // a live region present before its first message, so that it is heard
          if (off || deck || o.live === false || live) return;
          live = document.createElement('div'); live.className = 'trazo-live'; live.setAttribute('aria-live', 'polite');
          live.style.cssText = HIDE; after(live, box && box.parentNode ? box : svg);
        },
        say: function (s) { if (live) { if (!live.parentNode) after(live, svg); live.textContent = plain(s); } },
        step: function (k, n, caption, fallback) {
          var c = plain(caption) || plain(fallback);
          h.say('Step ' + (k + 1) + ' of ' + n + (c ? ': ' + c : ''));
        },
        live: function () { return live; }
      };
      return h;
    }
    // calls to the model-building methods describe the figure again (once, after the page's script)
    function watch(api, names, h) {
      names.forEach(function (k) {
        var f = api[k]; if (typeof f !== 'function') return;
        api[k] = function () { var r = f.apply(this, arguments); h.touch(); return r; };
      });
    }
    return {attach: attach, watch: watch, text: text, plain: plain, and: and, stop: stop, uid: uid, HIDE: HIDE};
  })());

  /* ---------- a text description read from the DOM, for any figure (best effort): zones in reading
     order with their boxes, the arrows between boxes, fans as one sentence, and the free labels ---------- */
  function attrNum(e, a) { return parseFloat(e.getAttribute(a)) || 0; }
  function boxRect(g) {
    if (g.skRect) return g.skRect;
    var d = (g.getAttribute('data-box') || '').trim().split(/[\s,]+/).map(Number);
    if (d.length === 4 && d.every(isFinite)) return {x: d[0], y: d[1], w: d[2], h: d[3]};
    var r = g.querySelector('.sk-frame') || g.querySelector('rect');
    return r ? {x: attrNum(r, 'x'), y: attrNum(r, 'y'), w: attrNum(r, 'width'), h: attrNum(r, 'height')} : null;
  }
  function wireEnds(p) {
    if (p.tagName === 'line') return [[attrNum(p, 'x1'), attrNum(p, 'y1')], [attrNum(p, 'x2'), attrNum(p, 'y2')]];
    try { var len = p.getTotalLength(), a = p.getPointAtLength(0), b = p.getPointAtLength(len); return [[a.x, a.y], [b.x, b.y]]; } catch (e) {}
    var n = (p.getAttribute('d') || p.getAttribute('points') || '').match(/-?\d*\.?\d+/g);
    return n && n.length >= 4 ? [[+n[0], +n[1]], [+n[n.length - 2], +n[n.length - 1]]] : null;
  }
  function reading(a, b) { return Math.abs(a.r.y - b.r.y) > 20 ? a.r.y - b.r.y : a.r.x - b.r.x; }
  function within(r, x, y, pad) { return x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad; }
  function describeSvg(svg) {
    var P = A11Y.plain, skip = function (e) { return e.closest('defs, marker, .sk-debug, .ed-debug, [aria-hidden="true"]'); };
    var boxes = [].filter.call(svg.querySelectorAll('.sk-box, [data-box]'), function (g) { return !skip(g); }).map(function (g) {
      var ts = [].map.call(g.querySelectorAll('text'), function (t) { return P(t.textContent); }).filter(Boolean);
      var tt = g.querySelector('.sk-t'), title = tt ? P(tt.textContent) : ts[0] || '', subs = ts.filter(function (t) { return t !== title; });
      var lab = g.getAttribute('aria-label') || '', info = title && lab.indexOf(title + '. ') === 0 ? lab.slice(title.length + 2) : lab;
      return {g: g, r: boxRect(g), name: title || info || 'a box', subs: subs, info: P(info)};
    }).filter(function (b) { return b.r; });
    var used = [];
    var zones = [].filter.call(svg.querySelectorAll('.sk-zone'), function (g) { return !skip(g); }).map(function (g) {
      var r = g.querySelector('rect'), t = g.querySelector('text');
      if (t) used.push(t);
      return {g: g, r: {x: attrNum(r, 'x'), y: attrNum(r, 'y'), w: attrNum(r, 'width'), h: attrNum(r, 'height')}, name: t ? P(t.textContent) : '', boxes: []};
    }).sort(reading);
    var free = [].filter.call(svg.querySelectorAll('text'), function (t) {
      return !skip(t) && !t.closest('.sk-box, [data-box], .sk-zone') && !t.hasAttribute('data-wire') && P(t.textContent);
    });
    zones.forEach(function (z) {   // a zone without a label takes the first free text inside it, a head first
      if (z.name) return;
      var t = free.filter(function (t) { return used.indexOf(t) < 0 && within(z.r, attrNum(t, 'x'), attrNum(t, 'y'), 0); })
        .sort(function (a, b) { return (b.classList.contains('head') ? 1 : 0) - (a.classList.contains('head') ? 1 : 0) || attrNum(a, 'y') - attrNum(b, 'y'); })[0];
      if (t) { z.name = P(t.textContent); used.push(t); }
    });
    var loose = [];
    boxes.sort(reading).forEach(function (b) {
      var cx = b.r.x + b.r.w / 2, cy = b.r.y + b.r.h / 2;
      var z = zones.filter(function (z) { return within(z.r, cx, cy, 0); }).sort(function (p, q) { return p.r.w * p.r.h - q.r.w * q.r.h; })[0];
      (z ? z.boxes : loose).push(b);
    });
    function at(p) {   // the smallest box an end touches
      var hit = boxes.filter(function (b) { return within(b.r, p[0], p[1], 12); }).sort(function (a, b) { return a.r.w * a.r.h - b.r.w * b.r.h; })[0];
      return hit ? hit.name : null;
    }
    function lab(e) { var l = e.getAttribute('data-label'); return l ? ' (' + P(l) + ')' : ''; }
    var lines = [], done = [];
    [].forEach.call(svg.querySelectorAll('.sk-fan'), function (g) {   // one sentence per fan
      var ws = [].filter.call(g.querySelectorAll('path, line'), function (p) { done.push(p); return p.hasAttribute('marker-end') || p.hasAttribute('marker-start') || p.classList.contains('sk-wire'); });
      var es = ws.map(wireEnds).filter(Boolean); if (!es.length) return;
      var same = function (k) { return es.every(function (e) { return Math.abs(e[k][0] - es[0][k][0]) < 1 && Math.abs(e[k][1] - es[0][k][1]) < 1; }); };
      var into = !same(0) && same(1), one = at(es[0][into ? 1 : 0]);
      var many = es.map(function (e) { return at(e[into ? 0 : 1]); }).filter(Boolean);
      if (one && many.length) lines.push((into ? A11Y.and(many) + ' feed ' + one : one + ' feeds ' + A11Y.and(many)) + lab(g) + '.');
    });
    [].forEach.call(svg.querySelectorAll('.sk-wire, path[marker-end], path[marker-start], line[marker-end], line[marker-start], polyline[marker-end]'), function (p) {
      if (done.indexOf(p) >= 0 || skip(p)) return;
      var e = wireEnds(p), a = e && at(e[0]), b = e && at(e[1]);
      if (!a || !b || a === b) return;
      var me = p.hasAttribute('marker-end'), ms = p.hasAttribute('marker-start');
      var s = me && ms ? a + ' and ' + b + ', both ways' : me ? a + ' to ' + b : ms ? b + ' to ' + a : a + ' and ' + b + ' are joined';
      s += lab(p) + '.';
      if (lines.indexOf(s) < 0) lines.push(s);
    });
    function item(b) { return b.name + (b.subs.length ? ' (' + b.subs.join(', ') + ')' : '') + (b.info && b.info !== b.name ? ': ' + A11Y.stop(b.info) : '.'); }
    var out = ['A figure of ' + boxes.length + ' boxes' + (zones.length ? ' in ' + zones.length + ' zones' : '') + (lines.length ? ', with ' + lines.length + ' arrows' : '') + '.'];
    zones.forEach(function (z, i) { if (z.boxes.length || z.name) out.push({head: (z.name || 'Zone ' + (i + 1)) + ':', items: z.boxes.map(item)}); });
    if (loose.length) out.push({head: zones.length ? 'Other boxes:' : 'Boxes:', items: loose.map(item)});
    if (lines.length) out.push({head: 'Arrows:', items: lines});
    var notes = free.filter(function (t) { return used.indexOf(t) < 0; }).map(function (t) { return P(t.textContent); });
    if (notes.length) out.push({head: 'Labels:', items: notes});
    return out;
  }

  /* ---------- figures ---------- */
  function create(svg, options) {
    options = options || {};
    injectCSS(); injectIcons(options.icons);
    svg.classList.add('sk-root');
    var self = 'sketch-' + (++UID), id = svg.id || self;
    var defs = el('defs', {}, svg);
    var layers = {zones: el('g', {'class': 'sk-zones'}, svg), wires: el('g', {'class': 'sk-wires'}, svg)};
    layers.boxes = el('g', {'class': 'sk-boxes'}, svg); layers.labels = el('g', {'class': 'sk-labels'}, svg);
    var fits = [], marks = {};

    function marker(tone) {
      if (marks[tone]) return marks[tone];
      var m = el('marker', {id: 'sk-' + id + '-' + tone, viewBox: '0 0 8 8', refX: 7, refY: 4, markerWidth: 7, markerHeight: 7,
        orient: 'auto-start-reverse'}, defs);
      el('path', {d: 'M0 0.8 L7.4 4 L0 7.2 z', 'class': 'sk-head t-' + tone}, m);
      return (marks[tone] = 'url(#' + m.id + ')');
    }
    function tip(g, o) {
      if (!o.info) return;
      el('title', {}, g).textContent = (o.title ? o.title + ': ' : '') + o.info;
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'img');
      g.setAttribute('aria-label', (o.title ? o.title + '. ' : '') + o.info);
    }
    function lines(v) { return v == null ? [] : Array.isArray(v) ? v : [v]; }

    var api = {svg: svg, layers: layers, version: VERSION};
    api.el = function (tag, a, parent) { return el(tag, a, parent || layers.labels); };
    api.text = function (x, y, s, o) {
      o = o || {};
      var t = el('text', {x: x, y: y, 'class': o.cls || null, 'text-anchor': o.anchor || 'start'}, o.parent || layers.labels);
      if (o.size) t.style.fontSize = o.size + 'px';
      if (o.rotate) t.setAttribute('transform', 'rotate(' + o.rotate + ' ' + x + ' ' + y + ')');
      t.textContent = s;
      return t;
    };
    api.icon = function (name, x, y, size, o) {
      o = o || {};
      return el('use', {href: '#i-' + name, x: x, y: y, width: size, height: size, 'class': o.cls || null}, o.parent || layers.labels);
    };
    // a background band with an optional label at its top-left
    api.zone = function (x, y, w, h, o) {
      o = o || {};
      var g = el('g', {'class': 'sk-zone t-' + (o.tone || 'layer')}, layers.zones);
      el('rect', {x: x, y: y, width: w, height: h, rx: o.r != null ? o.r : 12}, g);
      if (o.label) api.text(x + 14, y + 20, o.label, {parent: g, size: o.labelSize || 11});
      return g;
    };
    /* a box: icon, title, sub. o: icon, title, sub (a string or lines), tone, dashed, shadow, align
       ('left' | 'center'), vertical (title and sub read bottom to top, icon at the foot), titleSize,
       subSize, minSize, iconSize, info, cls, r */
    api.box = function (x, y, w, h, o) {
      var n0 = fits.length, g = drawBox(x, y, w, h, o || {});
      fits.slice(n0).forEach(applyFit);   // fitted at once, and again when the web fonts arrive
      return g;
    };
    function drawBox(x, y, w, h, o) {
      var tone = o.tone || 'neutral';
      if (TONES.indexOf(tone) < 0) throw new Error('EdgeSketch: unknown tone ' + tone);
      var g = el('g', {'class': 'sk-box t-' + tone + (o.dashed ? ' dashed' : '') + (o.cls ? ' ' + o.cls : '')}, layers.boxes);
      g.skRect = {x: x, y: y, w: w, h: h};
      tip(g, o);
      var r = o.r != null ? o.r : 8, ts = o.titleSize || 12.5, ss = o.subSize || 9, min = o.minSize || 8;
      if (o.shadow) el('rect', {x: x + 4, y: y + 4, width: w, height: h, rx: r, 'class': 'sk-shadow'}, g);
      el('rect', {x: x, y: y, width: w, height: h, rx: r, 'class': 'sk-frame'}, g);
      var subs = lines(o.sub), is = o.iconSize || (o.vertical ? 22 : h >= 44 ? 20 : 16), t, u;
      if (o.vertical) {
        var my = y + (h - (o.icon ? is + 14 : 0)) / 2, cx = x + w / 2 - (subs.length ? 6 * subs.length : -4);
        t = api.text(cx, my, o.title || '', {parent: g, cls: 'sk-t', anchor: 'middle', rotate: -90});
        fits.push([t, h - (o.icon ? is + 24 : 16), ts, Math.max(min, 10)]);
        subs.forEach(function (s, i) {
          var st = api.text(cx + 14 + i * 11, my, s, {parent: g, cls: 'sk-s', anchor: 'middle', rotate: -90});
          fits.push([st, h - (o.icon ? is + 24 : 16), ss, min]);
        });
        if (o.icon) api.icon(o.icon, x + (w - is) / 2, y + h - is - 12, is, {parent: g});
        return g;
      }
      var block = (o.title ? 13 : 0) + subs.length * 12, top = y + (h - block) / 2 + 10;
      if (o.align === 'center') {
        var mid = x + w / 2 + (o.icon ? is / 2 + 4 : 0), room = w - 24 - (o.icon ? is + 8 : 0);
        t = o.title && api.text(mid, top, o.title, {parent: g, cls: 'sk-t', anchor: 'middle'});
        if (t) fits.push([t, room, ts, Math.max(min, 10)]);
        var subEls = subs.map(function (s, i) {
          var st = api.text(mid, top + (o.title ? 13 : 0) + i * 12, s, {parent: g, cls: 'sk-s', anchor: 'middle'});
          fits.push([st, room, ss, min]); return st;
        });
        if (o.icon) {
          u = api.icon(o.icon, x + 12, y + (h - is) / 2, is, {parent: g});
          fits.push([null, function () {   // the icon left of the wider line
            var wd = 0; [t].concat(subEls).forEach(function (e) { if (e) try { wd = Math.max(wd, e.getComputedTextLength()); } catch (x) {} });
            u.setAttribute('x', Math.max(x + 10, mid - wd / 2 - is - 8));
          }]);
        }
        return g;
      }
      var tx0 = x + (o.icon ? is + 18 : 12), room2 = x + w - 8 - tx0;
      if (o.icon) api.icon(o.icon, x + 10, y + (h - is) / 2, is, {parent: g});
      if (o.title) { t = api.text(tx0, top, o.title, {parent: g, cls: 'sk-t'}); fits.push([t, room2, ts, Math.max(min, 10)]); }
      subs.forEach(function (s, i) {
        var st = api.text(tx0, top + (o.title ? 13 : 0) + i * 12, s, {parent: g, cls: 'sk-s'});
        fits.push([st, room2, ss, min]);
      });
      return g;
    }
    /* an arrow from (x1, y1) to (x2, y2), or along points [[x, y], ...] when the first argument is an array.
       o: tone (default accent), heads ('end' default, 'both', 'start', 'none'), dashed, label, labelAt (0-1),
       route ('ortho' default: two points not in line are joined at right angles; 'straight' keeps the
       diagonal), bend ('mid' default: a Z turning halfway; 'hv' or 'vh': an L, horizontal or vertical
       first), radius (corners, default 6) */
    api.arrow = function (x1, y1, x2, y2, o) {
      var pts;
      if (Array.isArray(x1)) { pts = x1; o = y1; } else pts = [[x1, y1], [x2, y2]];
      o = o || {};
      if (o.route !== 'straight') pts = orthogonal(pts, o.bend);
      var tone = o.tone || 'accent', heads = o.heads || 'end';
      var d = o.route === 'straight' ? pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ')
        : rounded(pts, o.radius != null ? o.radius : 6, o.sharp);
      var p = el('path', {d: d, 'class': 'sk-wire t-' + tone + (o.dashed ? ' dashed' : '')}, o.parent || layers.wires);
      if (o.route === 'straight') p.setAttribute('data-route', 'free');   // a diagonal asked for
      if (heads === 'end' || heads === 'both') p.setAttribute('marker-end', marker(tone));
      if (heads === 'start' || heads === 'both') p.setAttribute('marker-start', marker(tone));
      if (o.label) {   // at labelAt along the wire, else halfway along its longest run; above a horizontal run, beside a vertical one
        var segs = [], total = 0, at = null;
        for (var i = 0; i < pts.length - 1; i++) { var l = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); segs.push(l); total += l; }
        if (o.labelAt != null) {
          var want = total * o.labelAt;
          for (var j = 0; j < segs.length && at == null; j++) { if (want <= segs[j] || j === segs.length - 1) at = {i: j, f: segs[j] ? Math.min(1, want / segs[j]) : 0}; else want -= segs[j]; }
        } else { var lj = 0; segs.forEach(function (l, j) { if (l > segs[lj]) lj = j; }); at = {i: lj, f: 0.5}; }
        var A = pts[at.i], B = pts[at.i + 1], mx = A[0] + (B[0] - A[0]) * at.f, my = A[1] + (B[1] - A[1]) * at.f;
        var vert = same(A[0], B[0]) && !same(A[1], B[1]);
        api.text(vert ? mx + 6 : mx, vert ? my + 3 : my - 6, o.label, {cls: 'tag', anchor: vert ? 'start' : 'middle', size: o.labelSize || 9.5}).setAttribute('data-wire', '');
        p.setAttribute('data-label', o.label);   // for the description
      }
      return p;
    };
    function rectOf(b) {
      if (b && b.skRect) return b.skRect;
      if (b && b.x != null && b.w != null) return b;
      if (Array.isArray(b)) return {x: b[0], y: b[1], w: b[2], h: b[3]};
      throw new Error('EdgeSketch: a box is what s.box() returned, {x, y, w, h} or [x, y, w, h]');
    }
    function side(r, sd, t) {
      t = t == null ? 0.5 : t;
      return sd === 'top' ? [r.x + r.w * t, r.y] : sd === 'bottom' ? [r.x + r.w * t, r.y + r.h]
        : sd === 'left' ? [r.x, r.y + r.h * t] : [r.x + r.w, r.y + r.h * t];
    }
    var NORMAL = {top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0]};
    /* s.connect(a, sideA, b, sideB, o): an arrow from a side of one box to a side of another, at right
       angles. With no position given (o.at, o.to: 0-1 along each side) and the boxes facing each other
       across a shared span, both ends move to make it one straight run. o.gap leaves room at each end
       (default 2 at the start, 3 at the arrowhead); the rest as in s.arrow. */
    api.connect = function (a, sa, b, sb, o) {
      o = o || {};
      var A = rectOf(a), B = rectOf(b), n0 = NORMAL[sa], n1 = NORMAL[sb], ta = o.at, tb = o.to;
      if (ta == null && tb == null && n0[0] === -n1[0] && n0[1] === -n1[1]) {
        var h = n0[1] === 0, lo = Math.max(h ? A.y : A.x, h ? B.y : B.x) + 6, hi = Math.min(h ? A.y + A.h : A.x + A.w, h ? B.y + B.h : B.x + B.w) - 6;
        if (lo <= hi) {
          var v = Math.max(lo, Math.min(hi, ((h ? A.y + A.h / 2 : A.x + A.w / 2) + (h ? B.y + B.h / 2 : B.x + B.w / 2)) / 2));
          ta = h ? (v - A.y) / A.h : (v - A.x) / A.w; tb = h ? (v - B.y) / B.h : (v - B.x) / B.w;
        }
      }
      var g0 = o.gap != null ? o.gap : 2, g1 = o.gap != null ? o.gap : 3;
      var p0 = side(A, sa, ta), p1 = side(B, sb, tb);
      p0 = [p0[0] + n0[0] * g0, p0[1] + n0[1] * g0]; p1 = [p1[0] + n1[0] * g1, p1[1] + n1[1] * g1];
      return api.arrow(route(p0, n0, p1, n1, o.stub != null ? o.stub : 14), o);
    };
    /* s.fan(a, sideA, [[b, sideB, t], ...], o): one point on a side feeding several boxes: a trunk, a bus
       at right angles (o.at sets where it runs) and a branch into each, with a dot where three runs
       meet. o.into: true gathers the boxes into the one point instead. Returns the group. */
    api.fan = function (a, sa, ends, o) {
      o = o || {};
      var A = rectOf(a), n = NORMAL[sa], v = n[0] === 0, tone = o.tone || 'accent', gap = o.gap != null ? o.gap : 2;
      function P(u, w) { return v ? [u, w] : [w, u]; }
      ends = ends.map(function (e) {
        e = Array.isArray(e) && e.length && !(typeof e[0] === 'number') ? e : [e];
        return {B: rectOf(e[0]), side: e[1] || {top: 'bottom', bottom: 'top', left: 'right', right: 'left'}[sa], t: e[2]};
      });
      var t = o.t;
      if (t == null) {   // the trunk in line with the end nearest the side's middle, when one is in reach
        var lo = v ? A.x : A.y, len = v ? A.w : A.h, m = Math.min(12, len / 4), best = null;
        ends.forEach(function (e) {
          var u = side(e.B, e.side, e.t)[v ? 0 : 1];
          if (u >= lo + m && u <= lo + len - m && (best == null || Math.abs(u - lo - len / 2) < Math.abs(best - lo - len / 2))) best = u;
        });
        t = best == null ? 0.5 : (best - lo) / len;
      }
      var pS = side(A, sa, t);
      pS = [pS[0] + n[0] * gap, pS[1] + n[1] * gap];
      var uS = v ? pS[0] : pS[1], wS = v ? pS[1] : pS[0], dir = v ? n[1] : n[0], near = Infinity;
      ends.forEach(function (e) { near = Math.min(near, dir > 0 ? (v ? e.B.y : e.B.x) - wS : wS - (v ? e.B.y + e.B.h : e.B.x + e.B.w)); });
      var bus = o.at != null ? o.at : wS + dir * Math.max(10, near / 2), g = el('g', {'class': 'sk-fan'}, layers.wires);
      var drops = [], paths = ends.map(function (e) {
        var p1 = side(e.B, e.side, e.t), n1 = NORMAL[e.side], g1 = o.gap != null ? o.gap : 3;
        p1 = [p1[0] + n1[0] * g1, p1[1] + n1[1] * g1];
        var u1 = v ? p1[0] : p1[1], w1 = v ? p1[1] : p1[0];
        if ((v ? n1[0] : n1[1]) !== 0) { var su = u1 + (v ? n1[0] : n1[1]) * 14; drops.push(su); return [pS, P(uS, bus), P(su, bus), P(su, w1), p1]; }
        drops.push(u1); return [pS, P(uS, bus), P(u1, bus), p1];
      });
      var us = drops.concat([uS]), min = Math.min.apply(null, us), max = Math.max.apply(null, us), dots = [], done = [];
      us.forEach(function (u) {
        if (done.some(function (x) { return Math.abs(x - u) < 1; })) return; done.push(u);
        var k = (u > min + 1 ? 1 : 0) + (u < max - 1 ? 1 : 0) + (Math.abs(u - uS) < 1 ? 1 : 0) + (drops.some(function (x) { return Math.abs(x - u) < 1; }) ? 1 : 0);
        if (k >= 3) dots.push(P(u, bus));
      });
      paths.forEach(function (pts) {
        if (o.into) pts = pts.slice().reverse();
        api.arrow(pts, Object.assign({}, o, {label: null, parent: g, sharp: dots}));
      });
      if (o.dot !== false) dots.forEach(function (p) { el('circle', {cx: p[0], cy: p[1], r: o.dotSize || 3, 'class': 'sk-dot t-' + tone}, g); });
      if (o.label) {   // beside the trunk
        var m = P(uS, (wS + bus) / 2);
        api.text(v ? m[0] + 6 : m[0], v ? m[1] + 3 : m[1] - 6, o.label, {cls: 'tag', anchor: v ? 'start' : 'middle', size: o.labelSize || 9.5}).setAttribute('data-wire', '');
        g.setAttribute('data-label', o.label);
      }
      return g;
    };
    function applyFit(f) { if (f[0]) fit(f[0], f[1], f[2], f[3]); else f[1](); }
    api.layout = function () { fits.forEach(applyFit); };
    api.check = function () { api.layout(); return check(svg); };
    // the text description, read from what was drawn; the figure is described again after each call
    var DESC = A11Y.attach(svg, options, 'Figure', function () { return describeSvg(svg); });
    api.describe = function () { return DESC.describe(); };
    A11Y.watch(api, ['zone', 'box', 'arrow', 'connect', 'fan', 'text', 'el'], DESC);
    api.layout();
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(api.layout);
    return api;
  }

  /* ---------- the check ---------- */
  function visible(e, stop) {
    for (var n = e; n && n !== stop.parentNode; n = n.parentNode) {
      if (n.nodeType !== 1) continue;
      if (n.getAttribute('data-check') === 'false') return false;
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity < 0.05) return false;
    }
    return true;
  }
  function clear(v) { return !v || v === 'none' || v === 'transparent' || /rgba\([^)]*,\s*0\)$/.test(v); }
  function painted(e) {
    var cs = getComputedStyle(e);
    return (!clear(cs.fill) && +cs.fillOpacity > 0) || (!clear(cs.stroke) && +cs.strokeOpacity > 0 && parseFloat(cs.strokeWidth) > 0);
  }
  function inter(a, b, pad) { return a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad; }
  function contains(a, b) { return b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5; }

  function check(svg) {
    var m = svg.getScreenCTM(); if (!m) return [];
    var inv = m.inverse(), name = svg.id ? '#' + svg.id : 'svg', out = [], seen = {};
    function pt(x, y) { var p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(inv); }
    function boxOf(e) {
      var r = e.getBoundingClientRect(); if (!r.width && !r.height) return null;
      var a = pt(r.left, r.top), b = pt(r.right, r.bottom);
      return {x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y)};
    }
    // a text's box without the empty band above and below its glyphs
    function inked(b, rot) {
      if (rot) { var px = b.w * 0.2; return {x: b.x + px, y: b.y, w: b.w - 2 * px, h: b.h}; }
      var py = b.h * 0.2; return {x: b.x, y: b.y + py, w: b.w, h: b.h - 2 * py};
    }
    function add(msg, b) { if (seen[msg]) return; seen[msg] = 1; out.push({msg: name + ': ' + msg, box: b}); }
    function quote(t) { var s = t.textContent.trim(); return '"' + (s.length > 40 ? s.slice(0, 39) + '…' : s) + '"'; }

    var vbv = svg.viewBox && svg.viewBox.baseVal, vb = vbv && vbv.width ? {x: vbv.x, y: vbv.y, w: vbv.width, h: vbv.height} : null;
    var frames = [].filter.call(svg.querySelectorAll('.sk-box, [data-box]'), function (g) { return visible(g, svg); }).map(function (g) {
      var f = g.querySelector('.sk-frame') || g.querySelector('rect'); return f && {g: g, b: boxOf(f)};
    }).filter(function (f) { return f && f.b; });
    var inferred = [];
    function frameOf(e, b) {
      var g = e.parentNode && e.parentNode.closest ? e.parentNode.closest('.sk-box, [data-box]') : null;
      for (var i = 0; i < frames.length; i++) if (frames[i].g === g) return frames[i];
      // no box marked: the smallest rect beside the text that holds its centre
      var cx = b.x + b.w / 2, cy = b.y + b.h / 2, best = null;
      if (e.parentNode.tagName === 'svg') return null;
      [].forEach.call(e.parentNode.children, function (c) {
        if (c.tagName !== 'rect' || !visible(c, svg) || !painted(c)) return;
        var r = boxOf(c); if (!r || cx < r.x || cx > r.x + r.w || cy < r.y || cy > r.y + r.h) return;
        if (!best || r.w * r.h <= best.b.w * best.b.h) best = {g: e.parentNode, b: r, rect: c};
      });
      if (!best) return null;
      for (var k = 0; k < inferred.length; k++) if (inferred[k].rect === best.rect) return inferred[k];
      inferred.push(best); return best;
    }
    var texts = [].filter.call(svg.querySelectorAll('text'), function (t) {
      return t.textContent.trim() && !t.closest('.ed-root .ed-item, .sk-debug, defs, marker, symbol, title') && visible(t, svg);
    }).map(function (t) {
      var b = boxOf(t), rot = /rotate\((-?90|270)/.test(t.getAttribute('transform') || '');
      return b && {t: t, b: b, k: inked(b, rot), f: frameOf(t, b)};
    }).filter(Boolean);
    var icons = [].filter.call(svg.querySelectorAll('use'), function (u) { return !u.closest('defs, symbol, .sk-debug') && visible(u, svg); })
      .map(function (u) { var b = boxOf(u); return b && {u: u, b: {x: b.x + b.w * 0.15, y: b.y + b.h * 0.15, w: b.w * 0.7, h: b.h * 0.7}}; }).filter(Boolean);

    texts.forEach(function (a, i) {
      if (vb && !contains(vb, a.k)) add('text ' + quote(a.t) + ' is outside the viewBox', a.b);
      if (a.f) {
        var f = a.f.b, over = Math.max(f.x + 2 - a.k.x, a.k.x + a.k.w - (f.x + f.w - 2), f.y + 1 - a.k.y, a.k.y + a.k.h - (f.y + f.h - 1));
        if (over > 1) add('text ' + quote(a.t) + ' runs ' + Math.round(over) + ' px outside its box', a.b);
      }
      frames.concat(inferred).forEach(function (F) {
        if (F === a.f || F.g.contains(a.t)) return;
        if (a.f && contains(F.b, a.f.b)) return;   // a box inside a bigger box
        if (inter(a.k, F.b, 1) && !contains(F.b, a.k)) add('text ' + quote(a.t) + ' is partly on a box it does not belong to', a.b);
      });
      for (var j = i + 1; j < texts.length; j++) {
        var b = texts[j];
        if (inter(a.k, b.k, 1.5)) add('texts ' + quote(a.t) + ' and ' + quote(b.t) + ' overlap', a.b);
      }
      icons.forEach(function (c) {
        if (inter(a.k, c.b, 1.5)) add('icon ' + (c.u.getAttribute('href') || '') + ' covers text ' + quote(a.t), c.b);
      });
    });

    // wires: at right angles, with no curve but a rounded corner
    [].forEach.call(svg.querySelectorAll('path, line, polyline'), function (w) {
      if (w.closest('[data-route="free"]') || !isWire(w, svg)) return;
      var bad = wireShape(w); if (!bad) return;
      add(wireName(w) + ' is ' + bad + ': draw it at right angles (s.arrow, s.connect, s.fan) or mark it data-route="free"', boxOf(w));
    });

    // boxes crowded: closer than 8 units to another box or to the border of the zone they sit in
    var zoneRects = [].filter.call(svg.querySelectorAll('.sk-zone > rect'), function (z) { return visible(z, svg); })
      .map(function (z) { return {b: boxOf(z)}; }).filter(function (z) { return z.b; });
    function boxName(F) { var t = F.g.querySelector('text'); return t && t.textContent.trim() ? quote(t) : 'at ' + Math.round(F.b.x) + ',' + Math.round(F.b.y); }
    frames.forEach(function (A, i) {
      frames.slice(i + 1).forEach(function (B) {
        var g = gapOf(A.b, B.b);
        if (g != null && g < CROWD) add('boxes ' + boxName(A) + ' and ' + boxName(B) + ' are ' + round1(g) + ' units apart: keep ' + CROWD + ' or more between boxes', B.b);
      });
      zoneRects.forEach(function (Z) {
        if (!contains(Z.b, A.b)) return;
        var m = Math.min(A.b.x - Z.b.x, Z.b.x + Z.b.w - A.b.x - A.b.w, A.b.y - Z.b.y, Z.b.y + Z.b.h - A.b.y - A.b.h);
        if (m < CROWD) add('box ' + boxName(A) + ' is ' + round1(m) + ' units from the border of its zone: keep ' + CROWD + ' or more', A.b);
      });
    });

    paintIssues(svg).forEach(function (i) { add(i.msg, i.box); });

    var old = svg.querySelector('.sk-debug'); if (old) old.remove();
    if (out.length) {
      var g = el('g', {'class': 'sk-debug', 'aria-hidden': 'true'}, svg);
      out.forEach(function (i) { if (i.box) el('rect', {x: i.box.x - 2, y: i.box.y - 2, width: i.box.w + 4, height: i.box.h + 4, rx: 3}, g); });
      if (!document.getElementById('sk-css')) injectCSS();
    }
    return out.map(function (i) { return i.msg; });
  }

  /* a wire: a path, line or polyline with an arrowhead or a class wire/arrow/link/connector, not filled */
  function isWire(w, svg) {
    if (!/^(path|line|polyline)$/.test(w.tagName) || w.closest('defs, marker, symbol, [class*="-debug"]') || !visible(w, svg)) return false;
    var cs = getComputedStyle(w), cls = w.getAttribute('class') || '';
    if (!clear(cs.fill) && w.tagName !== 'line') return false;   // a filled shape (an arrowhead), not a wire
    var marked = (cs.markerEnd && cs.markerEnd !== 'none') || (cs.markerStart && cs.markerStart !== 'none') || w.hasAttribute('marker-end') || w.hasAttribute('marker-start');
    return !!marked || /(^|[\s_-])(wire|arrow|link|connector)s?($|[\s_-])/i.test(cls);
  }
  // what a reader would call an element: a library's item by its id, else its id or tag and class
  function wireName(w) {
    var g = w.closest('[data-id]'), id = g && g.getAttribute('data-id');
    if (id && w.closest('.ed-link')) return 'link ' + id;
    if (id && w.closest('.sq-msg')) return 'message ' + id;
    if (id && w.closest('.tl-dep')) return 'dependency ' + id;
    if (w.id) return 'wire #' + w.id;
    try {   // where it starts and ends, in the figure's units
      var M = w.ownerSVGElement.getScreenCTM().inverse().multiply(w.getScreenCTM()), L = w.getTotalLength();
      var a = w.getPointAtLength(0).matrixTransform(M), b = w.getPointAtLength(L).matrixTransform(M);
      return 'wire from ' + Math.round(a.x) + ',' + Math.round(a.y) + ' to ' + Math.round(b.x) + ',' + Math.round(b.y);
    } catch (x) { return 'wire ' + w.tagName; }
  }
  function thingName(e) {
    if (!e) return 'the page';
    var g = e.closest('[data-id]'), id = g && g.getAttribute('data-id');
    if (id) {
      var k = e.closest('.ed-zone, .ed-node, .ed-lgroup, .sq-actor, .sq-note, .sq-frame, .sq-msg, .tl-bar, .tl-phase, .tl-band, .tl-lane');
      var c = k ? k.getAttribute('class') : '';
      if (/ed-lgroup/.test(c)) return 'the plate of the label of ' + id.replace(/\.label$/, '');
      if (/sq-msg/.test(c)) return 'the plate of the label of ' + id;
      return (/ed-zone|tl-band/.test(c) ? 'zone ' : /ed-node/.test(c) ? 'node ' : /sq-actor/.test(c) ? 'actor ' : /sq-note/.test(c) ? 'note ' :
        /sq-frame/.test(c) ? 'frame ' : /tl-bar/.test(c) ? 'bar ' : /tl-phase/.test(c) ? 'phase ' : /tl-lane/.test(c) ? 'lane ' : '') + id;
    }
    if (e.id) return '#' + e.id;
    var box = e.closest('.sk-box, [data-box]'), t = box && box.querySelector('text');
    if (t && t.textContent.trim()) return 'box "' + t.textContent.trim().slice(0, 30) + '"';
    if (e.closest('.sk-zone')) return 'a zone';
    var named = e.closest('[class]'), cls = named && named.getAttribute('class').trim().split(/\s+/)[0];
    return e.tagName + (cls ? ' in .' + cls : '');
  }
  var CROWD = 8, APART = 6, ALONG = 30;
  function round1(v) { return Math.round(v * 10) / 10; }
  // the gap between two boxes that neither overlap nor nest, else null
  function gapOf(a, b) {
    if (contains(a, b) || contains(b, a)) return null;
    var gx = Math.max(b.x - a.x - a.w, a.x - b.x - b.w), gy = Math.max(b.y - a.y - a.h, a.y - b.y - b.h);
    if (gx < -0.5 && gy < -0.5) return null;   // overlapping: reported elsewhere
    return Math.max(0, Math.max(gx, gy));
  }

  /* ---------- paint: contrast in both themes, wires over text, wires run together ----------
     paintIssues(svg) looks at the figure as it is drawn: the colour of each text, wire and icon, and of
     what is painted under it (the fills before it in document order that hold the point, over the
     page's background), with every opacity on the way; switching data-theme on the root to light and
     to dark and back. Anything faded below half its opacity is taken as faded on purpose. */
  var RGB = {}, ctx2d = null;
  function rgba(c) {   // any CSS colour as [r, g, b, a]; a colour rgb() does not spell (color-mix, oklch) through a canvas pixel
    if (RGB[c]) return RGB[c];
    var m = /^rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:\s*[,/]\s*([\d.]+)(%?))?\s*\)$/.exec(c), v;
    if (m) v = [+m[1], +m[2], +m[3], m[4] == null ? 1 : m[5] ? m[4] / 100 : +m[4]];
    else {
      if (!ctx2d) { var cv = document.createElement('canvas'); cv.width = cv.height = 1; ctx2d = cv.getContext('2d', {willReadFrequently: true}); }
      ctx2d.clearRect(0, 0, 1, 1); ctx2d.fillStyle = 'rgba(0,0,0,0)'; ctx2d.fillStyle = c; ctx2d.fillRect(0, 0, 1, 1);
      var d = ctx2d.getImageData(0, 0, 1, 1).data; v = [d[0], d[1], d[2], d[3] / 255];
    }
    return (RGB[c] = v);
  }
  function lum(c) {
    function f(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function over(c, a, bg) { return [c[0] * a + bg[0] * (1 - a), c[1] * a + bg[1] * (1 - a), c[2] * a + bg[2] * (1 - a)]; }
  function opacityOf(e) {   // the element's opacity times every ancestor's, filter: opacity() included
    var a = 1;
    for (var n = e; n && n.nodeType === 1; n = n.parentNode) {
      var cs = getComputedStyle(n), m = /opacity\(\s*([\d.]+)(%?)\s*\)/.exec(cs.filter || '');
      a *= +cs.opacity; if (m) a *= m[2] ? m[1] / 100 : +m[1];
    }
    return a;
  }
  function pageColour(svg) {   // the backgrounds of the svg and its ancestors, over the canvas
    var chain = [], dark = /dark/.test(getComputedStyle(document.documentElement).colorScheme || '');
    for (var n = svg; n && n.nodeType === 1; n = n.parentNode) chain.unshift(n);
    var bg = dark ? [18, 18, 18] : [255, 255, 255];
    chain.forEach(function (n) { var c = rgba(getComputedStyle(n).backgroundColor); if (c[3]) bg = over(c, c[3], bg); });
    return bg;
  }
  function paintIssues(svg, o) {
    o = o || {};
    var m = svg.getScreenCTM(); if (!m) return [];
    var inv = m.inverse(), out = [], seen = {};
    function add(msg, b) { if (seen[msg]) return; seen[msg] = 1; out.push({msg: msg, box: b}); }
    function boxOf(e) {
      var r = e.getBoundingClientRect(); if (!r.width && !r.height) return null;
      var p = svg.createSVGPoint(), q = svg.createSVGPoint(); p.x = r.left; p.y = r.top; q.x = r.right; q.y = r.bottom;
      p = p.matrixTransform(inv); q = q.matrixTransform(inv);
      return {x: Math.min(p.x, q.x), y: Math.min(p.y, q.y), w: Math.abs(q.x - p.x), h: Math.abs(q.y - p.y)};
    }
    function quote(t) { var s = t.textContent.trim(); return '"' + (s.length > 40 ? s.slice(0, 39) + '…' : s) + '"'; }
    function within(p, b) { return p[0] > b.x && p[0] < b.x + b.w && p[1] > b.y && p[1] < b.y + b.h; }
    var all = [].slice.call(svg.querySelectorAll('*')), ord = new Map();
    all.forEach(function (e, i) { ord.set(e, i); });
    function left(e) { return e.closest('defs, marker, symbol, clipPath, mask, pattern, title, [class*="-debug"], [data-check="false"]'); }
    var texts = all.filter(function (t) { return t.tagName === 'text' && t.textContent.trim() && !left(t) && visible(t, svg); }).map(function (t) {
      var b = boxOf(t); if (!b || !b.w) return null;
      var rot = /rotate\((-?90|270)/.test(t.getAttribute('transform') || ''), k = rot ? {x: b.x + b.w * 0.2, y: b.y, w: b.w * 0.6, h: b.h} : {x: b.x, y: b.y + b.h * 0.2, w: b.w, h: b.h * 0.6};
      return {e: t, i: ord.get(t), b: b, k: k};
    }).filter(Boolean);
    var wires = all.filter(function (w) { return !left(w) && isWire(w, svg); }).map(function (w) {
      var len = 0; try { len = w.getTotalLength(); } catch (x) {}
      var b = boxOf(w); if (!b || !len) return null;
      var M = inv.multiply(w.getScreenCTM()), pts = [], cs = getComputedStyle(w);
      var e0 = cs.markerStart && cs.markerStart !== 'none' ? 10 : 3, e1 = cs.markerEnd && cs.markerEnd !== 'none' ? 10 : 3;   // an arrowhead touches its target
      for (var s = e0; s <= len - e1; s += 3) { var p = w.getPointAtLength(s).matrixTransform(M); pts.push([p.x, p.y]); }
      var segs = shape(w).segs.map(function (g) {
        var a = svg.createSVGPoint(), c = svg.createSVGPoint(); a.x = g[0][0]; a.y = g[0][1]; c.x = g[1][0]; c.y = g[1][1];
        a = a.matrixTransform(M); c = c.matrixTransform(M); return [[a.x, a.y], [c.x, c.y]];
      });
      return {e: w, i: ord.get(w), b: b, pts: pts, segs: segs, name: wireName(w)};
    }).filter(Boolean);
    var icons = all.filter(function (u) { return u.tagName === 'use' && !left(u) && visible(u, svg); }).map(function (u) {
      var b = boxOf(u); return b && {e: u, i: ord.get(u), b: b};
    }).filter(Boolean);
    var shapes = all.filter(function (e) { return /^(rect|circle|ellipse|polygon|path)$/.test(e.tagName) && !left(e) && visible(e, svg); }).map(function (e) {
      var b = boxOf(e); return b && {e: e, i: ord.get(e), b: b, toLocal: e.getScreenCTM().inverse().multiply(m)};
    }).filter(Boolean);
    var live = [], page = null;
    function fills() {   // the shapes that paint a fill, with its colour and opacity, in this theme
      live = shapes.map(function (P) {
        var cs = getComputedStyle(P.e); if (clear(cs.fill) || /url\(/.test(cs.fill)) return null;
        var c = rgba(cs.fill), a = c[3] * (+cs.fillOpacity) * opacityOf(P.e);
        return a > 0.02 ? {e: P.e, i: P.i, b: P.b, toLocal: P.toLocal, c: c, a: a} : null;
      }).filter(Boolean);
      page = pageColour(svg);
    }
    function covers(P, p) {
      if (!within(p, P.b)) return false;
      if (P.e.tagName === 'rect' && !(+P.e.getAttribute('rx'))) return true;
      var q = svg.createSVGPoint(); q.x = p[0]; q.y = p[1]; q = q.matrixTransform(P.toLocal);
      try { return P.e.isPointInFill(q); } catch (x) { return true; }
    }
    function behind(p, k) {   // the colour under p of what is drawn before order k, and the topmost such shape
      var c = page, top = null;
      for (var i = 0; i < live.length && live[i].i < k; i++) if (covers(live[i], p)) { c = over(live[i].c, live[i].a, c); if (live[i].a > 0.3) top = live[i].e; }
      return {c: c, top: top};
    }
    function hidden(p, lo, hi) {   // under a solid fill drawn between orders lo and hi
      for (var i = 0; i < live.length; i++) { var P = live[i]; if (P.i > lo && P.i < hi && P.a >= 0.85 && covers(P, p)) return true; }
      return false;
    }

    // contrast, in each theme
    var root = document.documentElement, was = root.getAttribute('data-theme'), themes = o.themes || ['light', 'dark'], low = new Map();
    var still = document.createElement('style'); still.textContent = '*,*::before,*::after{transition:none!important}';
    (document.head || root).appendChild(still);
    function note(e, r, need, th, bg, what, b) {
      var w = low.get(e);
      if (!w) low.set(e, w = {r: r, need: need, themes: [], bg: bg, what: what, b: b});
      if (r < w.r) { w.r = r; w.bg = bg; }
      if (w.themes.indexOf(th) < 0) w.themes.push(th);
    }
    try {
      themes.forEach(function (th) {
        root.setAttribute('data-theme', th);
        fills();
        texts.forEach(function (T) {
          var cs = getComputedStyle(T.e); if (clear(cs.fill) || /url\(/.test(cs.fill)) return;
          var op = opacityOf(T.e); if (op < 0.5) return;
          var c = rgba(cs.fill), a = c[3] * (+cs.fillOpacity) * op, size = parseFloat(cs.fontSize), bold = (parseInt(cs.fontWeight, 10) || 400) >= 600;
          var need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5, k = T.k, worst = null;
          [[k.x + k.w / 2, k.y + k.h / 2], [k.x + k.w * 0.15, k.y + k.h / 2], [k.x + k.w * 0.85, k.y + k.h / 2]].forEach(function (p) {
            var u = behind(p, T.i), r = ratio(over(c, a, u.c), u.c);
            if (!worst || r < worst.r) worst = {r: r, top: u.top};
          });
          if (worst.r < need) note(T.e, worst.r, need, th, worst.top, 'text ' + quote(T.e), T.b);
        });
        wires.forEach(function (W) {
          var cs = getComputedStyle(W.e); if (clear(cs.stroke) || /url\(/.test(cs.stroke)) return;
          var op = opacityOf(W.e); if (op < 0.5) return;
          var c = rgba(cs.stroke), a = c[3] * (+cs.strokeOpacity) * op, worst = null;
          for (var q = 0; q < W.pts.length; q += 4) {
            var p = W.pts[q]; if (hidden(p, W.i, Infinity)) continue;
            var u = behind(p, W.i), r = ratio(over(c, a, u.c), u.c);
            if (!worst || r < worst.r) worst = {r: r, top: u.top};
          }
          if (worst && worst.r < 3) note(W.e, worst.r, 3, th, worst.top, W.name, W.b);
        });
        icons.forEach(function (I) {
          var cs = getComputedStyle(I.e), op = opacityOf(I.e); if (op < 0.5) return;
          var c = rgba(cs.color), p = [I.b.x + I.b.w / 2, I.b.y + I.b.h / 2], u = behind(p, I.i), r = ratio(over(c, c[3] * op, u.c), u.c);
          if (r < 3) note(I.e, r, 3, th, u.top, 'icon ' + (I.e.getAttribute('href') || I.e.getAttribute('xlink:href') || ''), I.b);
        });
      });
    } finally {
      if (was == null) root.removeAttribute('data-theme'); else root.setAttribute('data-theme', was);
      getComputedStyle(root).color; still.remove();
    }
    fills();
    low.forEach(function (w) {
      var th = w.themes.length > 1 ? 'the light and the dark theme' : 'the ' + w.themes[0] + ' theme';
      add(w.what + ' has contrast ' + (Math.floor(w.r * 10) / 10).toFixed(1) + ':1 on ' + thingName(w.bg) + ' in ' + th + ' (needs ' + w.need + ':1): ' +
        (/^text/.test(w.what) ? 'use a stronger ink, or a lighter fill under it' : 'use a stronger tone, or a lighter fill under it'), w.b);
    });

    // a wire through a text that is not its own: drawn above the text, or under it with no solid fill between
    wires.forEach(function (W) {
      texts.forEach(function (T) {
        if (opacityOf(T.e) < 0.5 || W.b.x > T.k.x + T.k.w || W.b.x + W.b.w < T.k.x || W.b.y > T.k.y + T.k.h || W.b.y + W.b.h < T.k.y) return;
        var k = {x: T.k.x + 1, y: T.k.y + 1, w: T.k.w - 2, h: T.k.h - 2};
        for (var q = 0; q < W.pts.length; q++) {
          var p = W.pts[q]; if (!within(p, k) || (W.i < T.i && hidden(p, W.i, T.i)) || hidden(p, Math.max(W.i, T.i), Infinity)) continue;
          add(W.name + ' crosses text ' + quote(T.e) + ': move the text off the wire, or route the wire around it', T.b); break;
        }
      });
    });

    // two wires that run side by side closer than APART units over ALONG or more read as one
    wires.forEach(function (A, i) {
      wires.slice(i + 1).forEach(function (B) {
        if (A.b.x > B.b.x + B.b.w + APART || B.b.x > A.b.x + A.b.w + APART || A.b.y > B.b.y + B.b.h + APART || B.b.y > A.b.y + A.b.h + APART) return;
        for (var s = 0; s < A.segs.length; s++) for (var t = 0; t < B.segs.length; t++) {
          var r = alongside(A.segs[s], B.segs[t]);
          if (r) { add(A.name + ' and ' + B.name + ' run ' + round1(r.gap) + ' units apart for ' + Math.round(r.len) + ' units and read as one wire: keep them ' + APART + ' or more apart', r.box); return; }
        }
      });
    });
    return out;
  }
  // two axis-aligned runs in parallel, between 0.75 and APART apart (closer is one shared run, as in a fan), over ALONG or more
  function alongside(a, b) {
    var ha = Math.abs(a[0][1] - a[1][1]) < 0.5, hb = Math.abs(b[0][1] - b[1][1]) < 0.5;
    var va = Math.abs(a[0][0] - a[1][0]) < 0.5, vb = Math.abs(b[0][0] - b[1][0]) < 0.5;
    var ax = ha ? 0 : va ? 1 : -1; if (ax < 0 || !(ax === 0 ? hb : vb)) return null;
    var c = 1 - ax, gap = Math.abs(a[0][c] - b[0][c]);
    if (gap < 0.75 || gap >= APART) return null;
    var lo = Math.max(Math.min(a[0][ax], a[1][ax]), Math.min(b[0][ax], b[1][ax])), hi = Math.min(Math.max(a[0][ax], a[1][ax]), Math.max(b[0][ax], b[1][ax]));
    if (hi - lo < ALONG) return null;
    var y0 = Math.min(a[0][c], b[0][c]);
    return {gap: gap, len: hi - lo, box: ax === 0 ? {x: lo, y: y0, w: hi - lo, h: gap} : {x: y0, y: lo, w: gap, h: hi - lo}};
  }

  /* 'slanted' or 'curved' for a wire that is either, else null. A curve that turns a right angle within
     40 units is a rounded corner. */
  function wireShape(w) {
    var sh = shape(w);
    if (sh.curved) return 'curved';
    for (var j = 0; j < sh.segs.length; j++) {
      var dx = Math.abs(sh.segs[j][1][0] - sh.segs[j][0][0]), dy = Math.abs(sh.segs[j][1][1] - sh.segs[j][0][1]);
      if (dx > 1.5 && dy > 1.5) return 'slanted';
    }
    return null;
  }
  // a wire's straight runs, in its own coordinates, and whether it curves anywhere but a rounded corner
  function shape(w) {
    var segs = [], curved = false, num = function (a) { return parseFloat(w.getAttribute(a)) || 0; };
    if (w.tagName === 'line') segs.push([[num('x1'), num('y1')], [num('x2'), num('y2')]]);
    else if (w.tagName === 'polyline') {
      var v = (w.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
      for (var i = 2; i + 1 < v.length; i += 2) segs.push([[v[i - 2], v[i - 1]], [v[i], v[i + 1]]]);
    } else {
      var toks = (w.getAttribute('d') || '').match(/[a-zA-Z]|-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?/g) || [];
      var k = 0, cmd = '', p = [0, 0], start = [0, 0];
      function n() { return parseFloat(toks[k++]); }
      function corner(a, c1, c2, b) {   // a right-angle turn: out along one axis, in along the other, small
        function ax(u, q) { return Math.abs(u[0] - q[0]) < 0.5 ? 'v' : Math.abs(u[1] - q[1]) < 0.5 ? 'h' : null; }
        var d1 = same2(a, c1) ? ax(a, c2) : ax(a, c1), d2 = same2(c2, b) ? ax(c1, b) : ax(c2, b);
        return d1 && d2 && d1 !== d2 && Math.abs(b[0] - a[0]) <= 40 && Math.abs(b[1] - a[1]) <= 40;
      }
      function same2(u, q) { return Math.abs(u[0] - q[0]) < 0.5 && Math.abs(u[1] - q[1]) < 0.5; }
      while (k < toks.length) {
        if (/[a-zA-Z]/.test(toks[k])) cmd = toks[k++];
        var rel = cmd === cmd.toLowerCase(), C = cmd.toUpperCase(), o = rel ? p : [0, 0], q;
        if (C === 'Z') { segs.push([p, start]); p = start; continue; }
        if (C === 'M') { p = start = [o[0] + n(), o[1] + n()]; cmd = rel ? 'l' : 'L'; continue; }
        if (C === 'L' || C === 'T') { q = [o[0] + n(), o[1] + n()]; if (C === 'T') curved = true; else segs.push([p, q]); }
        else if (C === 'H') { q = [(rel ? p[0] : 0) + n(), p[1]]; segs.push([p, q]); }
        else if (C === 'V') { q = [p[0], (rel ? p[1] : 0) + n()]; segs.push([p, q]); }
        else if (C === 'C') { var c1 = [o[0] + n(), o[1] + n()], c2 = [o[0] + n(), o[1] + n()]; q = [o[0] + n(), o[1] + n()]; if (!corner(p, c1, c2, q)) curved = true; }
        else if (C === 'Q') { var c = [o[0] + n(), o[1] + n()]; q = [o[0] + n(), o[1] + n()]; if (!corner(p, c, c, q)) curved = true; }
        else if (C === 'S') { n(); n(); q = [o[0] + n(), o[1] + n()]; curved = true; }
        else if (C === 'A') { var rx = n(), ry = n(); n(); n(); n(); q = [o[0] + n(), o[1] + n()]; if (Math.max(rx, ry) > 40 || Math.abs(Math.abs(q[0] - p[0]) - Math.abs(q[1] - p[1])) > 1) curved = true; }
        else { k++; continue; }
        if (isNaN(q[0]) || isNaN(q[1])) break;
        p = q;
      }
    }
    return {segs: segs, curved: curved};
  }

  // the issues of every checked figure, in one hidden <pre> that scripts/shot.sh --check reads
  function report(key, list) {
    var R = global.ED_ISSUES = global.ED_ISSUES || {};
    R[key] = list;
    var pre = document.getElementById('ed-issues');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'ed-issues'; pre.hidden = true; document.body.appendChild(pre); }
    var keys = Object.keys(R);
    pre.textContent = keys.map(function (k) { return R[k].join('\n'); }).filter(Boolean).join('\n');
    pre.setAttribute('data-diagrams', keys.length);
    list.forEach(function (m) { if (global.console) console.warn('[EdgeSketch] ' + m); });
  }
  function checkAll(all) {
    var sel = 'svg.sk-root, svg[data-check]:not([data-check="false"])' + (all ? ', svg[role="img"]' : '');
    [].forEach.call(document.querySelectorAll(sel), function (svg, i) {
      if (svg.classList.contains('ed-root') || svg.classList.contains('sq-root') || svg.classList.contains('tl-root') || svg.classList.contains('em-root') || svg.getAttribute('data-check') === 'false') return;   // those check themselves
      report('sketch:' + (svg.id || i), check(svg));
    });
  }
  if (global.ED_DEBUG || global.ED_DEBUG_ALL) {
    global.addEventListener('load', function () {
      var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.then(function () { setTimeout(function () { checkAll(!!global.ED_DEBUG_ALL); }, 60); });
    });
  }

    /* EdgeSketch.paint(svg): the contrast, wires-over-text and wires-run-together issues of any figure, as
     {msg, box}; EdgeDiagram, EdgeSequence, EdgeTimeline and EdgeMatrix add them to their own check when this file is on the page */
  function paint(svg, name) {
    name = name || (svg.id ? '#' + svg.id : 'svg');
    return paintIssues(svg).map(function (i) { return {msg: name + ': ' + i.msg, box: i.box}; });
  }

  global.EdgeSketch = {create: create, check: check, paint: paint, describe: function (svg) { return A11Y.text(describeSvg(svg)); }, wireShape: wireShape, checkAll: checkAll, report: report, version: VERSION};
})(window);
