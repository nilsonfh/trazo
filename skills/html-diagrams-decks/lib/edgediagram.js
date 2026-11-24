/* EdgeDiagram v1.3.1 — declarative, animated SVG diagrams for single-file HTML pages and decks.
 *
 *   const d = EdgeDiagram.create(svg, {icons: SPRITE});
 *   d.zone('svc', {x, y, w, h, label: 'SERVICE'});
 *   d.node('api', {x, y, w, h, icon: 'server', title: 'API', sub: 'validates · enqueues', info: '...'});
 *   d.link('req', {from: ['web', 'auto'], to: ['api', 'auto'], route: 'ortho', arrow: 'end', flow: {dir: 1}});
 *   const ctl = d.steps([{show: ['api'], caption: '...'}, ...], {onStep});
 *   ctl.next(); ctl.prev(); ctl.go(3);
 *
 * A node without a title but with an icon is drawn as a centred symbol (grid equipment on a
 * one-line; {ghost: true, pad: true} gives it a background and no border). {ghost: true} alone
 * draws nothing and only gives links somewhere to attach. d.text() places a free label.
 * Tones: neutral, accent, add, gap, p3 (a further phase, dashed), ink; {dashed: true} dashes the outline.
 *
 * Connectors leave and enter perpendicular to their side. A side may be 'auto' (chosen from where
 * the other end is). Ends whose side or position is 'auto' are spread along their side, ordered
 * so they do not cross; an explicit side with no position is its middle, or, when the two nodes
 * face each other and the end is alone on its side, the point that makes the wire straight.
 * 'ortho' (the default) is an orthogonal route that leaves a short stub, goes around the nodes in
 * its way, avoids short jogs, and keeps its turns out of zones that hold neither end; 'straight' a
 * line; 'curve' a cubic Bézier. d.fan() feeds several nodes from one point (or gathers several
 * into one): a trunk, a bus at right angles and a branch to each, with a dot at every junction. Link labels move
 * along their wire until they clear the nodes and the other labels, on a plate the colour of
 * the zone beneath. Packets follow the drawn path, fade with their link, wait until the wire is
 * drawn, and stop when nothing flows or the figure is off screen.
 *
 * State machines and process figures: node shapes 'state' and 'task' (rounded boxes), 'initial' (a
 * dot), 'final' (a ringed dot), 'choice' and 'decision' (diamonds), 'start' and 'end' (event circles)
 * and 'composite' (a state holding others, with a title tab). Links meet a dot or a diamond at the
 * middle of a side. d.transition() is a link labelled 'event [guard] / action'; from === to is a
 * self-transition, a right-angle loop on a chosen side; two transitions that run opposite ways between
 * the same sides are kept apart, each label on its own side. d.lanes() draws horizontal or vertical
 * lanes with titles; a node with {lane} stays inside its lane, and each lane grows to its content.
 * Steps take {current: node} (a ring on the state the walk is in) and {fire: link} (the link drawn
 * thicker with a packet on it, for that step); d.walk([state, transition, state, ...]) makes them.
 * A node or zone without x and y is held, with every later call, until d.layout(opts): then
 * lib/edgelayout.js (EdgeLayout) places them all and they are drawn; steps, bindFocus and check
 * call it if it was left out.
 *
 * Hovering or focusing a node or a link with `info` highlights it with its neighbours and shows
 * a tooltip (a string, or {text, facts: [[k, v]], href, hrefText}); click or Enter pins it; a
 * click elsewhere or Escape releases it. Below 560 px the tooltip is a sheet at the bottom.
 *
 * {debug: true} or window.ED_DEBUG = 1 checks the figure at every step once fonts are loaded:
 * overlapping nodes, text outside its node, links through nodes, ortho links turning inside a
 * zone that holds neither end, slanted straight links, ortho links with a jog of a few pixels, link labels on nodes or on each other, zone labels under nodes, items outside the viewBox (or outside every step's view), a node outside its lane, a transition's label on another wire, text outside a diamond, a node on a composite's title tab. Icon-only symbols may sit on wires. Each issue is outlined in red, logged, and listed in a hidden
 * <pre id="ed-issues"> (scripts/shot.sh --check reads it). d.check() returns the list. An item
 * with {check: false} is left out; create(svg, {check: false}) leaves out a whole figure whose own
 * timeline swaps overlapping items.
 *
 * Needs GSAP 3 (window.gsap) for step animation. Without it, or with reduced motion, every
 * step jumps to its final state. Colours come from CSS custom properties, so the page's light
 * and dark tokens apply: --ed-ink, --ed-ink2, --ed-muted, --ed-surface, --ed-layer, --ed-rule,
 * --ed-accent, --ed-accent-soft, --ed-gap, --ed-gap-soft, --ed-add, --ed-add-soft, --ed-tip-bg,
 * --ed-tip-ink, and optionally --ed-p3, --ed-p3-soft (tone p3) and --ed-plate (label plates outside any zone).
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  /* ?static or ?static=K in the address, or window.TRAZO_STATIC = true | K before the library loads:
     no motion, and steps stay at step K (default: the last). scripts/visual.py renders pages so. */
  var still = (function (v, m) { if (v == null && m) v = m[1] == null ? true : +m[1];
    return v == null || v === false ? null : v === true ? 'end' : +v; })(global.TRAZO_STATIC, /[?&]static(?:=(\d+))?(?:&|$)/.exec(global.location ? global.location.search : ''));
  var reduce = still != null || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var UID = 0, REG = [], ISSUES = {}, VERSION = '1.3.1', FIRED = 3.6;   // a fired transition's width

  var CSS = [
    '.ed-root{--_ink:var(--ed-ink,#15201d);--_ink2:var(--ed-ink2,#3f4f4a);--_muted:var(--ed-muted,#66756f);',
    '--_surface:var(--ed-surface,#fff);--_layer:var(--ed-layer,#e9eeec);--_rule:var(--ed-rule,#d2dbd7);',
    '--_accent:var(--ed-accent,#2456a4);--_accent-soft:var(--ed-accent-soft,#e3ebf6);--_gap:var(--ed-gap,#b87d00);',
    '--_gap-soft:var(--ed-gap-soft,#fbf1d9);--_add:var(--ed-add,#0b8a0b);--_add-soft:var(--ed-add-soft,#e3f3e3);',
    '--_p3:var(--ed-p3,#6b46c1);--_p3-soft:var(--ed-p3-soft,#efe9fb);overflow:visible}',
    '.ed-root text{font-family:var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif)}',
    '.ed-title{font-family:var(--ed-display,"Archivo Narrow","Arial Narrow",sans-serif)!important;font-weight:600;fill:var(--_ink)}',
    '.ed-sub{fill:var(--_ink2)}',
    '.ed-zlabel{font-family:var(--ed-mono,"IBM Plex Mono",monospace)!important;letter-spacing:.09em;fill:var(--_muted)}',
    '.ed-node .ed-shape{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.2}',
    '.ed-node.t-accent .ed-shape{fill:var(--_accent-soft);stroke:var(--_accent);stroke-width:1.8}',
    '.ed-node.t-add .ed-shape{fill:var(--_add-soft);stroke:var(--_add);stroke-width:1.3}',
    '.ed-node.t-gap .ed-shape{fill:var(--_gap-soft);stroke:var(--_gap);stroke-width:1.3}',
    '.ed-node.t-p3 .ed-shape{fill:var(--_p3-soft);stroke:var(--_p3);stroke-width:1.3;stroke-dasharray:5 3}',
    '.ed-node.t-ink .ed-shape{fill:var(--_ink);stroke:var(--_ink)}.ed-node.t-ink .ed-title{fill:var(--_surface)}.ed-node.t-ink .ed-icon{color:var(--_surface)}',
    '.ed-node.dashed .ed-shape{stroke-dasharray:4 3}',
    '.ed-node .ed-pad{fill:var(--ed-pad,var(--_surface));stroke:none}',
    '.ed-text{fill:var(--_ink2)}.ed-text.mono{font-family:var(--ed-mono,"IBM Plex Mono",monospace)!important;letter-spacing:.06em;fill:var(--_muted)}',
    '.ed-node .ed-icon{color:var(--_ink)}.ed-node.t-accent .ed-icon{color:var(--_accent)}.ed-node.t-add .ed-icon{color:var(--_add)}.ed-node.t-gap .ed-icon{color:var(--_gap)}.ed-node.t-p3 .ed-icon{color:var(--_p3)}',
    '.ed-node[tabindex],.ed-link[tabindex]{cursor:pointer;outline:none}',
    '.ed-node[tabindex]:focus-visible .ed-shape{stroke-width:3}',
    '.ed-link[tabindex]:focus-visible path.ed-wire{stroke-width:4}',
    '.ed-zone .ed-zshape{fill:var(--_layer);stroke:var(--_rule)}',
    '.ed-zone.t-gap .ed-zshape{fill:var(--_gap-soft);stroke:var(--_gap);stroke-width:1.6;stroke-dasharray:8 6}',
    '.ed-zone.t-gap .ed-zlabel{fill:var(--_gap)}',
    '.ed-link path.ed-wire{fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.ed-link.t-accent path.ed-wire{stroke:var(--_accent)}.ed-link.t-muted path.ed-wire{stroke:var(--_muted);stroke-width:1.4}',
    '.ed-link.t-gap path.ed-wire{stroke:var(--_gap)}.ed-link.t-add path.ed-wire{stroke:var(--_add)}',
    '.ed-link.t-ink2 path.ed-wire{stroke:var(--_ink2)}.ed-link.t-p3 path.ed-wire{stroke:var(--_p3);stroke-dasharray:5 4}',
    '.ed-link.dashed path.ed-wire{stroke-dasharray:3 5}',
    '.ed-link .ed-hit{fill:none;stroke:transparent;stroke-width:14}',
    '.ed-llabel{font-size:11.5px;fill:var(--_ink2)}',
    '.ed-llabel-bg{fill:var(--ed-plate,var(--_surface))}.ed-llabel-bg.on-layer{fill:var(--_layer)}.ed-llabel-bg.on-gap{fill:var(--_gap-soft)}',
    '.ed-dot{stroke:none}',
    '.ed-pkt.t-accent{fill:var(--_accent)}.ed-pkt.t-gap{fill:var(--_gap)}.ed-pkt.t-add{fill:var(--_add)}.ed-pkt.t-muted{fill:var(--_muted)}.ed-pkt.t-ink2{fill:var(--_ink2)}.ed-pkt.t-p3{fill:var(--_p3)}',
    '.ed-arrow.t-accent{fill:var(--_accent)}.ed-arrow.t-muted{fill:var(--_muted)}.ed-arrow.t-gap{fill:var(--_gap)}.ed-arrow.t-add{fill:var(--_add)}.ed-arrow.t-ink2{fill:var(--_ink2)}.ed-arrow.t-p3{fill:var(--_p3)}',
    '.ed-root.ed-focusing .ed-item:not(.ed-hot)>*{opacity:.18;transition:opacity .15s}',
    '.ed-root.ed-focusing .ed-link.ed-hot path.ed-wire{stroke-width:3}',
    '.ed-tip{position:fixed;z-index:1000;max-width:min(300px,calc(100vw - 16px));pointer-events:none;background:var(--ed-tip-bg,#15201d);color:var(--ed-tip-ink,#f3f6f4);',
    'font:13px/1.45 var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);padding:9px 12px;border-radius:6px;box-shadow:0 8px 24px -12px rgba(0,0,0,.5)}',
    '.ed-tip b{display:block;font-weight:600;margin-bottom:2px}.ed-tip span{display:block}',
    '.ed-tip dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:6px 0 0;font-size:12px}',
    '.ed-tip dt{opacity:.72}.ed-tip dd{margin:0;font-variant-numeric:tabular-nums}',
    '.ed-tip a{color:inherit;display:inline-block;margin-top:6px}',
    '.ed-tip.pinned{pointer-events:auto;outline:2px solid var(--ed-accent,#2456a4)}',
    '.ed-tip.sheet{left:8px!important;right:8px;top:auto!important;bottom:calc(8px + env(safe-area-inset-bottom,0px));max-width:none}',
    '.ed-node.s-initial .ed-shape,.ed-node .ed-core{fill:var(--_ink);stroke:var(--_ink)}',
    '.ed-node.s-final .ed-shape{fill:var(--_surface);stroke:var(--_ink);stroke-width:1.6}',
    '.ed-node.s-start .ed-shape{stroke-width:1.8}.ed-node.s-end .ed-shape{stroke-width:3.6}',
    '.ed-node.s-composite.t-neutral>.ed-shape{fill:var(--_layer)}',
    '.ed-node .ed-tab{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.2}.ed-node.t-accent .ed-tab{stroke:var(--_accent)}',
    '.ed-halo{fill:none;stroke:var(--_accent);stroke-width:2.8;opacity:0;pointer-events:none}',
    '.ed-llabel .ed-tguard{fill:var(--_muted)}.ed-llabel .ed-tact{font-style:italic}',
    '.ed-llabel-bg.on-accent{fill:var(--_accent-soft)}.ed-llabel-bg.on-add{fill:var(--_add-soft)}.ed-llabel-bg.on-p3{fill:var(--_p3-soft)}',
    '.ed-lane .ed-lhead{fill:var(--_surface);stroke:var(--_rule)}.ed-lane .ed-ltitle{font-size:15px}',
    '.ed-debug rect{fill:none;stroke:#e0102f;stroke-width:2;stroke-dasharray:5 3}',
    '@media (forced-colors:active){.ed-node .ed-shape,.ed-zone .ed-zshape,.ed-link path.ed-wire{stroke:CanvasText}',
    '.ed-pkt,.ed-arrow{fill:Highlight}.ed-tip{border:1px solid CanvasText}}'
  ].join('');

  function el(tag, attrs, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function injectCSS() {
    if (document.getElementById('ed-css')) return;
    var s = document.createElement('style'); s.id = 'ed-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function injectIcons(sprite) {
    if (!sprite || document.getElementById('ed-icons')) return;
    var host = document.createElementNS(NS, 'svg');
    host.id = 'ed-icons'; host.setAttribute('aria-hidden', 'true');
    host.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
    host.innerHTML = '<defs>' + sprite + '</defs>';
    document.body.insertBefore(host, document.body.firstChild);
  }
  /* one set of document listeners for every diagram on the page */
  var installed = false;
  function install() {
    if (installed) return; installed = true;
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') clearAll(); });
    document.addEventListener('click', function () { clearAll(); });
    var re = function () { REG.forEach(function (r) { r.reposition(); }); };
    global.addEventListener('scroll', re, true); global.addEventListener('resize', re);
    document.addEventListener('visibilitychange', function () { REG.forEach(function (r) { r.wake(); }); });
  }
  function clearAll() { REG.forEach(function (r) { r.clear(); }); }
  function infoText(info) { return typeof info === 'string' ? info : (info && info.text) || ''; }

  /* ---------- geometry ---------- */
  var NORMAL = {top: [0, -1], bottom: [0, 1], left: [-1, 0], right: [1, 0]};
  function anchor(n, side, t) {
    t = t == null ? 0.5 : t;
    if (side === 'top') return [n.x + n.w * t, n.y];
    if (side === 'bottom') return [n.x + n.w * t, n.y + n.h];
    if (side === 'left') return [n.x, n.y + n.h * t];
    return [n.x + n.w, n.y + n.h * t];
  }
  function inter(a, b, pad) { pad = pad || 0; return a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad; }
  function contains(a, b) { return b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5; }
  function rectOf(n) { return {x: n.x, y: n.y, w: n.w, h: n.h}; }
  function roundedPolyline(pts, r) {   // r: a radius, or a function of the corner's point
    var d = 'M' + pts[0][0] + ' ' + pts[0][1];
    for (var i = 1; i < pts.length - 1; i++) {
      var p = pts[i - 1], c = pts[i], n = pts[i + 1];
      var l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(n[0] - c[0], n[1] - c[1]);
      var rr = Math.min(typeof r === 'function' ? r(c) : r, l1 / 2, l2 / 2);
      if (!(rr > 0.01)) { d += ' L' + c[0] + ' ' + c[1]; continue; }
      var a = [c[0] - (c[0] - p[0]) / l1 * rr, c[1] - (c[1] - p[1]) / l1 * rr];
      var b = [c[0] + (n[0] - c[0]) / l2 * rr, c[1] + (n[1] - c[1]) / l2 * rr];
      d += ' L' + a[0] + ' ' + a[1] + ' Q' + c[0] + ' ' + c[1] + ' ' + b[0] + ' ' + b[1];
    }
    var last = pts[pts.length - 1];
    return d + ' L' + last[0] + ' ' + last[1];
  }
  function same(a, b) { return Math.abs(a - b) < 0.01; }
  /* drop repeated points and the middle of straight runs */
  function simplify(pts) {
    var out = [];
    pts.forEach(function (p) { var l = out[out.length - 1]; if (!l || !same(l[0], p[0]) || !same(l[1], p[1])) out.push(p); });
    for (var i = out.length - 2; i > 0; i--) {
      var a = out[i - 1], b = out[i], c = out[i + 1];
      if ((same(a[0], b[0]) && same(b[0], c[0])) || (same(a[1], b[1]) && same(b[1], c[1]))) out.splice(i, 1);
    }
    return out;
  }
  function segHit(p, q, r) {   // an axis-aligned segment through the inside of r
    return Math.max(p[0], q[0]) > r.x && Math.min(p[0], q[0]) < r.x + r.w &&
           Math.max(p[1], q[1]) > r.y && Math.min(p[1], q[1]) < r.y + r.h;
  }
  function firstDir(list) {
    for (var i = 0; i < list.length - 1; i++) {
      var dx = list[i + 1][0] - list[i][0], dy = list[i + 1][1] - list[i][1];
      if (Math.abs(dx) + Math.abs(dy) > 0.01) return [Math.sign(dx), Math.sign(dy)];
    }
    return null;
  }
  /* Orthogonal route: a stub out of each side, then the cheapest of a set of one-, two- and
   * (when those hit something) three-bend candidates through the channels beside the obstacles.
   * Cost: obstacles crossed, then a turn back over a stub, then running along or across another
   * wire, then bends, then length. */
  function overlap(p, q, u, v) {   // length two axis-aligned segments share within 3 px
    if (same(p[1], q[1]) && same(u[1], v[1]) && Math.abs(p[1] - u[1]) < 3)
      return Math.min(Math.max(p[0], q[0]), Math.max(u[0], v[0])) - Math.max(Math.min(p[0], q[0]), Math.min(u[0], v[0]));
    if (same(p[0], q[0]) && same(u[0], v[0]) && Math.abs(p[0] - u[0]) < 3)
      return Math.min(Math.max(p[1], q[1]), Math.max(u[1], v[1])) - Math.max(Math.min(p[1], q[1]), Math.min(u[1], v[1]));
    return 0;
  }
  function crosses(p, q, u, v) {   // two segments cross at a point inside both
    var d = (q[0] - p[0]) * (v[1] - u[1]) - (q[1] - p[1]) * (v[0] - u[0]);
    if (Math.abs(d) < 1e-9) return false;
    var t = ((u[0] - p[0]) * (v[1] - u[1]) - (u[1] - p[1]) * (v[0] - u[0])) / d;
    var w = ((u[0] - p[0]) * (q[1] - p[1]) - (u[1] - p[1]) * (q[0] - p[0])) / d;
    return t > 0.01 && t < 0.99 && w > 0.01 && w < 0.99;
  }
  function inside(p, r) { return p[0] > r.x + 2 && p[0] < r.x + r.w - 2 && p[1] > r.y + 2 && p[1] < r.y + r.h - 2; }
  function runInside(p, q, r) {   // length of an axis-aligned segment inside r
    if (same(p[1], q[1])) return (p[1] > r.y && p[1] < r.y + r.h) ? Math.max(0, Math.min(Math.max(p[0], q[0]), r.x + r.w) - Math.max(Math.min(p[0], q[0]), r.x)) : 0;
    return (p[0] > r.x && p[0] < r.x + r.w) ? Math.max(0, Math.min(Math.max(p[1], q[1]), r.y + r.h) - Math.max(Math.min(p[1], q[1]), r.y)) : 0;
  }
  function orthoPoints(p0, s0, p1, s1, opts, obstacles, others, foreign, bounds) {
    var n0 = NORMAL[s0], n1 = NORMAL[s1];
    var stub = opts.stub != null ? opts.stub : 16, m = opts.clearance != null ? opts.clearance : 8;
    var a = [p0[0] + n0[0] * stub, p0[1] + n0[1] * stub], b = [p1[0] + n1[0] * stub, p1[1] + n1[1] * stub];
    var obs = (obstacles || []).map(function (r) { return {x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m, own: r.own}; });
    var best = null;
    function consider(mid) {
      var pts = [p0, a].concat(mid, [b, p1]), hits = 0, len = 0, rev = 0;
      for (var i = 0; i < pts.length - 1; i++) {
        var p = pts[i], q = pts[i + 1];
        len += Math.abs(q[0] - p[0]) + Math.abs(q[1] - p[1]);
        for (var j = 0; j < obs.length; j++) {
          var r = obs[j];
          if ((i === 0 && r.own === 0) || (i === pts.length - 2 && r.own === 1)) continue;   // the stubs leave their own node
          if (segHit(p, q, r)) hits++;
        }
      }
      var inner = [a].concat(mid, [b]), f = firstDir(inner), l = firstDir(inner.slice().reverse());
      if (f && f[0] * n0[0] + f[1] * n0[1] < 0) rev++;
      if (l && l[0] * n1[0] + l[1] * n1[1] < 0) rev++;
      var s = simplify(pts), shared = 0;
      for (var k = 0; k < s.length - 1; k++) for (var o = 0; o < (others || []).length; o++) {
        var ov = overlap(s[k], s[k + 1], others[o][0], others[o][1]);
        if (ov > 4) shared += 300 + ov;
        else if (crosses(s[k], s[k + 1], others[o][0], others[o][1])) shared += 250;   // crossing another wire
      }
      for (var w0 = 1; w0 < s.length - 1; w0++) for (var o2 = 0; o2 < (others || []).length; o2++) {   // a turn on another wire hides a crossing
        var u0 = others[o2][0], u1 = others[o2][1];
        if (Math.abs((u1[0] - u0[0]) * (s[w0][1] - u0[1]) - (u1[1] - u0[1]) * (s[w0][0] - u0[0])) < 1 * Math.hypot(u1[0] - u0[0], u1[1] - u0[1]) &&
            s[w0][0] >= Math.min(u0[0], u1[0]) - 1 && s[w0][0] <= Math.max(u0[0], u1[0]) + 1 && s[w0][1] >= Math.min(u0[1], u1[1]) - 1 && s[w0][1] <= Math.max(u0[1], u1[1]) + 1) shared += 250;
      }
      // a turn inside a zone that holds neither end reads as belonging to it; crossing one is fine
      // and running through one costs by the length run inside it
      var stray = 0, through = 0, out = 0;
      for (var z = 0; z < (foreign || []).length; z++) {
        for (var w = 1; w < s.length - 1; w++) if (inside(s[w], foreign[z])) stray++;
        for (var v = 0; v < s.length - 1; v++) through += runInside(s[v], s[v + 1], foreign[z]);
      }
      if (bounds) s.forEach(function (q) {   // never outside the figure
        if (q[0] < bounds.x || q[0] > bounds.x + bounds.w || q[1] < bounds.y || q[1] > bounds.y + bounds.h) out++;
      });
      var jog = 0;   // a short run between two turns reads as a mistake, not a route
      for (var g = 1; g < s.length - 2; g++) {
        var jl = Math.abs(s[g + 1][0] - s[g][0]) + Math.abs(s[g + 1][1] - s[g][1]);
        if (jl < 2 * (opts.radius || 14)) jog += 2 * (opts.radius || 14) - jl;
      }
      var cost = hits * 10000 + out * 5000 + rev * 600 + stray * 400 + through * 0.8 + shared + jog * 3 + (s.length - 2) * 40 + len;
      if (!best || cost < best.cost - 0.01) best = {pts: s, cost: cost};
    }
    var xs = [(a[0] + b[0]) / 2, a[0], b[0]], ys = [(a[1] + b[1]) / 2, a[1], b[1]];
    obs.forEach(function (r) { xs.push(r.x - 2, r.x + r.w + 2); ys.push(r.y - 2, r.y + r.h + 2); });
    (foreign || []).forEach(function (z) { xs.push(z.x - 12, z.x + z.w + 12); ys.push(z.y - 12, z.y + z.h + 12); });
    (others || []).forEach(function (g) {   // the lanes either side of another ortho wire
      if (same(g[0][1], g[1][1])) ys.push(g[0][1] - 12, g[0][1] + 12); else if (same(g[0][0], g[1][0])) xs.push(g[0][0] - 12, g[0][0] + 12);
    });
    if (same(a[0], b[0]) || same(a[1], b[1])) consider([]);
    consider([[a[0], ys[0]], [b[0], ys[0]]]);
    consider([[xs[0], a[1]], [xs[0], b[1]]]);
    consider([[a[0], b[1]]]); consider([[b[0], a[1]]]);
    xs.forEach(function (x) { consider([[x, a[1]], [x, b[1]]]); });
    ys.forEach(function (y) { consider([[a[0], y], [b[0], y]]); });
    if (best.cost >= 300) {
      xs.forEach(function (x) { ys.forEach(function (y) {
        consider([[x, a[1]], [x, y], [b[0], y]]);
        consider([[a[0], y], [x, y], [x, b[1]]]);
      }); });
    }
    return best.pts;
  }
  function route(p0, s0, p1, s1, kind, opts, obstacles) {
    opts = opts || {};
    var n0 = NORMAL[s0], n1 = NORMAL[s1];
    kind = kind || 'ortho';
    if (kind === 'straight') return 'M' + p0[0] + ' ' + p0[1] + ' L' + p1[0] + ' ' + p1[1];
    if (kind !== 'straight' && kind !== 'curve') return roundedPolyline(orthoPoints(p0, s0, p1, s1, opts, obstacles), opts.radius || 14);
    var dist = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
    var k = Math.max(28, dist * (opts.tension || 0.45));
    return 'M' + p0[0] + ' ' + p0[1] + ' C' + (p0[0] + n0[0] * k) + ' ' + (p0[1] + n0[1] * k) + ' ' +
      (p1[0] + n1[0] * k) + ' ' + (p1[1] + n1[1] * k) + ' ' + p1[0] + ' ' + p1[1];
  }
  function autoSide(n, other) {
    var dx = (other.x + other.w / 2) - (n.x + n.w / 2), dy = (other.y + other.h / 2) - (n.y + n.h / 2);
    if (Math.abs(dx) / (n.w + other.w) > Math.abs(dy) / (n.h + other.h)) return dx > 0 ? 'right' : 'left';
    return dy > 0 ? 'bottom' : 'top';
  }
  function wrapLines(text, max) {
    if (Array.isArray(text)) return text;
    var out = [], cur = '';
    String(text).split(/\s+/).forEach(function (w) {
      if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) out.push(cur);
    return out;
  }
  function bboxOf(e) { try { var b = e.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; } catch (x) { return null; } }

  /* ---------- diagram ---------- */
  function create(svg, options) {
    options = options || {};
    injectCSS(); injectIcons(options.icons); install();
    var self = ++UID, debug = !!(options.debug || global.ED_DEBUG);
    svg.classList.add('ed-root');
    var vbv = svg.viewBox && svg.viewBox.baseVal;
    var vb = vbv && vbv.width ? {x: vbv.x, y: vbv.y, w: vbv.width, h: vbv.height} : null;
    var defs = el('defs', {}, svg);
    // packets pass under the label plates, and both under the nodes a wire ends on
    var layers = {zones: el('g', {}, svg), links: el('g', {}, svg)};
    layers.pkts = el('g', {}, svg); layers.labels = el('g', {}, svg); layers.nodes = el('g', {}, svg);
    var items = {}, nodes = {}, links = {}, zones = [], flows = [], stepSets = null, dirty = false;
    ['accent', 'muted', 'gap', 'add', 'ink2', 'p3'].forEach(function (t) {
      var m = el('marker', {id: 'ed-arrow-' + t + '-' + (svg.id || 'd'), viewBox: '0 0 10 10', refX: 8.5, refY: 5,
        markerWidth: 9, markerHeight: 9, orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse'}, defs);
      el('path', {d: 'M0 1 L9 5 L0 9 Z', 'class': 'ed-arrow t-' + t}, m);
    });

    var api = {svg: svg, items: items};
    /* A node (or zone) without x or y holds it and every later zone, node, text, link and fan call
       until d.layout(opts) hands them to EdgeLayout (lib/edgelayout.js), which fills in the
       positions and sides; then they are drawn in the order given. steps, bindFocus and check call it. */
    var held = null;
    function hold(kind, id, o) {
      if (!held && !((kind === 'node' || kind === 'zone') && !o.lane && (o.x == null || o.y == null))) return false;   // a node in a lane is placed by its lane
      (held = held || []).push({kind: kind, id: id, o: o}); return true;
    }

    api.zone = function (id, o) {
      if (hold('zone', id, o)) return api;
      var g = el('g', {'class': 'ed-item ed-zone t-' + (o.tone || 'layer'), 'data-id': id}, layers.zones);
      el('rect', {'class': 'ed-zshape', x: o.x, y: o.y, width: o.w, height: o.h, rx: o.r || 12}, g);
      if (o.label) {
        var pos = o.labelPos || 'top-left', size = o.labelSize || 11;
        var lx = pos.indexOf('center') >= 0 ? o.x + o.w / 2 : o.x + 18;
        var ly = pos.indexOf('bottom') >= 0 ? o.y + o.h - 12 : o.y + 24;
        var lg = el('g', {'class': 'ed-item', 'data-id': id + '.label'}, g);
        el('text', {'class': 'ed-zlabel', x: lx, y: ly, 'font-size': size, 'text-anchor': pos.indexOf('center') >= 0 ? 'middle' : 'start'}, lg, o.label);
        items[id + '.label'] = {el: lg, kind: 'label'};
      }
      items[id] = {el: g, kind: 'zone', o: o};
      zones.push({id: id, x: o.x, y: o.y, w: o.w, h: o.h, tone: o.tone || 'layer'});
      return api;
    };

    function focusable(g, name, info) {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'button');
      g.setAttribute('aria-label', name + '. ' + infoText(info));
    }
    api.node = function (id, o) {
      if (hold('node', id, o)) return api;
      if (o.lane && !o._laned) return laneNode(id, o);
      if (POINT[o.shape] || o.shape === 'composite') return shapeNode(id, o);
      if (o.shape === 'state' || o.shape === 'task')   // a rounded box, its text centred
        o = Object.assign({align: 'center'}, o, {r: o.r != null ? o.r : (o.shape === 'state' ? 18 : 12)});
      var g = el('g', {'class': 'ed-item ed-node t-' + (o.tone || 'neutral') + (o.dashed ? ' dashed' : '') + (o.shape ? ' s-' + o.shape : ''), 'data-id': id}, layers.nodes);
      if (o.shape) g.setAttribute('data-shape', o.shape);
      var pill = o.shape === 'pill';
      if (Object.keys(links).length) dirty = true;   // links drawn before this node did not know it
      // o.ghost: no shape, only a place for links to attach (a source point, a label anchor)
      if (o.pad) el('rect', {'class': 'ed-pad', x: o.x, y: o.y, width: o.w, height: o.h, rx: 6}, g);   // hides the wire behind a symbol
      if (!o.ghost) el('rect', {'class': 'ed-shape', x: o.x, y: o.y, width: o.w, height: o.h, rx: pill ? o.h / 2 : (o.r != null ? o.r : 10)}, g);
      if (!o.title && o.icon) {   // an icon-only node: a grid symbol on its pad
        var isz = o.iconSize || Math.min(o.w, o.h) - 8;
        el('use', {href: '#i-' + o.icon, x: o.x + (o.w - isz) / 2, y: o.y + (o.h - isz) / 2, width: isz, height: isz, 'class': 'ed-icon'}, g);
        if (o.info) focusable(g, o.label || o.icon, o.info);
        nodes[id] = {x: o.x, y: o.y, w: o.w, h: o.h, o: Object.assign({}, o, {title: o.label || ''}), el: g, links: [], ports: {}};
        items[id] = {el: g, kind: 'node', o: o};
        return api;
      }
      if (o.ghost) {
        nodes[id] = {x: o.x, y: o.y, w: o.w, h: o.h, o: o, el: g, links: [], ports: {}};
        items[id] = {el: g, kind: 'node', o: o};
        return api;
      }
      var is = o.iconSize || (pill ? 18 : Math.min(34, o.h * 0.42));
      var hasIcon = !!o.icon, tx, anchorText;
      var sub = o.sub ? wrapLines(o.sub, o.subWrap || 44) : [];
      var ts = o.titleSize || (pill ? 13 : 17), ss = o.subSize || 12;
      var block = ts + sub.length * (ss + 5);
      var ty = o.textY != null ? o.textY : o.y + (o.h - block) / 2 + ts * 0.85;
      if ((pill && o.align !== 'center') || o.align === 'left' || (hasIcon && o.align !== 'center')) {
        if (hasIcon) el('use', {href: '#i-' + o.icon, x: o.x + (pill ? 12 : 14), y: (!pill && o.textY != null) ? ty - ts * 0.85 - 2 : o.y + (o.h - is) / 2, width: is, height: is, 'class': 'ed-icon'}, g);  // with an explicit text line, the icon aligns with the title
        tx = o.x + (hasIcon ? (pill ? 12 : 14) + is + (pill ? 8 : 12) : 16); anchorText = 'start';
      } else {
        if (hasIcon) el('use', {href: '#i-' + o.icon, x: o.x + 14, y: o.y + 12, width: is, height: is, 'class': 'ed-icon'}, g);
        tx = o.x + o.w / 2; anchorText = 'middle';
      }
      el('text', {'class': 'ed-title', x: tx, y: ty, 'font-size': ts, 'text-anchor': anchorText,
        style: pill ? 'font-family:var(--ed-sans,"IBM Plex Sans",sans-serif)!important;font-weight:600' : null}, g, o.title);
      sub.forEach(function (line, i) {
        el('text', {'class': 'ed-sub', x: tx, y: ty + (i + 1) * (ss + 5), 'font-size': ss, 'text-anchor': anchorText}, g, line);
      });
      if (o.info) focusable(g, o.title, o.info);
      nodes[id] = {x: o.x, y: o.y, w: o.w, h: o.h, o: o, el: g, links: [], ports: {}};
      items[id] = {el: g, kind: 'node', o: o};
      return api;
    };

    /* ---------- state machines and processes: a dot, a ringed dot, a diamond or a circle, which links
       meet at the middle of a side, and a composite state with a title tab ---------- */
    var POINT = {initial: 1, final: 1, choice: 1, decision: 1, start: 1, end: 1}, tabs = [];
    function shapeNode(id, o) {
      var s = o.shape, g = el('g', {'class': 'ed-item ed-node t-' + (o.tone || 'neutral') + ' s-' + s + (o.dashed ? ' dashed' : ''), 'data-id': id, 'data-shape': s}, layers.nodes);
      if (Object.keys(links).length) dirty = true;
      var cx = o.x + o.w / 2, cy = o.y + o.h / 2, R = Math.min(o.w, o.h) / 2, below = 0;
      var n = {x: o.x, y: o.y, w: o.w, h: o.h, o: o, el: g, links: [], ports: {}, point: !!POINT[s], shape: s};
      g.setAttribute('data-box', [o.x, o.y, o.w, o.h].join(' '));   // the box links attach to, for the draw.io export
      if (s === 'choice' || s === 'decision') el('polygon', {'class': 'ed-shape', points: [cx, o.y, o.x + o.w, cy, cx, o.y + o.h, o.x, cy].join(' ')}, g);
      else if (s === 'composite') {
        var r = o.r != null ? o.r : 14;
        el('rect', {'class': 'ed-shape', x: o.x, y: o.y, width: o.w, height: o.h, rx: r}, g);
        var tab = el('path', {'class': 'ed-tab'}, g);
        var tt = el('text', {'class': 'ed-title', x: o.x + 14, y: o.y + 19, 'font-size': o.titleSize || 13}, g, o.title || '');
        n.retab = function () {   // the tab fits its title, in the composite's top-left corner
          var w = Math.max(48, ((bboxOf(tt) || {w: 0}).w || 0) + 28), x = n.x, y = n.y, h = 28;
          tab.setAttribute('d', 'M' + x + ' ' + (y + h) + ' V' + (y + r) + ' Q' + x + ' ' + y + ' ' + (x + r) + ' ' + y + ' H' + (x + w) +
            ' V' + (y + h - 8) + ' Q' + (x + w) + ' ' + (y + h) + ' ' + (x + w - 8) + ' ' + (y + h) + ' Z');
          n.tab = {x: x, y: y, w: w, h: h};
        };
        n.retab(); tabs.push(n);
      } else {
        el('circle', {'class': 'ed-shape', cx: cx, cy: cy, r: R - (s === 'end' ? 1.8 : s === 'initial' ? 0 : 1)}, g);
        if (s === 'final') el('circle', {'class': 'ed-core', cx: cx, cy: cy, r: R * 0.52}, g);
      }
      if (s === 'decision' && o.title) {   // its text inside the diamond
        var sub = o.sub ? wrapLines(o.sub, o.subWrap || 20) : [], ts = o.titleSize || 13, ss = o.subSize || 11;
        var ty = cy - (ts + sub.length * (ss + 4)) / 2 + ts * 0.85;
        el('text', {'class': 'ed-title', x: cx, y: ty, 'font-size': ts, 'text-anchor': 'middle'}, g, o.title);
        sub.forEach(function (line, i) { el('text', {'class': 'ed-sub', x: cx, y: ty + (i + 1) * (ss + 4), 'font-size': ss, 'text-anchor': 'middle'}, g, line); });
      } else if (s !== 'composite' && o.title) {   // a point's name, below it
        el('text', {'class': 'ed-sub ed-outside', x: cx, y: o.y + o.h + 16, 'font-size': o.titleSize || 12, 'text-anchor': 'middle'}, g, o.title);
        below = 20;
      }
      n.below = below;
      if (o.info) focusable(g, o.title || o.label || s, o.info);
      nodes[id] = n;
      items[id] = {el: g, kind: 'node', o: o};
      return api;
    }
    /* a ring around a node, for the state a walk is in (steps {current}) */
    function haloOf(n) {
      if (n.halo) return n.halo;
      var p = 5, sh = n.el.querySelector('.ed-shape'), h;
      if (n.shape === 'choice' || n.shape === 'decision') {
        var cx = n.x + n.w / 2, cy = n.y + n.h / 2, k = p * 1.5;
        h = el('polygon', {points: [cx, n.y - k, n.x + n.w + k, cy, cx, n.y + n.h + k, n.x - k, cy].join(' ')});
      } else if (sh && sh.tagName === 'circle') h = el('circle', {cx: n.x + n.w / 2, cy: n.y + n.h / 2, r: +sh.getAttribute('r') + p});
      else h = el('rect', {x: n.x - p, y: n.y - p, width: n.w + 2 * p, height: n.h + 2 * p, rx: (sh ? +sh.getAttribute('rx') || 0 : 10) + p});
      h.setAttribute('class', 'ed-halo');
      n.el.insertBefore(h, n.el.firstChild);
      return (n.halo = h);
    }
    /* move a drawn node: every coordinate of what it drew, and its tab */
    function shiftNode(n, dx, dy) {
      n.x += dx; n.y += dy;
      [].forEach.call(n.el.querySelectorAll('*'), function (e) {
        ['x', 'cx'].forEach(function (a) { if (e.hasAttribute(a)) e.setAttribute(a, +e.getAttribute(a) + dx); });
        ['y', 'cy'].forEach(function (a) { if (e.hasAttribute(a)) e.setAttribute(a, +e.getAttribute(a) + dy); });
        if (e.hasAttribute('points')) e.setAttribute('points', e.getAttribute('points').trim().split(/[\s,]+/).map(function (v, i) { return +v + (i % 2 ? dy : dx); }).join(' '));
      });
      if (n.retab) n.retab();
      if (n.el.hasAttribute('data-box')) n.el.setAttribute('data-box', [n.x, n.y, n.w, n.h].join(' '));
      if (Object.keys(links).length) { dirty = true; respread = true; }
    }

    /* ---------- lanes: rows (or columns) for actors or planes. A node given {lane} stays inside its
       lane, and every lane grows to hold its nodes; the view follows the lanes ---------- */
    var laneSets = [], laneOf = {}, respread = false;
    api.lanes = function (id, o) {
      var hz = (o.dir || 'horizontal').charAt(0) !== 'v';
      var LS = {id: id, o: o, hz: hz, head: o.head != null ? o.head : (hz ? 130 : 48), min: o.min || (hz ? 100 : 170), pad: o.pad != null ? o.pad : 22, lanes: []};
      LS.g = el('g', {'class': 'ed-item ed-lanes', 'data-id': id}, layers.zones);
      items[id] = {el: LS.g, kind: 'zone', o: o};
      o.lanes.forEach(function (lo) {
        if (items[lo.id]) throw new Error('EdgeDiagram: lane ' + lo.id + ' reuses an id');
        var g = el('g', {'class': 'ed-item ed-zone ed-lane t-layer', 'data-id': lo.id, 'data-lane': hz ? 'h' : 'v', 'data-head': LS.head}, LS.g);
        var ln = {id: lo.id, o: lo, g: g, members: [], band: el('rect', {'class': 'ed-zshape'}, g), head: el('rect', {'class': 'ed-lhead'}, g)};
        var lg = el('g', {'class': 'ed-item', 'data-id': lo.id + '.label'}, g);
        ln.tt = el('text', {'class': 'ed-title ed-ltitle', 'text-anchor': hz ? 'start' : 'middle'}, lg, lo.title || '');
        if (lo.sub) ln.st = el('text', {'class': 'ed-sub', 'font-size': 12, 'text-anchor': hz ? 'start' : 'middle'}, lg, lo.sub);
        items[lo.id] = {el: g, kind: 'zone', o: lo}; items[lo.id + '.label'] = {el: lg, kind: 'label'};
        ln.z = {id: lo.id, x: 0, y: 0, w: 0, h: 0, tone: 'layer'}; zones.push(ln.z);
        LS.lanes.push(ln); laneOf[lo.id] = {set: LS, lane: ln};
      });
      laneSets.push(LS); fitLanes(LS);
      return api;
    };
    function extent(n, hz) { return hz ? n.h + (n.below || 0) : n.w; }
    function fitLanes(LS) {
      var o = LS.o, hz = LS.hz, pos = hz ? o.y : o.x;
      LS.lanes.forEach(function (ln) {
        var need = ln.o.size || LS.min;
        ln.members.forEach(function (id) {
          var n = nodes[id], e = extent(n, hz);
          need = Math.max(need, n.rel != null ? n.rel + e + LS.pad : e + 2 * LS.pad);
        });
        ln.at = pos; ln.size = need; pos += need;
      });
      LS.lanes.forEach(function (ln) {
        var x = hz ? o.x : ln.at, y = hz ? ln.at : o.y, w = hz ? o.w : ln.size, h = hz ? ln.size : o.h;
        [['x', x], ['y', y], ['width', w], ['height', h]].forEach(function (a) { ln.band.setAttribute(a[0], a[1]); });
        [['x', x], ['y', y], ['width', hz ? LS.head : w], ['height', hz ? h : LS.head]].forEach(function (a) { ln.head.setAttribute(a[0], a[1]); });
        var tx = hz ? x + 16 : x + w / 2, ty = (hz ? y + h / 2 : y + LS.head / 2) + (ln.st ? -3 : 5);
        ln.tt.setAttribute('x', tx); ln.tt.setAttribute('y', ty);
        if (ln.st) { ln.st.setAttribute('x', tx); ln.st.setAttribute('y', ty + 16); }
        ln.z.x = x; ln.z.y = y; ln.z.w = w; ln.z.h = h;
        ln.area = hz ? {x: x + LS.head, y: y, w: w - LS.head, h: h} : {x: x, y: y + LS.head, w: w, h: h - LS.head};
        ln.members.forEach(function (id) {
          var n = nodes[id], want = ln.at + (n.rel != null ? n.rel : (ln.size - extent(n, hz)) / 2), cur = hz ? n.y : n.x;
          if (Math.abs(want - cur) > 0.01) shiftNode(n, hz ? 0 : want - cur, hz ? want - cur : 0);
        });
      });
      if (o.fit !== false && vb) {   // the view ends as far past the lanes as it starts before them
        if (hz) vb.h = pos + (o.y - vb.y) - vb.y; else vb.w = pos + (o.x - vb.x) - vb.x;
        svg.setAttribute('viewBox', [vb.x, vb.y, vb.w, vb.h].join(' '));
      }
    }
    /* a node in a lane: its y (in a row) or x (in a column) is from the lane's edge, or centred when left out */
    function laneNode(id, o) {
      var L = laneOf[o.lane];
      if (!L) throw new Error('EdgeDiagram: node ' + id + ' names an unknown lane ' + o.lane);
      var hz = L.set.hz, rel = hz ? o.y : o.x, p = Object.assign({}, o, {_laned: true});
      if (hz) p.y = L.lane.at + (rel || 0); else p.x = L.lane.at + (rel || 0);
      api.node(id, p);
      nodes[id].rel = rel; nodes[id].lane = o.lane; L.lane.members.push(id);
      fitLanes(L.set);
      return api;
    }

    /* free text: a label that is not part of a node or a zone */
    api.text = function (id, o) {
      if (hold('text', id, o)) return api;
      var g = el('g', {'class': 'ed-item', 'data-id': id}, layers.nodes);
      el('text', {'class': 'ed-text' + (o.mono ? ' mono' : '') + (o.cls ? ' ' + o.cls : ''), x: o.x, y: o.y, 'font-size': o.size || 14,
        'text-anchor': o.anchor || 'start'}, g, o.text);
      items[id] = {el: g, kind: 'label', o: o};
      return api;
    };

    /* ---------- links ---------- */
    function obstaclesFor(L) {
      var A = nodes[L.from], B = nodes[L.to], out = [];
      Object.keys(nodes).forEach(function (k) {
        var n = nodes[k]; if (n.o.ghost) return;
        if (k !== L.from && k !== L.to && (contains(n, A) || contains(n, B) || contains(A, n) || contains(B, n))) return;   // a parent, or a chip inside an end
        var r = rectOf(n); if (k === L.from) r.own = 0; else if (k === L.to) r.own = 1;
        out.push(r);
      });
      return out;
    }
    function foreignZones(L) {   // zones that hold neither end of a link
      var A = nodes[L.from], B = nodes[L.to];
      return zones.filter(function (z) { return !contains(z, A) && !contains(z, B); });
    }
    function plateClass(x, y) {
      var host = null;   // a composite state is drawn above the zones
      Object.keys(nodes).forEach(function (k) {
        var n = nodes[k];
        if (n.shape === 'composite' && x >= n.x && x <= n.x + n.w && y >= n.y && y <= n.y + n.h && (!host || n.w * n.h < host.w * host.h)) host = n;
      });
      if (host) { var t = host.o.tone || 'neutral'; return t === 'neutral' ? ' on-layer' : ' on-' + t; }
      for (var i = zones.length - 1; i >= 0; i--) {
        var z = zones[i];
        if (x >= z.x && x <= z.x + z.w && y >= z.y && y <= z.y + z.h) return z.tone === 'gap' ? ' on-gap' : ' on-layer';
      }
      return '';
    }
    function inComposite(n, box) { return n.shape === 'composite' && contains(n, box) && !(n.tab && inter(box, n.tab, 0)); }
    function onWire(box, M) {   // a wire under a label's plate
      var ps = samples(M);
      for (var q = 0; q < ps.length; q++) if (ps[q][0] > box.x + 1.5 && ps[q][0] < box.x + box.w - 1.5 && ps[q][1] > box.y + 1.5 && ps[q][1] < box.y + box.h - 1.5) return true;
      return false;
    }
    function labelBlocked(L, box) {
      for (var k in nodes) if (!nodes[k].o.ghost && inter(box, nodes[k], 0) && !inComposite(nodes[k], box)) return true;
      for (var j in links) if (j !== L.id && links[j].lbox && inter(box, links[j].lbox, 0)) return true;
      if (L.o._transition) for (var w in links) if (w !== L.id && onWire(box, links[w])) return true;
      for (var z = 0; z < zones.length; z++) { var zl = items[zones[z].id + '.label'], zb = zl && bboxOf(zl.el); if (zb && zb.w && inter(box, zb, 0)) return true; }
      return false;
    }
    /* a label slides along its wire until it clears the nodes and the other labels */
    function placeLabel(L) {
      var base = L.o.labelAt != null ? L.o.labelAt : 0.5, best = null;
      var tries = L.o.labelFixed ? [0] : [0, -0.08, 0.08, -0.16, 0.16, -0.24, 0.24, -0.32, 0.32];
      for (var i = 0; i < tries.length; i++) {
        var at = Math.max(0.06, Math.min(0.94, base + tries[i]));
        var mid = L.path.getPointAtLength(L.len * at);
        L.lt.setAttribute('x', mid.x); L.lt.setAttribute('y', mid.y + 4);
        var bb = bboxOf(L.lt) || {x: mid.x, y: mid.y, w: 0, h: 0};
        if (L.out) {   // beside the wire, on the side away from its pair or its node
          var ox = L.out[0] * (bb.w / 2 + 7), oy = L.out[1] * (bb.h / 2 + 4);
          mid = {x: mid.x + ox, y: mid.y + oy};
          L.lt.setAttribute('x', mid.x); L.lt.setAttribute('y', mid.y + 4);
          bb = {x: bb.x + ox, y: bb.y + oy, w: bb.w, h: bb.h};
        }
        var cand = {mid: mid, box: {x: bb.x - 4, y: bb.y - 2, w: bb.w + 8, h: bb.h + 4}};
        if (!best) best = cand;
        if (!labelBlocked(L, cand.box)) { best = cand; break; }
      }
      L.lt.setAttribute('x', best.mid.x); L.lt.setAttribute('y', best.mid.y + 4);
      var b = best.box;
      L.plate.setAttribute('x', b.x); L.plate.setAttribute('y', b.y); L.plate.setAttribute('width', b.w); L.plate.setAttribute('height', b.h);
      L.plate.setAttribute('class', 'ed-llabel-bg' + plateClass(best.mid.x, best.mid.y));
      L.lbox = b;
    }
    /* An end with no position given that is alone on its side moves along it so that the wire runs
       straight, when the two nodes face each other across a shared span. */
    function aligned(L, a, b) {
      var t0 = L.t0, t1 = L.t1, n0 = NORMAL[L.s0], n1 = NORMAL[L.s1];
      if (L.fan || n0[0] !== -n1[0] || n0[1] !== -n1[1]) return [t0, t1];
      var h = n0[1] === 0, ax = h ? 1 : 0;   // the coordinate the wire must share
      var gap = h ? (n0[0] > 0 ? b.x - (a.x + a.w) : a.x - (b.x + b.w)) : (n0[1] > 0 ? b.y - (a.y + a.h) : a.y - (b.y + b.h));
      if (gap < 0) return [t0, t1];
      function free(n, side, fixed) { return !fixed && !n.o.ghost && (n.ports[side] || []).length === 1; }
      var f0 = free(a, L.s0, L.fix0), f1 = free(b, L.s1, L.fix1);
      if (!f0 && !f1) return [t0, t1];
      var lo0 = h ? a.y : a.x, len0 = h ? a.h : a.w, lo1 = h ? b.y : b.x, len1 = h ? b.h : b.w;
      var m0 = Math.min(12, len0 / 4), m1 = Math.min(12, len1 / 4), v;
      if (f0 && f1) {
        var lo = Math.max(lo0 + m0, lo1 + m1), hi = Math.min(lo0 + len0 - m0, lo1 + len1 - m1);
        if (lo > hi) return [t0, t1];
        v = Math.max(lo, Math.min(hi, ((lo0 + len0 / 2) + (lo1 + len1 / 2)) / 2));
      } else if (f1) {
        v = anchor(a, L.s0, t0)[ax];
        if (v < lo1 + m1 || v > lo1 + len1 - m1) return [t0, t1];
      } else {
        v = anchor(b, L.s1, t1)[ax];
        if (v < lo0 + m0 || v > lo0 + len0 - m0) return [t0, t1];
      }
      return [f0 ? (v - lo0) / len0 : t0, f1 ? (v - lo1) / len1 : t1];
    }
    /* Two links that run opposite ways between the same sides: each moves half of o.apart (default 22)
       from the middle of the span the nodes share, the one going right (or down) above (or right of) the
       other, and its label goes beside it on its outer side. */
    function pairT(L, a, b) {
      var n0 = NORMAL[L.s0], n1 = NORMAL[L.s1], h = n0[1] === 0, M = links[L.pair];
      var apart = L.o.apart || (M && M.o.apart) || 22;
      var lo0 = h ? a.y : a.x, len0 = h ? a.h : a.w, lo1 = h ? b.y : b.x, len1 = h ? b.h : b.w, c0, c1;
      var facing = n0[0] === -n1[0] && n0[1] === -n1[1];
      if (facing) {
        var lo = Math.max(lo0, lo1), hi = Math.min(lo0 + len0, lo1 + len1);
        if (hi - lo >= apart + 16) c0 = c1 = (lo + hi) / 2;
      }
      if (c0 == null) { c0 = lo0 + len0 / 2; c1 = lo1 + len1 / 2; }
      var sg = h ? -n0[0] : n0[1];   // clockwise: rightwards on top, downwards on the right
      L.out = facing && c0 === c1 ? (h ? [0, sg] : [sg, 0]) : null;
      return [(c0 + sg * apart / 2 - lo0) / len0, (c1 + sg * apart / 2 - lo1) / len1];
    }
    function drawLink(L) {
      var a = nodes[L.from], b = nodes[L.to];
      var kind = L.o.route || 'ortho', tt = L.pair ? pairT(L, a, b) : aligned(L, a, b), p0 = anchor(a, L.s0, tt[0]), p1 = anchor(b, L.s1, tt[1]), d;
      L.segs = null;
      if (L.loop) {   // a self-transition: out of the side, along it, and back in, at right angles
        var nn = NORMAL[L.s0], ext = L.o.loop || 26;
        var lp = [p0, [p0[0] + nn[0] * ext, p0[1] + nn[1] * ext], [p1[0] + nn[0] * ext, p1[1] + nn[1] * ext], p1];
        L.segs = lp.slice(1).map(function (q, i) { return [lp[i], q]; });
        d = roundedPolyline(lp, Math.min(L.o.radius || 14, 10));
      } else if (L.fan) {
        var fg = fanGeom(L.fan), fp = fg.pts[L.fanIndex].slice();
        if (L.fan.into) fp.reverse();
        L.segs = fp.slice(1).map(function (q, i) { return [fp[i], q]; });
        d = roundedPolyline(fp, function (c) {
          return fg.dots.some(function (o) { return same(o[0], c[0]) && same(o[1], c[1]); }) ? 0 : (L.fan.o.radius || 14);
        });
      } else if (kind === 'ortho') {
        var others = [];
        Object.keys(links).forEach(function (k) {
          var M = links[k];   // a link with the same ends is an alternative shown instead, not a neighbour
          var twin = M.from === L.from && M.to === L.to && M.s0 === L.s0 && M.s1 === L.s1 && M.t0 === L.t0 && M.t1 === L.t1;
          if (k !== L.id && M.poly && !twin) others = others.concat(M.poly);
        });
        var ro = L.o, nf = NORMAL[L.s0], nt = NORMAL[L.s1], gap = (p1[0] - p0[0]) * nf[0] + (p1[1] - p0[1]) * nf[1];
        if (nf[0] === -nt[0] && nf[1] === -nt[1] && gap > 0 && gap < 2 * (ro.stub != null ? ro.stub : 16))
          ro = Object.assign({}, ro, {stub: gap / 2});   // ends facing across a narrow gap: stubs that fit it
        var pts = orthoPoints(p0, L.s0, p1, L.s1, ro, L.o.avoid !== false ? obstaclesFor(L) : null, others,
          L.o.avoid !== false ? foreignZones(L) : null, vb);
        L.segs = pts.slice(1).map(function (q, i) { return [pts[i], q]; });
        d = roundedPolyline(pts, L.o.radius || 14);
      } else d = route(p0, L.s0, p1, L.s1, kind, L.o);
      L.p0 = p0; L.p1 = p1;
      L.hit.setAttribute('d', d); L.path.setAttribute('d', d);
      L.len = L.path.getTotalLength(); L.samples = null;
      if ((L.o._trunkLabel || L.o._branchLabel) && L.len) {   // halfway along the trunk, or along the branch's last run
        var atEnd = !!L.o._branchLabel !== !!L.fan.into, ts = L.segs[atEnd ? L.segs.length - 1 : 0], tl = Math.abs(ts[1][0] - ts[0][0]) + Math.abs(ts[1][1] - ts[0][1]);
        L.o.labelAt = atEnd ? 1 - tl / 2 / L.len : tl / 2 / L.len;
      }
      if (L.segs) L.poly = L.segs;
      else {   // a curve or a line, as short segments, so ortho routes can see it
        L.poly = []; var n = Math.max(1, Math.ceil(L.len / 12)), prev = null;
        for (var i = 0; i <= n; i++) { var pt = L.path.getPointAtLength(L.len * i / n), cur = [pt.x, pt.y]; if (prev) L.poly.push([prev, cur]); prev = cur; }
      }
      if (L.lt) placeLabel(L);
    }
    /* links that share a side without an explicit position are spread along it, in the order of
       their other ends, so that they do not cross */
    function spread(nodeId, side) {
      var n = nodes[nodeId], list = (n.ports[side] || []).filter(function (p) { return p.auto; });
      var horiz = side === 'top' || side === 'bottom';
      function other(p) { var L = links[p.link], o = nodes[p.end === 0 ? L.to : L.from]; return horiz ? o.x + o.w / 2 : o.y + o.h / 2; }
      list.sort(function (p, q) { return other(p) - other(q); });
      list.forEach(function (p, i) { var t = (i + 1) / (list.length + 1), L = links[p.link]; if (p.end === 0) L.t0 = t; else L.t1 = t; });
      list.forEach(function (p) { drawLink(links[p.link]); });
    }
    function relayout() {
      if (held) { api.layout(); return; }
      if (!dirty) return; dirty = false;
      if (respread) {   // nodes moved into their lanes after links were spread along their sides
        respread = false;
        Object.keys(nodes).forEach(function (k) { Object.keys(nodes[k].ports).forEach(function (sd) { spread(k, sd); }); });
      }
      Object.keys(links).forEach(function (k) { drawLink(links[k]); });
      fans.forEach(drawDots);
    }

    api.link = function (id, o) {
      if (hold('link', id, o)) return api;
      var a = nodes[o.from[0]], b = nodes[o.to[0]];
      if (!a || !b) throw new Error('EdgeDiagram: link ' + id + ' needs existing nodes');
      var s0 = o.from[1] || 'auto', s1 = o.to[1] || 'auto', loop = a === b && !o._fan;
      if (loop) { s0 = s1 = s0 !== 'auto' ? s0 : s1 !== 'auto' ? s1 : 'right'; }
      if (s0 === 'auto') s0 = autoSide(a, b);
      if (s1 === 'auto') s1 = autoSide(b, a);
      var tone = o.tone || 'accent';
      var g = el('g', {'class': 'ed-item ed-link t-' + tone + (o.dashed ? ' dashed' : ''), 'data-id': id}, layers.links);
      var hit = el('path', {'class': 'ed-hit'}, g), path = el('path', {'class': 'ed-wire'}, g);
      var mk = 'url(#ed-arrow-' + tone + '-' + (svg.id || 'd') + ')';
      if (o.arrow === 'end' || o.arrow === 'both') path.setAttribute('marker-end', mk);
      if (o.arrow === 'start' || o.arrow === 'both') path.setAttribute('marker-start', mk);
      var t0 = o.from[2], t1 = o.to[2];
      if (a.point) t0 = 0.5;   // a dot or a diamond is met at the middle of its side
      if (b.point) t1 = 0.5;
      if (loop) {   // out and back o.span (default 30) apart, about the side's middle
        var sl = s0 === 'top' || s0 === 'bottom' ? a.w : a.h, sp = (o.span || 30) / 2 / sl;
        if (typeof t0 !== 'number') t0 = 0.5 - sp;
        if (typeof t1 !== 'number') t1 = 0.5 + sp;
      }
      var L = {id: id, el: g, path: path, hit: hit, from: o.from[0], to: o.to[0], s0: s0, s1: s1,
               t0: t0 === 'auto' ? null : t0, t1: t1 === 'auto' ? null : t1, o: o,
               fix0: typeof t0 === 'number', fix1: typeof t1 === 'number', fan: o._fan || null, fanIndex: o._fanIndex};
      if (o.label) {
        // on their own layer, so that no wire drawn later crosses a label; d.items[id + '.label']
        L.lb = el('g', {'class': 'ed-item ed-lgroup', 'data-id': id + '.label'}, layers.labels);
        items[id + '.label'] = {el: L.lb, kind: 'llabel'};
        L.plate = el('rect', {'class': 'ed-llabel-bg', rx: 3}, L.lb);
        L.lt = el('text', {'class': 'ed-llabel', 'text-anchor': 'middle'}, L.lb, o.label);
      }
      if (o.info) focusable(g, o.infoTitle || o.label || id, o.info);
      // between two chips of one node, the wire goes just above that node and under its chips, or the
      // node's fill would cover it; its label and packets go with it. Define the node before such links.
      var host = null;
      Object.keys(nodes).forEach(function (k) {
        var n = nodes[k];
        if (n === a || n === b || n.o.ghost || !contains(n, a) || !contains(n, b)) return;
        if (!host || n.w * n.h < host.w * host.h) host = n;
      });
      L.host = host;
      if (!host) Object.keys(nodes).forEach(function (k) {   // out of a composite state: above its fill too
        var n = nodes[k];
        if (n.shape === 'composite' && n !== a && n !== b && (contains(n, a) || contains(n, b)) &&
            (!host || (host.el.compareDocumentPosition(n.el) & Node.DOCUMENT_POSITION_FOLLOWING))) host = n;
      });
      if (loop) { L.loop = true; L.out = NORMAL[s0]; if (o.labelFixed == null) o.labelFixed = true; }
      var twin = null;   // a link already drawn the opposite way between the same sides: the two keep apart
      if (!loop && !L.fan && o.apart !== false && !L.fix0 && !L.fix1) Object.keys(links).forEach(function (k) {
        var M = links[k];
        if (!twin && !M.pair && !M.fan && !M.loop && M.o.apart !== false && M.from === L.to && M.to === L.from && M.s0 === s1 && M.s1 === s0 && !M.fix0 && !M.fix1) twin = M;
      });
      if (twin) { L.pair = twin.id; twin.pair = id; }
      if (host) {
        host.el.parentNode.insertBefore(g, host.el.nextSibling);
        if (L.lb) host.el.parentNode.insertBefore(L.lb, g.nextSibling);
      }
      links[id] = L; a.links.push(id); b.links.push(id);
      items[id] = {el: g, kind: 'link', o: o, path: path};
      // an end is spread along its side when the side or the position is 'auto'; an explicit side
      // with no position is its middle, and a ghost end is a junction where links meet
      var autoFrom = (t0 === 'auto' || (t0 == null && (o.from[1] || 'auto') === 'auto')) && !a.o.ghost && !twin;
      var autoTo = (t1 === 'auto' || (t1 == null && (o.to[1] || 'auto') === 'auto')) && !b.o.ghost && !twin;
      (a.ports[s0] = a.ports[s0] || []).push({link: id, end: 0, auto: autoFrom});
      (b.ports[s1] = b.ports[s1] || []).push({link: id, end: 1, auto: autoTo});
      drawLink(L);
      if (autoFrom) spread(o.from[0], s0);
      if (autoTo) spread(o.to[0], s1);
      if (twin) {   // the twin leaves the spread of its sides and moves to its lane
        [[twin.from, twin.s0], [twin.to, twin.s1]].forEach(function (e) {
          (nodes[e[0]].ports[e[1]] || []).forEach(function (p) { if (p.link === twin.id) p.auto = false; });
          spread(e[0], e[1]);
        });
        drawLink(twin);
      }
      if (o.flow) {
        var f = o.flow, count = f.count || 1;
        for (var i = 0; i < count; i++) {
          var c = el('circle', {r: f.r || 4.5, 'class': 'ed-pkt t-' + (f.tone || tone), opacity: 0}, layers.pkts);
          if (host) g.parentNode.insertBefore(c, g.nextSibling);
          flows.push({link: id, c: c, dir: f.dir || 1, period: f.period || 1.6, phase: (f.phase || 0) + i / count, on: false});
        }
      }
      return api;
    };
    api.layout = function (opts) {
      if (held) {
        if (!global.EdgeLayout) throw new Error('EdgeDiagram: a node without x and y needs lib/edgelayout.js');
        var calls = held; held = null;
        global.EdgeLayout.place(api, calls, opts || {});
        if (vbv && vbv.width) vb = {x: vbv.x, y: vbv.y, w: vbv.width, h: vbv.height};   // it may fit the viewBox
        calls.forEach(function (c) { api[c.kind](c.id, c.o); });
      }
      dirty = true; relayout(); return api;
    };

    /* d.transition(id, {from, to, event, guard, action}): a state machine's transition, a link labelled
       'event [guard] / action' (an end is a node id or [id, side, t]). from === to is a self-transition: a
       loop on o.side (default right), o.span wide and o.loop deep, its label beside it. Ink by default,
       with an arrowhead and a packet that runs while a step fires it. */
    api.transition = function (id, o) {
      function end(e) { return typeof e === 'string' ? [e, 'auto'] : e; }
      var from = end(o.from), to = end(o.to), parts = [];
      if (from[0] === to[0] && o.side) { from = [from[0], o.side, from[2]]; to = [to[0], o.side, to[2]]; }
      var bits = [['ed-tev', o.event], ['ed-tguard', o.guard && '[' + o.guard + ']'], ['ed-tact', o.action && '/ ' + o.action]];
      bits.forEach(function (b) { if (b[1]) parts.push(b[1]); });
      api.link(id, Object.assign({arrow: 'end', tone: 'ink2', flow: {dir: 1, period: 1.4, tone: 'accent'}}, o,
        {from: from, to: to, label: o.label || parts.join(' ') || null, _transition: true}));
      var L = links[id];
      if (L.lt && !o.label) {   // the guard quieter, the action in italics
        L.lt.textContent = '';
        bits.forEach(function (b) { if (b[1]) el('tspan', {'class': b[0]}, L.lt, (L.lt.childNodes.length ? ' ' : '') + b[1]); });
        placeLabel(L);
      }
      return api;
    };

    /* ---------- fans: one point feeding several nodes, or several feeding one ---------- */
    var fans = [];
    function opposite(side) { return {top: 'bottom', bottom: 'top', left: 'right', right: 'left'}[side]; }
    // the trunk leaves the shared end, the bus runs across at right angles, a branch drops to each end
    function fanGeom(G) {
      var S = nodes[G.shared[0]], sS = G.shared[1], n = NORMAL[sS], v = n[0] === 0, stub = G.o.stub != null ? G.o.stub : 16;
      var tS = G.shared[2];
      if (tS == null) {   // the trunk in line with the end nearest the side's middle, when one is in reach: no jog there
        var lo = v ? S.x : S.y, len = v ? S.w : S.h, m = Math.min(12, len / 4), best = null;
        G.ends.forEach(function (e) {
          var u = anchor(nodes[e[0]], e[1], e[2])[v ? 0 : 1];
          if (u >= lo + m && u <= lo + len - m && (best == null || Math.abs(u - lo - len / 2) < Math.abs(best - lo - len / 2))) best = u;
        });
        tS = best == null ? 0.5 : (best - lo) / len;
      }
      var pS = anchor(S, sS, tS);
      function P(u, w) { return v ? [u, w] : [w, u]; }   // u along the bus, w across it
      var uS = v ? pS[0] : pS[1], wS = v ? pS[1] : pS[0], dir = v ? n[1] : n[0];
      var near = Infinity;
      G.ends.forEach(function (e) {
        var E = nodes[e[0]], lo = v ? E.y : E.x, hi = v ? E.y + E.h : E.x + E.w;
        near = Math.min(near, dir > 0 ? lo - wS : wS - hi);
      });
      var bus = G.o.at != null ? G.o.at : wS + dir * Math.max(stub, near / 2);
      var drops = [], pts = G.ends.map(function (e) {
        var E = nodes[e[0]], pE = anchor(E, e[1], e[2]), nE = NORMAL[e[1]];
        var uE = v ? pE[0] : pE[1], wE = v ? pE[1] : pE[0];
        if ((v ? nE[0] : nE[1]) !== 0) {   // an end on a side across the bus: along the bus, then in through a stub
          var su = uE + (v ? nE[0] : nE[1]) * stub;
          drops.push(su);
          return simplify([pS, P(uS, bus), P(su, bus), P(su, wE), pE]);
        }
        drops.push(uE);
        return simplify([pS, P(uS, bus), P(uE, bus), pE]);
      });
      // a dot where three or four runs meet
      var us = drops.concat([uS]), min = Math.min.apply(null, us), max = Math.max.apply(null, us), dots = [], done = [];
      us.forEach(function (u) {
        if (done.some(function (x) { return Math.abs(x - u) < 1; })) return; done.push(u);
        var k = (u > min + 1 ? 1 : 0) + (u < max - 1 ? 1 : 0) + (Math.abs(u - uS) < 1 ? 1 : 0) + (drops.some(function (x) { return Math.abs(x - u) < 1; }) ? 1 : 0);
        if (k >= 3) dots.push(P(u, bus));
      });
      return {pts: pts, dots: G.o.dot === false ? [] : dots};
    }
    function drawDots(G) {
      while (G.dg.firstChild) G.dg.removeChild(G.dg.firstChild);
      fanGeom(G).dots.forEach(function (p) {
        el('circle', {cx: p[0], cy: p[1], r: G.o.dotSize || 3.6, 'class': 'ed-arrow ed-dot t-' + (G.o.tone || 'accent')}, G.dg);
      });
    }
    /* d.fan(id, {from: [node, side, t], to: [[node, side, t, opts], ...]}) feeds several nodes from one
       point; d.fan(id, {from: [[node, side, t, opts], ...], to: [node, side, t]}) gathers several into
       one. Each branch is a link, id + '.' + its node's id; the fan's id in a step stands for all of
       them and their dots. */
    api.fan = function (id, o) {
      if (hold('fan', id, o)) return api;
      var into = Array.isArray(o.from[0]), shared = (into ? o.to : o.from).slice(), many = into ? o.from : o.to;
      if (!nodes[shared[0]]) throw new Error('EdgeDiagram: fan ' + id + ' needs existing nodes');
      var ends = many.map(function (e) {
        e = typeof e === 'string' ? [e] : e.slice();
        var E = nodes[e[0]]; if (!E) throw new Error('EdgeDiagram: fan ' + id + ' needs existing nodes');
        return e;
      });
      if (!shared[1] || shared[1] === 'auto') {   // the side that faces the ends
        var cx = 0, cy = 0;
        ends.forEach(function (e) { var E = nodes[e[0]]; cx += E.x + E.w / 2; cy += E.y + E.h / 2; });
        shared[1] = autoSide(nodes[shared[0]], {x: cx / ends.length, y: cy / ends.length, w: 0, h: 0});
      }
      if (shared[2] === 'auto') shared[2] = null;
      ends.forEach(function (e) {
        if (!e[1] || e[1] === 'auto') e[1] = opposite(shared[1]);
        if (e[2] == null || e[2] === 'auto') e[2] = 0.5;
      });
      var G = {id: id, o: o, into: into, shared: shared, ends: ends, members: []};
      G.dg = el('g', {'class': 'ed-item ed-dots', 'data-id': id + '.dots'}, layers.labels);
      items[id + '.dots'] = {el: G.dg, kind: 'label'};
      fans.push(G);
      ends.forEach(function (e, i) {
        var eo = e[3] || {}, bid = eo.id || id + '.' + e[0];
        var lo = {from: into ? e.slice(0, 3) : shared, to: into ? shared : e.slice(0, 3), tone: o.tone, dashed: o.dashed,
          arrow: o.arrow, flow: eo.flow || o.flow, info: eo.info || o.info, infoTitle: eo.infoTitle || o.infoTitle,
          label: eo.label, labelAt: eo.labelAt, labelFixed: eo.labelAt == null, _branchLabel: !!eo.label && eo.labelAt == null, check: o.check, _fan: G, _fanIndex: i};
        if (i === 0 && o.label) { lo.label = o.label; lo.labelFixed = true; lo._trunkLabel = true; lo._branchLabel = false; }   // the fan's label, on the trunk
        api.link(bid, lo);
        G.members.push(bid);
      });
      drawDots(G);
      items[id] = {el: G.dg, kind: 'fan', o: o, members: G.members.concat([id + '.dots'])};
      return api;
    };
    function expand(ids, linksOnly) {   // a fan's id stands for its branches (and its dots)
      var out = [];
      (ids || []).forEach(function (k) {
        if (items[k] && items[k].kind === 'fan') items[k].members.forEach(function (m) { if (!linksOnly || links[m]) out.push(m); });
        else out.push(k);
      });
      return out;
    }

    /* ---------- packets ---------- */
    var running = false, onScreen = true, t0 = null;
    function anyOn() { for (var i = 0; i < flows.length; i++) if (flows[i].on) return true; return false; }
    function ensureLoop() {
      if (!running && !reduce && onScreen && !document.hidden && anyOn()) { running = true; global.requestAnimationFrame(tick); }
    }
    function tick(ts) {
      if (!onScreen || document.hidden || !anyOn()) { running = false; return; }
      if (t0 == null) t0 = ts;
      var s = (ts - t0) / 1000, focusing = svg.classList.contains('ed-focusing');
      flows.forEach(function (f) {
        if (!f.on) { f.c.setAttribute('opacity', 0); return; }
        var L = links[f.link], op = parseFloat(L.el.style.opacity);
        if (isNaN(op)) op = 1;
        if (parseFloat(L.path.style.strokeDashoffset) > 1) op = 0;   // the wire is still being drawn
        if (focusing && !L.el.classList.contains('ed-hot')) op *= 0.18;
        if (op < 0.02) { f.c.setAttribute('opacity', 0); return; }
        var u = ((s / f.period) + f.phase) % 1, v = f.dir > 0 ? u : 1 - u;
        var pt = L.path.getPointAtLength(L.len * v);
        f.c.setAttribute('cx', pt.x); f.c.setAttribute('cy', pt.y);
        f.c.setAttribute('opacity', op * (u < 0.08 ? u / 0.08 : u > 0.92 ? (1 - u) / 0.08 : 1));
      });
      global.requestAnimationFrame(tick);
    }
    if ('IntersectionObserver' in global) {
      new IntersectionObserver(function (es) { onScreen = es[es.length - 1].isIntersecting; ensureLoop(); }).observe(svg);
    }
    api.setFlows = function (ids, on) {
      if (ids !== '*') ids = expand(ids, true);
      flows.forEach(function (f) {
        if (ids === '*' || ids.indexOf(f.link) >= 0) { f.on = on && !reduce; if (!f.on) f.c.setAttribute('opacity', 0); }
      });
      ensureLoop();
    };

    /* ---------- focus and tooltip ---------- */
    var tip = document.createElement('div');
    tip.className = 'ed-tip'; tip.id = 'ed-tip-' + self; tip.setAttribute('role', 'tooltip'); tip.hidden = true;
    (document.body || document.documentElement).appendChild(tip);
    tip.addEventListener('click', function (e) { e.stopPropagation(); });
    var pinned = null, current = null;
    function visible(g) { return parseFloat(global.getComputedStyle(g).opacity) > 0.5 && g.style.visibility !== 'hidden'; }
    function clearHot() { Object.keys(items).forEach(function (k) { items[k].el.classList.remove('ed-hot'); }); }
    function fillTip(title, info) {
      tip.textContent = '';
      var b = document.createElement('b'); b.textContent = title; tip.appendChild(b);
      var t = infoText(info);
      if (t) { var s = document.createElement('span'); s.textContent = t; tip.appendChild(s); }
      if (info && info.facts) {
        var dl = document.createElement('dl');
        info.facts.forEach(function (kv) {
          var dt = document.createElement('dt'), dd = document.createElement('dd');
          dt.textContent = kv[0]; dd.textContent = kv[1]; dl.appendChild(dt); dl.appendChild(dd);
        });
        tip.appendChild(dl);
      }
      if (info && info.href) {
        var a = document.createElement('a'); a.href = info.href; a.target = '_blank'; a.rel = 'noopener';
        a.textContent = info.hrefText || 'More'; tip.appendChild(a);
      }
    }
    function placeTip(target) {
      var vw = document.documentElement.clientWidth || global.innerWidth, vh = global.innerHeight;
      if (vw < 560) { tip.classList.add('sheet'); return; }
      tip.classList.remove('sheet');
      var r = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2));
      var top = r.top - h - 10;
      if (top < 8) top = r.bottom + 10;
      if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function focusOn(kind, id) {
      var it = kind === 'node' ? nodes[id] : links[id];
      if (!it || !it.o.info || !visible(it.el)) return;
      svg.classList.add('ed-focusing'); clearHot();
      it.el.classList.add('ed-hot');
      var title;
      if (kind === 'node') {
        it.links.forEach(function (lid) {
          var L = links[lid]; if (!visible(L.el)) return;
          L.el.classList.add('ed-hot'); if (L.lb) L.lb.classList.add('ed-hot');
          nodes[L.from].el.classList.add('ed-hot'); nodes[L.to].el.classList.add('ed-hot');
        });
        title = it.o.title;
      } else {
        nodes[it.from].el.classList.add('ed-hot'); nodes[it.to].el.classList.add('ed-hot');
        if (it.lb) it.lb.classList.add('ed-hot');
        title = it.o.infoTitle || it.o.label || ((nodes[it.from].o.title || it.from) + ' → ' + (nodes[it.to].o.title || it.to));
      }
      Object.keys(items).forEach(function (k) {   // zones stay readable as context
        if (items[k].kind === 'zone' || items[k].kind === 'label') items[k].el.classList.add('ed-hot');
      });
      fillTip(title, it.o.info);
      tip.hidden = false;
      if (current && current.el !== it.el) current.el.removeAttribute('aria-describedby');
      current = {el: it.el}; it.el.setAttribute('aria-describedby', tip.id);
      placeTip(it.el);
      tip.classList.toggle('pinned', pinned === kind + ':' + id);
    }
    function clearFocus(force) {
      if (pinned && !force) return;
      pinned = null; svg.classList.remove('ed-focusing'); tip.hidden = true; tip.classList.remove('pinned');
      if (current) current.el.removeAttribute('aria-describedby');
      current = null; clearHot();
    }
    REG.push({clear: function () { clearFocus(true); }, reposition: function () { if (current && !tip.hidden) placeTip(current.el); }, wake: ensureLoop});

    api.bindFocus = function () {
      relayout();
      function bind(kind, id, g) {
        var key = kind + ':' + id;
        g.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch' && !pinned) focusOn(kind, id); });
        g.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') clearFocus(false); });
        g.addEventListener('focus', function () { if (!pinned) focusOn(kind, id); });
        g.addEventListener('blur', function () { clearFocus(false); });
        g.addEventListener('click', function (e) {
          e.stopPropagation();
          if (pinned === key) { clearFocus(true); return; }
          clearAll(); focusOn(kind, id); pinned = key; tip.classList.add('pinned');
        });
        g.addEventListener('keydown', function (e) {   // Enter or space pins, without turning a deck's page
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); g.dispatchEvent(new MouseEvent('click', {bubbles: true})); }
        });
      }
      Object.keys(nodes).forEach(function (id) { if (nodes[id].o.info) bind('node', id, nodes[id].el); });
      Object.keys(links).forEach(function (id) { if (links[id].o.info) bind('link', id, links[id].el); });
      svg.addEventListener('click', function () { clearFocus(true); });
      return api;
    };
    api.clearFocus = function () { clearFocus(true); };

    /* ---------- steps: step 0 is the resting state; label sN is the state after step N ---------- */
    api.steps = function (list, opt) {
      opt = opt || {};
      relayout();
      list = list.map(function (s) {
        var c = Object.assign({}, s);
        ['show', 'hide', 'dim'].forEach(function (k) { if (s[k]) c[k] = expand(s[k]); });
        ['flows', 'stopFlows'].forEach(function (k) { if (s[k]) c[k] = expand(s[k], true); });
        if (s.fire) { c.fire = expand([].concat(s.fire), true); c.flows = (c.flows || []).concat(c.fire); }
        return c;
      });
      // a walk through a state machine: {current: node} rings that node until a later step moves the
      // ring; {fire: link} draws the link thicker with a packet on it, for that step only
      list.forEach(function (s, k) {
        var was = k ? list[k - 1].fire || [] : [];
        if (was.length) s.stopFlows = (s.stopFlows || []).concat(was.filter(function (f) { return (s.fire || []).indexOf(f) < 0; }));
      });
      function currentAt(k) { var c = null; for (var j = 0; j <= k && j < list.length; j++) if ('current' in list[j]) c = list[j].current; return c; }
      var halos = {}, fired = {};
      list.forEach(function (s) {
        if (s.current != null) { if (!nodes[s.current]) throw new Error('EdgeDiagram: step current ' + s.current + ' is not a node'); halos[s.current] = haloOf(nodes[s.current]); }
        (s.fire || []).forEach(function (f) { var p = links[f].path; fired[f] = parseFloat(global.getComputedStyle(p).strokeWidth) || 2; });
      });
      function walkAt(k) {   // without a timeline: set the ring and the fired wires
        Object.keys(halos).forEach(function (id) { halos[id].style.opacity = currentAt(k) === id ? 1 : 0; });
        Object.keys(fired).forEach(function (f) { links[f].path.style.strokeWidth = (list[k].fire || []).indexOf(f) >= 0 ? FIRED : ''; });
      }
      var G = global.gsap, all = {};
      // s.view: an optional viewBox for that step; the view holds until a later step changes it
      function viewAt(k) { var v = null; for (var j = 0; j <= k && j < list.length; j++) if (list[j].view) v = list[j].view; return v; }
      list.forEach(function (s) { (s.show || []).forEach(function (id) { all[id] = true; }); });
      // what is visible at each step, for check()
      var vis = {};
      Object.keys(items).forEach(function (id) { if (!all[id] || (list[0].show || []).indexOf(id) >= 0) vis[id] = 1; });
      list.forEach(function (s) {   // a figure walked part by part may draw anywhere its views reach
        if (!s.view || !vb) return;
        var v = String(s.view).trim().split(/[\s,]+/).map(Number);
        var x1 = Math.max(vb.x + vb.w, v[0] + v[2]), y1 = Math.max(vb.y + vb.h, v[1] + v[3]);
        vb.x = Math.min(vb.x, v[0]); vb.y = Math.min(vb.y, v[1]); vb.w = x1 - vb.x; vb.h = y1 - vb.y;
      });
      stepSets = list.map(function (s, k) {
        if (k > 0) { (s.show || []).forEach(function (id) { vis[id] = 1; }); (s.hide || []).forEach(function (id) { delete vis[id]; }); }
        return Object.keys(vis);
      });
      var tl = G ? G.timeline({paused: true, defaults: {ease: 'power2.out'}}) : null;
      function prepLink(id) {
        var p = items[id].path, len = p.getTotalLength();
        p.dataset.len = len;
        // dash, then a gap longer than the path: at the start no round cap peeks out as a dot
        if (!items[id].o.dashed) { p.style.strokeDasharray = len + ' ' + (len + 10); p.style.strokeDashoffset = len + 1; }
        var lg = links[id].lb; if (lg) G.set(lg, {opacity: 0});
        // a marker ignores the dash, so an arrowhead would show before its wire: add it when drawn
        ['marker-end', 'marker-start'].forEach(function (m) {
          var v = p.getAttribute(m); if (v) { p.dataset[m === 'marker-end' ? 'me' : 'ms'] = v; p.removeAttribute(m); }
        });
      }
      /* A reveal is a set and a 'to', never a fromTo. A 'to' records the state it finds and returns to it
         when the playhead jumps back past it; a fromTo returns to its 'from', so an item shown at step 0
         (or dimmed) and shown again later would come back hidden on a jump to an earlier step. */
      function reveal(id, at) {
        var it = items[id];
        if (!it) throw new Error('EdgeDiagram: unknown item ' + id);
        if (it.kind === 'link') {
          if (it.o.dashed) tl.to(it.el, {opacity: 1, duration: 0.35}, at);
          else tl.set(it.el, {opacity: 1}, at).set(it.path, {strokeDashoffset: +it.path.dataset.len + 1}, at)
                .to(it.path, {strokeDashoffset: 0, duration: 0.6, ease: 'power1.inOut'}, at);
          var lg = links[id].lb;
          if (lg) tl.to(lg, {opacity: 1, duration: 0.3}, '>-0.15');
          var marks = {};
          if (it.path.dataset.me) marks['marker-end'] = it.path.dataset.me;
          if (it.path.dataset.ms) marks['marker-start'] = it.path.dataset.ms;
          if (Object.keys(marks).length) tl.set(it.path, {attr: marks}, '>');
        } else if (it.kind === 'node') {
          tl.set(it.el, {scale: 0.9, transformOrigin: '50% 50%'}, at)
            .to(it.el, {opacity: 1, scale: 1, duration: 0.45, ease: 'back.out(1.7)'}, at);
        } else {
          tl.to(it.el, {opacity: 1, duration: 0.4}, at);
        }
      }
      if (tl) {
        Object.keys(all).forEach(function (id) {
          if ((list[0].show || []).indexOf(id) >= 0) {   // shown from the start: drawn as is, ready to be redrawn
            var p = items[id].path;
            if (p && !items[id].o.dashed) { p.dataset.len = p.getTotalLength(); p.style.strokeDasharray = p.dataset.len + ' ' + (+p.dataset.len + 10); p.style.strokeDashoffset = 0; }
            return;
          }
          if (items[id].kind === 'link') prepLink(id);
          G.set(items[id].el, {opacity: 0});
        });
        if (viewAt(0)) svg.setAttribute('viewBox', viewAt(0));
        Object.keys(halos).forEach(function (id) { G.set(halos[id], {opacity: currentAt(0) === id ? 1 : 0}); });
        (list[0].fire || []).forEach(function (f) { G.set(links[f].path, {strokeWidth: FIRED}); });
        tl.addLabel('s0');
        list.forEach(function (s, k) {
          if (k === 0) return;
          var at = 's' + (k - 1);
          if (s.view) tl.to(svg, {attr: {viewBox: s.view}, duration: 0.8, ease: 'power2.inOut'}, at);
          function withLabel(id) { return links[id] && links[id].lb ? [items[id].el, links[id].lb] : items[id].el; }
          (s.hide || []).forEach(function (id) { tl.to(withLabel(id), {opacity: 0, duration: 0.3}, at); });
          (s.dim || []).forEach(function (id) { tl.to(withLabel(id), {opacity: 0.25, duration: 0.3}, at); });
          (s.show || []).forEach(function (id, i) { reveal(id, at + '+=' + (0.08 * i).toFixed(2)); });
          var pc = currentAt(k - 1), nc = currentAt(k);
          if (pc !== nc && pc != null) tl.to(halos[pc], {opacity: 0, duration: 0.25}, at);
          if (pc !== nc && nc != null) tl.to(halos[nc], {opacity: 1, duration: 0.35}, at + '+=0.35');
          (list[k - 1].fire || []).forEach(function (f) { if ((s.fire || []).indexOf(f) < 0) tl.to(links[f].path, {strokeWidth: fired[f], duration: 0.25}, at); });
          (s.fire || []).forEach(function (f) { tl.to(links[f].path, {strokeWidth: FIRED, duration: 0.25}, at); });
          tl.addLabel('s' + k, '+=0.15');
        });
      }
      var cur = 0;
      function flowsAt(k) {
        var on = {};
        if (k >= 0) list.slice(0, k + 1).forEach(function (s) { (s.flows || []).forEach(function (id) { on[id] = true; }); (s.stopFlows || []).forEach(function (id) { delete on[id]; }); });
        api.setFlows('*', false); api.setFlows(Object.keys(on), true);
      }
      function apply(k, animate) {
        if (still != null) k = still === 'end' ? list.length - 1 : still;
        cur = Math.max(0, Math.min(list.length - 1, k));
        flowsAt(cur);
        if (tl) { if (animate && !reduce) tl.tweenTo('s' + cur); else tl.pause().seek('s' + cur, false); }
        else { if (viewAt(cur)) svg.setAttribute('viewBox', viewAt(cur)); walkAt(cur); }
        api.clearFocus();
        if (opt.onStep) opt.onStep(cur, list[cur]);
      }
      var ctl = {
        get step() { return cur; }, count: list.length,
        go: function (k) { apply(k, k > cur); },
        next: function () { if (cur < list.length - 1) apply(cur + 1, true); },
        prev: function () { if (cur > 0) apply(cur - 1, false); },
        end: function () { apply(list.length - 1, false); },
        timeline: tl,          // for a host engine that tweens labels s0..sN itself
        flowsAt: flowsAt       // and switches flows per step; -1 stops them all
      };
      apply(opt.start != null ? opt.start : 0, false);
      return ctl;
    };

    /* d.walk([state, transition, state, ...], captions) returns steps for d.steps: the first state is
       current from step 0, and each transition fires in the step that makes the state after it current */
    api.walk = function (seq, caps) {
      var out = [], st = null;
      seq.forEach(function (id) {
        if (links[id] || (items[id] && items[id].kind === 'fan')) { st = {fire: id}; out.push(st); }
        else if (nodes[id]) { if (st && !('current' in st)) st.current = id; else { st = {current: id}; out.push(st); } }
        else throw new Error('EdgeDiagram: walk: unknown item ' + id);
      });
      if (caps) out.forEach(function (s, i) { if (caps[i] != null) s.caption = caps[i]; });
      return out;
    };

    /* ---------- check ---------- */
    function samples(L) {
      if (L.samples) return L.samples;
      var out = [];
      for (var s = 4; s < L.len - 4; s += 4) { var p = L.path.getPointAtLength(s); out.push([p.x, p.y]); }
      return (L.samples = out);
    }
    function collect() {
      if (options.check === false) return [];   // a figure whose own timeline swaps overlapping items
      relayout();
      var out = [], seen = {}, name = svg.id ? '#' + svg.id : 'svg';
      function add(msg, box, step) {
        if (seen[msg]) return; seen[msg] = 1;
        out.push({msg: name + ': ' + msg + (step != null ? ' (step ' + step + ')' : ''), box: box});
      }
      function checked(id) { return items[id] && !(items[id].o && items[id].o.check === false); }
      Object.keys(nodes).forEach(function (id) {
        var n = nodes[id]; if (n.o.ghost || !checked(id)) return;
        [].forEach.call(n.el.querySelectorAll('text'), function (t) {
          if (t.classList.contains('ed-outside')) return;   // a point's name, set below it
          var b = bboxOf(t); if (!b || !b.w) return;
          if (n.shape === 'choice' || n.shape === 'decision') {   // inside the diamond, not just its box
            var cx = n.x + n.w / 2, cy = n.y + n.h / 2, worst = 0;
            [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]].forEach(function (c) {
              worst = Math.max(worst, Math.abs(c[0] - cx) / (n.w / 2) + Math.abs(c[1] - cy) / (n.h / 2));
            });
            if (worst > 1.04) add('text "' + t.textContent + '" runs outside the diamond of node ' + id + ': make it wider or taller', b);
            return;
          }
          var over = Math.max(n.x + 2 - b.x, b.x + b.w - (n.x + n.w - 2), n.y + 1 - b.y, b.y + b.h - (n.y + n.h - 1));
          if (over > 1) add('text "' + t.textContent + '" runs ' + Math.round(over) + ' px outside node ' + id, b);
        });
        if (vb && !contains(vb, n)) add('node ' + id + ' is outside the viewBox', rectOf(n));
      });
      Object.keys(links).forEach(function (id) {
        var L = links[id]; if (L.lbox && vb && checked(id) && !contains(vb, L.lbox)) add('label of link ' + id + ' is outside the viewBox', L.lbox);
      });
      laneSets.forEach(function (LS) {   // a node outside its lane's band (its title column left out)
        LS.lanes.forEach(function (ln) {
          ln.members.forEach(function (id) {
            if (checked(id) && !contains(ln.area, nodes[id])) add('node ' + id + ' is outside its lane ' + ln.id, rectOf(nodes[id]));
          });
        });
      });
      (stepSets || [Object.keys(items)]).forEach(function (ids, k) {
        var V = {}, step = stepSets ? k : null;
        ids.forEach(function (id) { V[id] = 1; });
        ids.forEach(function (id) {   // a zone's label under a node
          if (!/\.label$/.test(id) || items[id].kind !== 'label') return;
          var t = items[id].el.querySelector('text'), lb = t && bboxOf(t); if (!lb || !lb.w) return;
          Object.keys(nodes).forEach(function (nid) {
            if (V[nid] && !nodes[nid].o.ghost && checked(nid) && inter(lb, nodes[nid], 1)) add('zone label ' + id + ' is under node ' + nid, lb, step);
          });
          Object.keys(links).forEach(function (lid) {
            var L = links[lid];
            if (V[lid] && checked(lid) && L.lbox && inter(lb, L.lbox, 1)) add('zone label ' + id + ' is under the label of link ' + lid, lb, step);
          });
        });
        var ns = Object.keys(nodes).filter(function (id) { return V[id] && !nodes[id].o.ghost && checked(id); });
        var ls = Object.keys(links).filter(function (id) { return V[id] && checked(id); });
        for (var i = 0; i < ns.length; i++) for (var j = i + 1; j < ns.length; j++) {
          var a = nodes[ns[i]], b = nodes[ns[j]];
          if (inter(a, b, 1) && !contains(a, b) && !contains(b, a)) add('nodes ' + ns[i] + ' and ' + ns[j] + ' overlap', rectOf(b), step);
          [[a, b, ns[i], ns[j]], [b, a, ns[j], ns[i]]].forEach(function (q) {   // a state on its composite's title
            if (q[0].tab && contains(q[0], q[1]) && inter(q[0].tab, q[1], 1)) add('node ' + q[3] + ' covers the title of composite ' + q[2], rectOf(q[1]), step);
          });
        }
        ls.forEach(function (lid, li) {
          var L = links[lid], A = nodes[L.from], B = nodes[L.to], pts = samples(L);
          ns.forEach(function (nid) {
            var n = nodes[nid];
            if (nid === L.from || nid === L.to || contains(n, A) || contains(n, B) || contains(A, n) || contains(B, n)) return;
            if (!n.o.title && n.o.icon) return;   // a symbol drawn on its wire (a one-line)
            for (var q = 0; q < pts.length; q++) {
              var p = pts[q];
              if (p[0] > n.x + 2 && p[0] < n.x + n.w - 2 && p[1] > n.y + 2 && p[1] < n.y + n.h - 2) { add('link ' + lid + ' crosses node ' + nid, rectOf(n), step); break; }
            }
          });
          if (!L.segs && L.p0 && (L.o.route || 'ortho') === 'straight' && Math.abs(L.p1[0] - L.p0[0]) > 1 && Math.abs(L.p1[1] - L.p0[1]) > 1)
            add('link ' + lid + ' is slanted: give it facing sides on nodes that share a span, or route it ortho', bboxOf(L.path), step);
          if (L.segs && !L.fan) for (var q = 1; q < L.segs.length - 1; q++) {   // a Z whose middle run is a few pixels: ends almost in line
            var g0 = L.segs[q - 1], g1 = L.segs[q], g2 = L.segs[q + 1], jl = Math.abs(g1[1][0] - g1[0][0]) + Math.abs(g1[1][1] - g1[0][1]);
            var par = (same(g0[0][0], g0[1][0]) && same(g2[0][0], g2[1][0])) || (same(g0[0][1], g0[1][1]) && same(g2[0][1], g2[1][1]));
            if (par && jl < 10) { add('link ' + lid + ' jogs ' + Math.round(jl) + ' px: put its ends in line', bboxOf(L.path), step); break; }
          }
          if (L.segs) foreignZones(L).forEach(function (z) {   // an ortho wire turning inside a zone it does not belong to
            if (!V[z.id]) return;
            for (var q = 1; q < L.segs.length; q++) if (inside(L.segs[q][0], z)) { add('link ' + lid + ' turns inside zone ' + z.id, z, step); break; }
          });
          if (!L.lbox) return;
          ns.forEach(function (nid) { if (inter(L.lbox, nodes[nid], 1) && !inComposite(nodes[nid], L.lbox)) add('label of link ' + lid + ' covers node ' + nid, L.lbox, step); });
          if (L.o._transition) ls.forEach(function (oid) {
            if (oid !== lid && onWire(L.lbox, links[oid])) add('label of transition ' + lid + ' lies on link ' + oid, L.lbox, step);
          });
          ls.slice(li + 1).forEach(function (oid) {
            if (links[oid].lbox && inter(L.lbox, links[oid].lbox, 1)) add('labels of links ' + lid + ' and ' + oid + ' overlap', L.lbox, step);
          });
        });
      });
      return out;
    }
    api.check = function () { return collect().map(function (i) { return i.msg; }); };
    function runCheck() {
      var found = collect();
      var old = svg.querySelector('.ed-debug'); if (old) old.remove();
      var g = el('g', {'class': 'ed-debug', 'aria-hidden': 'true'}, svg);
      found.forEach(function (i) {
        if (global.console) console.warn('[EdgeDiagram] ' + i.msg);
        if (i.box) el('rect', {x: i.box.x - 2, y: i.box.y - 2, width: i.box.w + 4, height: i.box.h + 4, rx: 4}, g);
      });
      ISSUES[self] = found.map(function (i) { return i.msg; });
      report('diagram:' + self, ISSUES[self]);
    }
    // labels measured before the web fonts arrived are placed again once they have
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      tabs.forEach(function (n) { n.retab(); });
      Object.keys(links).forEach(function (k) { if (links[k].lt) placeLabel(links[k]); });
      if (debug) setTimeout(runCheck, 0);
    });
    return api;
  }

  // the issues of every checked figure, EdgeDiagram's and EdgeSketch's, in one hidden <pre> that scripts/shot.sh --check reads
  function report(key, list) {
    var R = global.ED_ISSUES = global.ED_ISSUES || {};
    R[key] = list;
    var pre = document.getElementById('ed-issues');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'ed-issues'; pre.hidden = true; document.body.appendChild(pre); }
    var keys = Object.keys(R);
    pre.textContent = keys.map(function (k) { return R[k].join('\n'); }).filter(Boolean).join('\n');
    pre.setAttribute('data-diagrams', keys.length);
  }

  global.EdgeDiagram = {create: create, route: route, clearAll: clearAll, version: VERSION,
    issues: function () { var out = []; Object.keys(ISSUES).forEach(function (k) { out = out.concat(ISSUES[k]); }); return out; }};
})(window);
