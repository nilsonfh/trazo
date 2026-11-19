/* EdgeSketch v1.1.0 — helpers for SVG figures drawn by hand, and a layout check for any SVG.
 *
 *   var s = EdgeSketch.create(svg, {icons: window.EDGE_ICONS});
 *   s.zone(0, 0, 400, 300, {label: 'SERVICE'});
 *   s.box(20, 40, 180, 52, {icon: 'server', title: 'API', sub: 'validates · enqueues', tone: 'accent', info: '...'});
 *   s.box(220, 40, 52, 220, {icon: 'broker', title: 'Event stream', sub: 'one profile', vertical: true});
 *   s.arrow(200, 66, 218, 66, {tone: 'accent', heads: 'both', dashed: true});
 *   s.text(20, 290, 'every arrow is used both ways', {cls: 'tag'});
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
 *   - text partly on a box it does not belong to.
 * Hidden elements are skipped, and so is anything inside [data-check="false"]. Each issue is
 * outlined in red and returned as a string. With window.ED_DEBUG set, every figure made with
 * create() and every svg[data-check] is checked once the fonts have loaded, and with
 * window.ED_DEBUG_ALL every svg[role="img"] that is not an EdgeDiagram figure is checked too;
 * the issues go into the same hidden <pre id="ed-issues"> as EdgeDiagram's, which
 * scripts/shot.sh --check reads.
 *
 * Colours come from the theme's tokens (--ed-ink, --ed-accent, --ed-p3, ...), as in EdgeDiagram.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', VERSION = '1.1.0', UID = 0;
  var TONES = ['neutral', 'accent', 'add', 'gap', 'p3', 'muted', 'ink'];

  var CSS = [
    '.sk-root{--_ink:var(--ed-ink,#15201d);--_ink2:var(--ed-ink2,#3f4f4a);--_muted:var(--ed-muted,#5f6e68);',
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
    '.sk-box.t-ink .sk-frame{fill:var(--_ink);stroke:var(--_ink)}.sk-box.t-ink text,.sk-box.t-ink use{fill:var(--_surface);color:var(--_surface)}',
    '.sk-box.dashed .sk-frame{stroke-dasharray:5 3}',
    '.sk-box[tabindex]{cursor:help;outline:none}.sk-box[tabindex]:focus-visible .sk-frame{stroke-width:3}',
    '.sk-wire{fill:none;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}',
    '.sk-wire.dashed{stroke-dasharray:4 3}',
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
  // set a text's size so it fits `room`, between max and min
  function fit(t, room, max, min) {
    t.style.fontSize = max + 'px';
    var len = 0; try { len = t.getComputedTextLength(); } catch (e) { return; }
    if (len > room && len > 0) t.style.fontSize = Math.max(min, max * room / len).toFixed(2) + 'px';
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
       o: tone (default accent), heads ('end' default, 'both', 'start', 'none'), dashed, label, labelAt (0-1) */
    api.arrow = function (x1, y1, x2, y2, o) {
      var pts;
      if (Array.isArray(x1)) { pts = x1; o = y1; } else pts = [[x1, y1], [x2, y2]];
      o = o || {};
      var tone = o.tone || 'accent', heads = o.heads || 'end';
      var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ' ' + p[1]; }).join(' ');
      var p = el('path', {d: d, 'class': 'sk-wire t-' + tone + (o.dashed ? ' dashed' : '')}, layers.wires);
      if (heads === 'end' || heads === 'both') p.setAttribute('marker-end', marker(tone));
      if (heads === 'start' || heads === 'both') p.setAttribute('marker-start', marker(tone));
      if (o.label) {
        var a = pts[0], b = pts[pts.length - 1], k = o.labelAt != null ? o.labelAt : 0.5;
        api.text(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - 6, o.label, {cls: 'tag', anchor: 'middle', size: o.labelSize || 9.5});
      }
      return p;
    };
    function applyFit(f) { if (f[0]) fit(f[0], f[1], f[2], f[3]); else f[1](); }
    api.layout = function () { fits.forEach(applyFit); };
    api.check = function () { api.layout(); return check(svg); };
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

    var old = svg.querySelector('.sk-debug'); if (old) old.remove();
    if (out.length) {
      var g = el('g', {'class': 'sk-debug', 'aria-hidden': 'true'}, svg);
      out.forEach(function (i) { if (i.box) el('rect', {x: i.box.x - 2, y: i.box.y - 2, width: i.box.w + 4, height: i.box.h + 4, rx: 3}, g); });
      if (!document.getElementById('sk-css')) injectCSS();
    }
    return out.map(function (i) { return i.msg; });
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
      if (svg.classList.contains('ed-root') || svg.getAttribute('data-check') === 'false') return;
      report('sketch:' + (svg.id || i), check(svg));
    });
  }
  if (global.ED_DEBUG || global.ED_DEBUG_ALL) {
    global.addEventListener('load', function () {
      var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.then(function () { setTimeout(function () { checkAll(!!global.ED_DEBUG_ALL); }, 60); });
    });
  }

  global.EdgeSketch = {create: create, check: check, checkAll: checkAll, report: report, version: VERSION};
})(window);
