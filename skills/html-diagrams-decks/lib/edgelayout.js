/* EdgeLayout v1.4.0 — automatic layout for EdgeDiagram: nodes and links declared without coordinates.
 *
 *   const d = EdgeDiagram.create(svg, {icons: SPRITE});
 *   d.zone('edge', {label: 'EDGE'});                              // no x, y: drawn around its nodes
 *   d.node('api', {icon: 'server', title: 'API', zone: 'edge'});  // no x, y; w and h are measured
 *   d.link('req', {from: ['web'], to: ['api'], arrow: 'end'});    // sides and positions chosen
 *   d.layout({dir: 'LR'});                                         // or let steps() / check() call it
 *
 * A layered (Sugiyama) layout, written for EdgeDiagram's ortho router:
 *   1. cycles are broken by reversing the edges a depth-first walk finds going back;
 *   2. ranks: longest path, then sources pulled down next to what they feed and nodes moved
 *      to the side with more edges; the ends of a fan share one rank;
 *   3. a link that spans several ranks gets a dummy in each, which keeps a lane open for it;
 *   4. order in each rank: barycentre sweeps down and up, then swaps of neighbours, from three
 *      starts, keeping the order with the fewest crossings; a zone's nodes stay together, zones
 *      in the order declared;
 *   5. position across the ranks: a node lines up with its median neighbour when it is that
 *      neighbour's median too (Brandes-Köpf style blocks), the blocks are packed left to right,
 *      then each is pulled to the median of its neighbours (a fan's source to the middle of its
 *      ends) as far as its neighbours in the rank allow, so straight runs stay straight;
 *      of two medians the one that leads on wins, and two alike are centred on;
 *   6. ranks are spaced by their tallest node, with room for zone pads, labels and lanes;
 *   7. every link gets the sides facing its next rank, and the ends sharing a side are placed
 *      across from what they join, in order, so the wires run straight where they can.
 * Pinned nodes (x and y given) stay where they are; the others are placed around them. Zones
 * without x and y are drawn around their nodes (node {zone: id} or zone {nodes: [ids]}).
 * Same input, same figure: every sort breaks ties by the order of declaration.
 *
 * d.layout(opts): dir 'TB' (default) or 'LR'; bands: true (each zone its own ranks, in the order
 * declared); rankSep, nodeSep, zonePad (20), margin (24); uniform: false (keep each box's own
 * depth); iterations (crossing sweeps, 12); order: 'input' (no crossing reduction, to compare);
 * fit: false (keep the viewBox). Afterwards d.layoutInfo holds {dir, ranks, crossings,
 * inputCrossings, width, height, order}.
 */
(function (global) {
  'use strict';
  var VERSION = '1.4.0';
  var LABEL = 22;   // room above a zone's nodes for its label

  function num(a, b) { return a - b; }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function median(list) {
    if (!list.length) return null;
    var s = list.slice().sort(num), m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function wrapLines(text, max) {   // as EdgeDiagram wraps a node's sub
    if (Array.isArray(text)) return text;
    var out = [], cur = '';
    String(text).split(/\s+/).forEach(function (w) {
      if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) out.push(cur);
    return out;
  }
  /* a generous estimate of a text's width, so a box fits before the web fonts arrive */
  function estimate(text, size) {
    var w = 0;
    String(text).split('').forEach(function (c) {
      w += /[il.,:;|!'`]/.test(c) ? 0.3 : /[fjrtI1 ()\[\]\-]/.test(c) ? 0.38 : /[mwMW@]/.test(c) ? 0.88 :
        /[A-Z]/.test(c) ? 0.66 : /[0-9]/.test(c) ? 0.56 : 0.54;
    });
    return w * size;
  }
  function measure(svg, text, size, cls, style) {
    var w = estimate(text, size);
    try {
      var t = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      t.setAttribute('class', cls); t.setAttribute('font-size', size); if (style) t.setAttribute('style', style);
      t.setAttribute('visibility', 'hidden'); t.textContent = text; svg.appendChild(t);
      w = Math.max(w, t.getComputedTextLength() * 1.06); svg.removeChild(t);
    } catch (e) { /* no layout engine: the estimate */ }
    return w;
  }
  /* a node's w and h from its text and icon, as EdgeDiagram draws them */
  function size(svg, o) {
    if (o.w != null && o.h != null) return;
    var pill = o.shape === 'pill', w, h;
    if (o.ghost) { w = 12; h = 12; }
    else if (!o.title && o.icon) { w = h = (o.iconSize || 32) + 8; }
    else {
      var ts = o.titleSize || (pill ? 13 : 17), ss = o.subSize || 12, sub = o.sub ? wrapLines(o.sub, o.subWrap || 44) : [];
      h = pill ? 34 : Math.max(o.icon ? 64 : 56, Math.ceil(ts + sub.length * (ss + 5) + 30));
      var is = o.iconSize || (pill ? 18 : Math.min(34, h * 0.42));
      var left = o.icon ? (pill ? 12 + is + 8 : 14 + is + 12) : 16;
      var tw = measure(svg, o.title || '', ts, 'ed-title', pill ? 'font-family:var(--ed-sans,"IBM Plex Sans",sans-serif)!important;font-weight:600' : null);
      sub.forEach(function (l) { tw = Math.max(tw, measure(svg, l, ss, 'ed-sub')); });
      if (o.align === 'center' && o.icon) left = 16 + is;   // centred text, the icon top-left
      w = Math.max(pill ? 0 : 120, Math.ceil((tw + left + 18) / 10) * 10);
    }
    if (o.w == null) o.w = w;
    if (o.h == null) o.h = h;
  }
  var OPP = {top: 'bottom', bottom: 'top', left: 'right', right: 'left'};

  function place(d, calls, opts) {
    opts = opts || {};
    var lr = String(opts.dir || 'TB').toUpperCase() === 'LR';
    var rankSep = opts.rankSep != null ? opts.rankSep : (lr ? 72 : 64);
    var nodeSep = opts.nodeSep != null ? opts.nodeSep : (lr ? 28 : 40);
    var pad = opts.zonePad != null ? opts.zonePad : 20, margin = opts.margin != null ? opts.margin : 24;
    var zoneGap = Math.max(16, nodeSep / 2);
    // the sides in each direction: toward the next rank, toward the previous, and across
    var AFTER = lr ? 'right' : 'bottom', BEFORE = lr ? 'left' : 'top', XAFTER = lr ? 'bottom' : 'right', XBEFORE = lr ? 'top' : 'left';

    /* ---------- the graph ---------- */
    var N = [], byId = {}, E = [], Z = [], zoneById = {}, fans = [];
    function addNode(id, o, held) {
      var pinned = o.x != null && o.y != null;
      var auto = held && !pinned && (lr ? o.w : o.h) == null && !o.ghost && o.shape !== 'pill' && !!o.title;
      if (held && !pinned) size(d.svg, o);
      var n = {id: id, o: o, idx: N.length, real: true, held: held, pinned: pinned, auto: auto, zone: null, up: [], down: [], flat: [],
        cs: lr ? o.h : o.w, ms: lr ? o.w : o.h};
      if (pinned) { n.pc = lr ? o.y + o.h / 2 : o.x + o.w / 2; n.pm = lr ? o.x + o.w / 2 : o.y + o.h / 2; }
      N.push(n); byId[id] = n;
      return n;
    }
    calls.forEach(function (c) {
      if (c.kind === 'node') addNode(c.id, c.o, true);
      else if (c.kind === 'zone' && (c.o.x == null || c.o.y == null)) {
        var z = {id: c.id, o: c.o, idx: Z.length, members: [], spacers: []};
        Z.push(z); zoneById[c.id] = z;
      }
    });
    function nodeOf(id, what) {
      if (byId[id]) return byId[id];
      var it = d.items[id];   // a node drawn before the layout: pinned
      if (it && it.kind === 'node') return addNode(id, it.o, false);
      throw new Error('EdgeLayout: ' + what + ' needs existing nodes (' + id + ')');
    }
    function end(e) { return typeof e === 'string' ? [e] : (e || []).slice(); }
    calls.forEach(function (c) {
      if (c.kind === 'link' || c.kind === 'transition') {
        c.o.from = end(c.o.from); c.o.to = end(c.o.to);
        var u = nodeOf(c.o.from[0], 'link ' + c.id), v = nodeOf(c.o.to[0], 'link ' + c.id);
        var lo = c.o;   // a transition's label is made of its event, guard and action: room for that
        if (c.kind === 'transition' && !c.o.label && (c.o.event || c.o.guard || c.o.action))
          lo = Object.assign({}, c.o, {label: [c.o.event, c.o.guard && '[' + c.o.guard + ']', c.o.action && '/ ' + c.o.action].filter(Boolean).join(' ')});
        if (u !== v) E.push({idx: E.length, u: u, v: v, o: lo, ends: [c.o.from, c.o.to]});
      } else if (c.kind === 'fan') {
        var into = Array.isArray(c.o.from[0]), sh = end(into ? c.o.to : c.o.from), many = (into ? c.o.from : c.o.to).map(end);
        if (into) { c.o.to = sh; c.o.from = many; } else { c.o.from = sh; c.o.to = many; }
        var F = {o: c.o, into: into, shared: nodeOf(sh[0], 'fan ' + c.id), sh: sh, many: many, ends: []};
        many.forEach(function (m) {
          var x = nodeOf(m[0], 'fan ' + c.id);
          F.ends.push(x);
          if (x !== F.shared) E.push({idx: E.length, u: into ? x : F.shared, v: into ? F.shared : x, fan: F});
        });
        fans.push(F);
      }
    });
    N.forEach(function (n) {
      var zid = n.o.zone;
      Z.forEach(function (z) { if ((z.o.nodes || []).indexOf(n.id) >= 0) zid = z.id; });
      if (zid && zoneById[zid]) { n.zone = zoneById[zid]; n.zone.members.push(n); }
    });

    /* ---------- 1. cycles ---------- */
    // with bands, a link between two zones runs from the zone declared first to the later one
    var bands = !!opts.bands, out = {};
    if (bands) E.forEach(function (e) { if (e.u.zone && e.v.zone && e.u.zone.idx > e.v.zone.idx) e.rev = true; });
    N.forEach(function (n) { out[n.idx] = []; });
    E.forEach(function (e) { out[(e.rev ? e.v : e.u).idx].push(e); });
    var state = {};
    function dfs(n) {
      state[n.idx] = 1;
      out[n.idx].forEach(function (e) {
        var t = e.rev ? e.u : e.v;
        if (state[t.idx] === 1) e.rev = !e.rev;
        else if (!state[t.idx]) dfs(t);
      });
      state[n.idx] = 2;
    }
    N.forEach(function (n) { if (!state[n.idx]) dfs(n); });
    E.forEach(function (e) { e.a = e.rev ? e.v : e.u; e.b = e.rev ? e.u : e.v; });

    /* ---------- 2. ranks ---------- */
    var preds = {}, succs = {};
    N.forEach(function (n) { preds[n.idx] = []; succs[n.idx] = []; });
    E.forEach(function (e) { succs[e.a.idx].push(e.b); preds[e.b.idx].push(e.a); });
    if (bands) {   // every node of a zone below every node of the zone declared before it
      var full = Z.filter(function (z) { return z.members.length; });
      for (var zi = 1; zi < full.length; zi++) full[zi - 1].members.forEach(function (a) {
        full[zi].members.forEach(function (b) { succs[a.idx].push(b); preds[b.idx].push(a); });
      });
    }
    var topo = [], indeg = {};
    N.forEach(function (n) { indeg[n.idx] = preds[n.idx].length; });
    var ready = N.filter(function (n) { return !indeg[n.idx]; });
    while (ready.length) {
      ready.sort(function (p, q) { return p.idx - q.idx; });
      var n0 = ready.shift(); topo.push(n0);
      succs[n0.idx].forEach(function (s) { if (!--indeg[s.idx]) ready.push(s); });
    }
    N.forEach(function (n) { if (topo.indexOf(n) < 0) topo.push(n); });   // a cycle left through the bands
    var minRank = {};
    function longest() {
      topo.forEach(function (n) {
        var r = n.o.rank != null ? n.o.rank : 0;
        if (minRank[n.idx] != null) r = Math.max(r, minRank[n.idx]);
        preds[n.idx].forEach(function (p) { if (p.rank != null) r = Math.max(r, p.rank + 1); });
        n.rank = r;
      });
    }
    longest();
    for (var it = 0; it < 4; it++) N.forEach(function (n) {   // toward the side with more edges, sources next to what they feed
      if (n.o.rank != null) return;
      var P = preds[n.idx], S = succs[n.idx];
      var np = E.filter(function (e) { return e.b === n; }).length, ns = E.filter(function (e) { return e.a === n; }).length;
      var lo = P.length ? Math.max.apply(null, P.map(function (p) { return p.rank + 1; })) : -Infinity;
      var hi = S.length ? Math.min.apply(null, S.map(function (s) { return s.rank - 1; })) : Infinity;
      if (ns > np && hi < Infinity) n.rank = hi;
      else if (np > ns && lo > -Infinity) n.rank = lo;
    });
    // a fan's ends share a rank, one rank from its source when the graph allows
    for (it = 0; it < 6; it++) {
      var moved = false;
      fans.forEach(function (F) {
        var top = Math.max.apply(null, F.ends.map(function (x) { return x.rank; }));
        F.ends.forEach(function (x) { if (x.rank < top) { minRank[x.idx] = top; moved = true; } });
      });
      if (!moved) break;
      N.forEach(function (n) { minRank[n.idx] = Math.max(minRank[n.idx] || 0, n.rank); });
      longest();
    }
    fans.forEach(function (F) {
      var S = F.shared, k = F.ends[0].rank;
      if (!F.into) {
        var hi = Math.min.apply(null, succs[S.idx].map(function (s) { return s.rank - 1; }));
        if (S.o.rank == null && hi > S.rank && hi <= k - 1) S.rank = hi;
      } else {
        var lo = Math.max.apply(null, preds[S.idx].map(function (p) { return p.rank + 1; }));
        if (S.o.rank == null && lo < S.rank) S.rank = lo;
      }
    });
    var r0 = Math.min.apply(null, N.map(function (n) { return n.rank; }));
    N.forEach(function (n) { n.rank -= r0; });
    var R = Math.max.apply(null, N.map(function (n) { return n.rank; })) + 1;
    E.forEach(function (e) { if (e.a.rank > e.b.rank) { e.rev = !e.rev; e.a = e.rev ? e.v : e.u; e.b = e.rev ? e.u : e.v; } });

    /* ---------- 3. dummies, and spacers that keep a zone whole in a rank it skips ---------- */
    var layers = [], all = N.slice(), back = {};
    for (var r = 0; r < R; r++) layers.push([]);
    function dummy(rank, zone, key, spacer) {
      var x = {id: '~' + all.length, idx: all.length, real: false, rank: rank, zone: zone, cs: 0, ms: 0, up: [], down: [], flat: [], key: key, spacer: spacer};
      all.push(x);
      return x;
    }
    E.forEach(function (e) {
      var chain = [e.a];
      if (e.a.rank !== e.b.rank) {
        var z = e.a.zone === e.b.zone ? e.a.zone : null;
        for (var k = e.a.rank + 1; k < e.b.rank; k++) {
          var dm = chain[chain.push(dummy(k, z, e.a.idx + 0.5)) - 1];
          if (e.o && e.o.label) dm.cs = lr ? 20 : measure(d.svg, e.o.label, 11.5, 'ed-llabel') + 12;   // room for the label beside the lane
        }
      }
      chain.push(e.b);
      e.chain = chain;
      e.path = e.rev ? chain.slice().reverse() : chain;   // from the link's source to its target
      if (e.a.rank === e.b.rank) { e.a.flat.push(e.b); e.b.flat.push(e.a); return; }
      for (var i = 0; i < chain.length - 1; i++) {
        chain[i].down.push(chain[i + 1]); chain[i + 1].up.push(chain[i]);
        if (e.rev) back[chain[i].idx + ',' + chain[i + 1].idx] = 1;
      }
    });
    Z.forEach(function (z) {
      if (!z.members.length) return;
      var rs = z.members.map(function (m) { return m.rank; });
      z.r0 = Math.min.apply(null, rs); z.r1 = Math.max.apply(null, rs);
      for (var k = z.r0; k <= z.r1; k++) if (rs.indexOf(k) < 0) {
        var s = dummy(k, z, Math.min.apply(null, z.members.map(function (m) { return m.idx; })) + 0.25, true);
        z.spacers.push(s);
      }
    });
    all.forEach(function (n) { if (n.rank != null) layers[n.rank].push(n); });

    if (opts.uniform !== false) layers.forEach(function (L) {   // boxes of one rank as deep as each other: even columns
      var ns = L.filter(function (v) { return v.auto; }), m = Math.max.apply(null, [0].concat(ns.map(function (v) { return v.ms; })));
      ns.forEach(function (v) { v.ms = m; if (lr) v.o.w = m; else v.o.h = m; });
    });

    /* ---------- 4. order ---------- */
    function arrange(layer, keyOf) {   // sort by key; a zone's nodes together, zones in their declared order
      var items = [], blocks = {};
      layer.forEach(function (v, i) {
        var k = keyOf(v, i); v._k = k == null ? i : k; v._i = i;
        if (v.zone) {
          var b = blocks[v.zone.id];
          if (!b) { b = blocks[v.zone.id] = {zone: v.zone, list: [], i: i}; items.push(b); }
          b.list.push(v);
        } else items.push({list: [v], k: v._k, i: i});
      });
      var zb = items.filter(function (b) { return b.zone; });
      zb.forEach(function (b) { b.k = b.list.reduce(function (s, v) { return s + v._k; }, 0) / b.list.length; });
      var ks = zb.map(function (b) { return b.k; }).sort(num);
      zb.sort(function (p, q) { return p.zone.idx - q.zone.idx; }).forEach(function (b, j) { b.k = ks[j]; });
      items.sort(function (p, q) { return p.k - q.k || p.i - q.i; });
      var res = [];
      items.forEach(function (b) {
        b.list.sort(function (p, q) { return p._k - q._k || p._i - q._i; });
        res = res.concat(b.list);
      });
      res.forEach(function (v, i) { v.pos = i; });
      return res;
    }
    function crossings() {
      var c = 0;
      for (var r = 0; r < R - 1; r++) {
        var segs = [];
        layers[r].forEach(function (v) { v.down.forEach(function (w) { segs.push([v.pos, w.pos]); }); });
        for (var i = 0; i < segs.length; i++) for (var j = i + 1; j < segs.length; j++)
          if ((segs[i][0] - segs[j][0]) * (segs[i][1] - segs[j][1]) < 0) c++;
      }
      return c;
    }
    layers = layers.map(function (L) {
      return arrange(L, function (v) { return v.real ? v.idx : v.key; });
    });
    var inputCrossings = crossings(), best = layers.map(function (L) { return L.slice(); }), bestC = inputCrossings;
    function bary(v, side) {
      var ns = v[side]; if (!ns.length) return null;
      return ns.reduce(function (s, w) { return s + w.pos; }, 0) / ns.length;
    }
    function pairCross(a, b) {   // crossings between a's and b's edges with a left of b
      var c = 0;
      ['up', 'down'].forEach(function (s) {
        a[s].forEach(function (x) { b[s].forEach(function (y) { if (x.pos > y.pos) c++; }); });
      });
      return c;
    }
    function transpose() {
      for (var pass = 0; pass < 4; pass++) {
        var better = false;
        layers.forEach(function (L) {
          for (var i = 0; i < L.length - 1; i++) {
            var a = L[i], b = L[i + 1];
            if (a.zone !== b.zone) continue;
            if (pairCross(a, b) > pairCross(b, a)) { L[i] = b; L[i + 1] = a; a.pos = i + 1; b.pos = i; better = true; }
          }
        });
        if (!better) break;
      }
    }
    if (opts.order !== 'input' && R > 1) {
      var iters = opts.iterations != null ? opts.iterations : 12, input = best;
      // sweeps from three starts: the order declared, and depth-first walks along the links from
      // the first source and from the last
      var walks = [false, true].map(function (rev) {
        var seen = {}, walk = 0, list = rev ? all.slice().reverse() : all;
        function visit(v) {
          if (seen[v.idx] != null) return; seen[v.idx] = walk++;
          (rev ? v.down.slice().reverse() : v.down).forEach(visit);
        }
        list.filter(function (v) { return v.real && !v.up.length; }).forEach(visit);
        list.forEach(visit);
        return input.map(function (L) { return arrange(L, function (v) { return seen[v.idx]; }); });
      });
      [input].concat(walks).forEach(function (start) {
        if (!bestC) return;
        layers = start.map(function (L) { return L.slice(); });
        layers.forEach(function (L) { L.forEach(function (v, i) { v.pos = i; }); });
        var c0 = crossings();
        if (c0 < bestC) { bestC = c0; best = layers.map(function (L) { return L.slice(); }); }
        for (it = 0; it < iters && bestC; it++) {
          if (it % 2 === 0) for (r = 1; r < R; r++) layers[r] = arrange(layers[r], function (v) { return bary(v, 'up'); });
          else for (r = R - 2; r >= 0; r--) layers[r] = arrange(layers[r], function (v) { return bary(v, 'down'); });
          transpose();
          var c = crossings();
          if (c < bestC) { bestC = c; best = layers.map(function (L) { return L.slice(); }); }
        }
      });
      layers = best;
      layers.forEach(function (L) { L.forEach(function (v, i) { v.pos = i; }); });
    }

    /* ---------- 5. position across the ranks ---------- */
    Z.forEach(function (z) {   // the pads around a zone's nodes, wide enough for its label
      var lw = z.o.label ? measure(d.svg, z.o.label, z.o.labelSize || 11, 'ed-zlabel') + 36 : 0, row = 0, span = 0;
      for (var k = z.r0; k <= z.r1; k++) {
        var ms = z.members.filter(function (m) { return m.rank === k; });
        row = Math.max(row, ms.reduce(function (s, m) { return s + m.cs; }, 0) + Math.max(0, ms.length - 1) * nodeSep);
        span += Math.max.apply(null, [0].concat(ms.map(function (m) { return m.ms; }))) + (k > z.r0 ? rankSep : 0);
      }
      var wide = function (have) { return Math.max(pad, Math.ceil((lw - have) / 2)); };
      // across: before (the label's side in LR) and after; along the ranks: before (the label's side in TB) and after
      if (lr) { z.xb = pad + (z.o.label ? LABEL : 0); z.xa = pad; z.mb = z.ma = wide(span); }
      else { z.xb = z.xa = wide(row); z.mb = pad + (z.o.label ? LABEL : 0); z.ma = pad; }
    });
    if (!lr) Z.forEach(function (z) {   // TB: a wire entering the zone from above stays clear of its label (top-left)
      if (!z.o.label || z.o.labelPos) return;
      var tw = measure(d.svg, z.o.label, z.o.labelSize || 11, 'ed-zlabel'), at = 0, prev = null;
      layers[z.r0].filter(function (v) { return v.zone === z; }).forEach(function (v) {
        at += prev ? gap(prev, v) : 0; prev = v;
        var ins = v.up.filter(function (w) { return w.zone !== z; }).length;
        if (ins) z.xb = Math.max(z.xb, Math.ceil(18 + tw + 12 - (at + (ins > 1 ? v.cs / 4 : v.cs / 2))));   // the label starts 18 in
        at += v.cs;
      });
    });
    function gap(p, q) {   // between neighbours p and q (p first) in a rank, edge to edge
      if (p.zone === q.zone) return (!p.real && !q.real) ? Math.max(14, nodeSep / 3) : (!p.real || !q.real) ? nodeSep / 2 : nodeSep;
      return (p.zone ? p.zone.xa : 0) + (q.zone ? q.zone.xb : 0) + zoneGap;
    }
    function members(v) { return v.zone ? v.zone.members.concat(v.zone.spacers) : [v]; }
    function compatible(block, v) {   // v may share a block's line without a zone having to hold a stranger
      if (v.pinned && block.fixed != null) return false;
      return block.nodes.every(function (m) {
        if (m.zone === v.zone) return true;
        var inZ = function (z, k) { return z && k >= z.r0 && k <= z.r1; };
        return !inZ(m.zone, v.rank) && !inZ(v.zone, m.rank);
      });
    }
    var fanPair = {};   // a fan's source is centred over its ends, so it lines up with none of them
    fans.forEach(function (F) {
      if (F.ends.length > 1) F.ends.forEach(function (x) { fanPair[F.shared.idx + ',' + x.idx] = fanPair[x.idx + ',' + F.shared.idx] = 1; });
    });
    /* the median neighbours on one side, forward links before links of a broken cycle, and of two
       medians the one that leads on to more first, so a chain goes on straight and a branch bends */
    var reached = {};
    function reach(v, side) {
      var k = v.idx + side;
      if (reached[k] == null) { reached[k] = 0; reached[k] = v[side].reduce(function (s, w) { return s + 1 + reach(w, side); }, 0); }
      return reached[k];
    }
    function medians(v, side) {
      var list = v[side].filter(function (w) { return !back[side === 'down' ? v.idx + ',' + w.idx : w.idx + ',' + v.idx]; });
      if (!list.length) list = v[side].slice();
      list.sort(function (p, q) { return p.pos - q.pos; });
      if (!list.length) return [];
      var m = (list.length - 1) / 2, a = list[Math.floor(m)], b = list[Math.ceil(m)];
      if (a === b) return [a];
      var ra = reach(a, side), rb = reach(b, side);
      return ra === rb ? [] : rb > ra ? [b, a] : [a, b];   // two alike: line up with neither, sit between them
    }
    function solve(alignOn) {
      var blocks = [];
      all.forEach(function (v) { v.block = null; v.alignedDown = false; });
      layers.forEach(function (L) {
        var last = -1;
        L.forEach(function (v) {
          if (alignOn && v.up.length) {   // v joins the block of its median upper neighbour
            var cands = medians(v, 'up');
            for (var i = 0; i < cands.length; i++) {
              var u = cands[i];
              if (u.alignedDown || u.pos <= last) continue;
              var dm = medians(u, 'down');
              if (dm[0] !== v && (dm.length < 2 || dm[1] !== v || reach(dm[0], 'down') > reach(v, 'down'))) continue;   // a median both ways
              if (!compatible(u.block, v) || fanPair[u.idx + ',' + v.idx]) continue;
              u.alignedDown = true; last = u.pos; v.block = u.block; u.block.nodes.push(v);
              if (v.pinned) u.block.fixed = v.pc;
              return;
            }
          }
          v.block = {idx: blocks.length, nodes: [v], fixed: v.pinned ? v.pc : null, ins: [], outs: []};
          blocks.push(v.block);
        });
      });
      // constraints: each node after its left neighbour; a zone's whole extent clear of its neighbours
      var cons = {};
      function need(a, b, sep) {
        if (a.block === b.block) { cons.bad = true; return; }
        var k = a.block.idx + ',' + b.block.idx;
        if (!cons[k] || cons[k].sep < sep) cons[k] = {a: a.block, b: b.block, sep: sep};
      }
      layers.forEach(function (L) {
        for (var i = 0; i < L.length - 1; i++) {
          var p = L[i], q = L[i + 1], g = gap(p, q);
          need(p, q, (p.cs + q.cs) / 2 + g);
          if (p.zone !== q.zone) members(p).forEach(function (a) { members(q).forEach(function (b) { need(a, b, (a.cs + b.cs) / 2 + g); }); });
        }
      });
      if (cons.bad) return null;
      delete cons.bad;
      var list = Object.keys(cons).map(function (k) { return cons[k]; });
      list.forEach(function (c) { c.a.outs.push(c); c.b.ins.push(c); });
      // pack left to right in topological order
      var deg = blocks.map(function (b) { return b.ins.length; }), q = blocks.filter(function (b) { return !b.ins.length; }), order = [];
      while (q.length) {
        q.sort(function (a, b) { return a.idx - b.idx; });
        var b = q.shift(); order.push(b);
        b.outs.forEach(function (c) { if (!--deg[c.b.idx]) q.push(c.b); });
      }
      if (order.length < blocks.length) return null;   // a cycle: zones that cannot all be kept whole
      order.forEach(function (b) {
        var lo = b.ins.reduce(function (m, c) { return Math.max(m, c.a.x + c.sep); }, b.ins.length ? -Infinity : 0);
        b.x = b.fixed != null ? b.fixed : lo;
      });
      // then pull each block to the median of its neighbours, within what its neighbours allow
      function target(b) {
        for (var f = 0; f < fans.length; f++) if (b.nodes.indexOf(fans[f].shared) >= 0 && !fans[f].shared.pinned) {
          var xs = fans[f].ends.map(function (x) { return x.block.x; });
          return (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        }
        var ts = [];
        b.nodes.forEach(function (v) {
          v.up.concat(v.down).forEach(function (w) { if (w.block !== b) ts.push(w.block.x); });
          if (v.spacer) ts.push(v.zone.members.reduce(function (s, m) { return s + m.block.x; }, 0) / v.zone.members.length);
        });
        return median(ts);
      }
      for (var pass = 0; pass < 12; pass++) {
        var seq = pass % 2 ? order.slice().reverse() : order;
        seq.forEach(function (b) {
          if (b.fixed != null) return;
          var t = target(b); if (t == null) return;
          var lo = b.ins.reduce(function (m, c) { return Math.max(m, c.a.x + c.sep); }, -Infinity);
          var hi = b.outs.reduce(function (m, c) { return Math.min(m, c.b.x - c.sep); }, Infinity);
          if (lo <= hi) b.x = clamp(t, lo, hi);
        });
      }
      // a fan's source over the middle of its ends, and a node over the branches only it feeds (or
      // under those that feed only it): move the one, else the many together
      function centre(one, many, oneFirst) {
        var S = one.block, ends = [], xs = many.map(function (x) { if (ends.indexOf(x.block) < 0) ends.push(x.block); return x.block.x; });
        if (ends.indexOf(S) >= 0) return;
        var mid = (Math.min.apply(null, xs) + Math.max.apply(null, xs)) / 2;
        function moveOne() {
          if (S.fixed != null) return;
          var lo = S.ins.reduce(function (m, c) { return Math.max(m, c.a.x + c.sep); }, -Infinity);
          var hi = S.outs.reduce(function (m, c) { return Math.min(m, c.b.x - c.sep); }, Infinity);
          if (lo <= hi) S.x = clamp(mid, lo, hi);
        }
        function moveMany() {
          var want = S.x - mid, dl = -Infinity, dh = Infinity;
          ends.forEach(function (b) {
            if (b.fixed != null) { dl = dh = 0; return; }
            b.ins.forEach(function (c) { if (ends.indexOf(c.a) < 0) dl = Math.max(dl, c.a.x + c.sep - b.x); });
            b.outs.forEach(function (c) { if (ends.indexOf(c.b) < 0) dh = Math.min(dh, c.b.x - c.sep - b.x); });
          });
          if (dl <= dh && Math.abs(want) > 0.5) { var dx = clamp(want, Math.min(0, dl), Math.max(0, dh)); ends.forEach(function (b) { b.x += dx; }); mid += dx; }
        }
        if (oneFirst) { moveOne(); moveMany(); } else { moveMany(); moveOne(); }
      }
      fans.forEach(function (F) { centre(F.shared, F.ends, true); });
      all.forEach(function (v) {
        if (!v.real || fans.some(function (F) { return F.shared === v; })) return;
        [['down', 'up'], ['up', 'down']].forEach(function (s) {
          var ns = v[s[0]];
          if (ns.length > 1 && ns.every(function (w) { return w[s[1]].length === 1 && w.block !== v.block; })) centre(v, ns, false);
        });
      });
      return blocks;
    }
    if (!solve(true) && !solve(false)) {   // zones cannot be kept clear: pack each rank on its own
      layers.forEach(function (L) {
        var x = 0;
        L.forEach(function (v, i) { if (i) x += (L[i - 1].cs + v.cs) / 2 + gap(L[i - 1], v); v.block = {x: v.pinned ? v.pc : x}; });
      });
    }
    all.forEach(function (v) { v.c = v.block.x; });

    /* ---------- 6. position along the ranks ---------- */
    var half = [], mpos = [];
    for (r = 0; r < R; r++) half.push(Math.max.apply(null, [0].concat(layers[r].map(function (v) { return v.ms / 2; }))));
    function lane(e) {   // the run a link's label needs in the gap: a fan's sits on its trunk, half the gap
      var t = e.o ? e.o.label : e.fan.o.label; if (!t) return 0;
      var w = lr ? measure(d.svg, t, 11.5, 'ed-llabel') + 8 : 24;
      return e.fan ? 2 * w + 32 : w + 40;
    }
    for (r = 0; r < R; r++) {
      if (!r) { mpos.push(0); continue; }
      var g = rankSep, bent = 0, lab = 0;
      layers[r - 1].forEach(function (v) { v.down.forEach(function (w) { if (Math.abs(v.c - w.c) > 1) bent++; }); });
      E.forEach(function (e) {   // a label sits on the wire: in LR across the gap, in TB along it
        var lo = Math.min(e.a.rank, e.b.rank), hi = Math.max(e.a.rank, e.b.rank);
        if (lo <= r - 1 && hi >= r) lab = Math.max(lab, lane(e));
      });
      g = Math.max(g, lab) + Math.max(0, bent - 2) * 8;
      var za = 0, zb = 0;
      Z.forEach(function (z) { if (z.r1 === r - 1) za = Math.max(za, z.ma); if (z.r0 === r) zb = Math.max(zb, z.mb); });
      g += za + zb + (za && zb ? zoneGap / 2 : 0);
      mpos.push(mpos[r - 1] + half[r - 1] + g + half[r]);
    }
    var pinnedRanks = N.filter(function (n) { return n.pinned; }).sort(function (p, q) { return p.rank - q.rank || p.idx - q.idx; });
    if (pinnedRanks.length) {
      var first = pinnedRanks[0], shift = first.pm - mpos[first.rank];
      mpos = mpos.map(function (m) { return m + shift; });
      pinnedRanks.forEach(function (n) {
        var dlt = n.pm - mpos[n.rank];
        if (dlt > 0) for (var k = n.rank; k < R; k++) mpos[k] += dlt;
      });
    }
    all.forEach(function (v) { v.m = v.pinned ? v.pm : mpos[v.rank]; });

    /* ---------- the figure: nodes, zones, viewBox ---------- */
    var moving = !N.some(function (n) { return n.pinned; }) && !Object.keys(d.items).length;
    function rect(v) {
      var x = lr ? v.m - v.ms / 2 : v.c - v.cs / 2, y = lr ? v.c - v.cs / 2 : v.m - v.ms / 2;
      return {x: x, y: y, w: lr ? v.ms : v.cs, h: lr ? v.cs : v.ms};
    }
    var boxes = [];
    N.forEach(function (n) { if (!n.pinned) { var b = rect(n); n.o.x = b.x; n.o.y = b.y; } boxes.push(n.o); });
    Z.forEach(function (z) {
      if (!z.members.length) return;
      var cl = Infinity, ch = -Infinity;
      z.members.concat(z.spacers).forEach(function (v) { cl = Math.min(cl, v.c - v.cs / 2); ch = Math.max(ch, v.c + v.cs / 2); });
      var ml = mpos[z.r0] - half[z.r0] - z.mb, mh = mpos[z.r1] + half[z.r1] + z.ma;
      z.members.forEach(function (v) { if (v.pinned) { ml = Math.min(ml, v.m - v.ms / 2 - z.mb); mh = Math.max(mh, v.m + v.ms / 2 + z.ma); } });
      cl -= z.xb; ch += z.xa;
      z.o.x = lr ? ml : cl; z.o.y = lr ? cl : ml; z.o.w = lr ? mh - ml : ch - cl; z.o.h = lr ? ch - cl : mh - ml;
      boxes.push(z.o);
    });
    calls.forEach(function (c) { if (c.kind === 'zone' && !zoneById[c.id] && c.o.x != null) boxes.push(c.o); });
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    all.forEach(function (v) { if (!v.real && v.cs) { var b = rect(v); boxes.push({x: b.x - 8, y: b.y, w: b.w + 16, h: b.h}); } });
    boxes.forEach(function (b) { if (b.x == null) return; x0 = Math.min(x0, b.x); y0 = Math.min(y0, b.y); x1 = Math.max(x1, b.x + b.w); y1 = Math.max(y1, b.y + b.h); });
    var dx = moving ? margin - x0 : 0, dy = moving ? margin - y0 : 0;
    N.forEach(function (n) { if (!n.pinned) { n.o.x = Math.round(n.o.x + dx); n.o.y = Math.round(n.o.y + dy); } });
    Z.forEach(function (z) { if (z.members.length) { z.o.x = Math.round(z.o.x + dx); z.o.y = Math.round(z.o.y + dy); z.o.w = Math.round(z.o.w); z.o.h = Math.round(z.o.h); } });
    all.forEach(function (v) { v.c += lr ? dy : dx; v.m += lr ? dx : dy; });
    x0 += dx; x1 += dx; y0 += dy; y1 += dy;
    var W = Math.ceil(x1 + margin - (moving ? 0 : x0 - margin)), H = Math.ceil(y1 + margin - (moving ? 0 : y0 - margin));
    if (opts.fit !== false && isFinite(x0)) {
      var vx = moving ? 0 : Math.floor(x0 - margin), vy = moving ? 0 : Math.floor(y0 - margin);
      d.svg.setAttribute('viewBox', vx + ' ' + vy + ' ' + W + ' ' + H);
    }

    /* ---------- 7. sides and ends ---------- */
    function given(s) { return s && s !== 'auto'; }
    function sides(e) {   // [side at the source, side at the target]
      var ru = e.u.rank, rv = e.v.rank, s;
      if (ru < rv) s = [AFTER, BEFORE];
      else if (ru > rv) s = [BEFORE, AFTER];
      else return e.u.c <= e.v.c ? [XAFTER, XBEFORE] : [XBEFORE, XAFTER];
      // a long link whose lane runs beside its end, with nothing between, leaves by that side: an L, not a Z
      [0, 1].forEach(function (k) {
        var n = k ? e.v : e.u, lane = k ? e.path[e.path.length - 2] : e.path[1];
        if (e.path.length < 3 || n.pinned) return;
        var left = lane.c < n.c - n.cs / 2, right = lane.c > n.c + n.cs / 2;
        if (!left && !right) return;
        var lo = Math.min(lane.c, n.c), hi = Math.max(lane.c, n.c);
        if (layers[n.rank].some(function (w) { return w !== n && w.real && w.c > lo && w.c < hi; })) return;
        s[k] = left ? XBEFORE : XAFTER;
      });
      return s;
    }
    var ports = {};
    function centre(v, along) { return along ? (lr ? v.m : v.c) : (lr ? v.c : v.m); }   // physical x, or y
    E.forEach(function (e) {
      if (e.fan) return;
      var s = sides(e);
      [0, 1].forEach(function (k) {
        var arr = e.ends[k], n = k ? e.v : e.u;
        if (!given(arr[1])) arr[1] = s[k];
        if (typeof arr[2] === 'number') return;
        arr.length = 2;
        if (n.o.ghost) return;
        var horiz = arr[1] === 'top' || arr[1] === 'bottom', next = k ? e.path[e.path.length - 2] : e.path[1];
        var key = n.id + '|' + arr[1];
        (ports[key] = ports[key] || {n: n, horiz: horiz, list: []}).list.push({e: e, k: k, arr: arr, key: centre(next, horiz), next: next});
      });
    });
    function spreadSide(P, follow) {   // ends on one side: across from what they join, in order, apart
      var o = P.n.o, lo = P.horiz ? o.x : o.y, len = P.horiz ? o.w : o.h, m = Math.min(12, len / 4), k = P.list.length;
      P.list.forEach(function (p) {
        var q = follow && otherPort(p);
        p.want = q != null ? q : p.key;
      });
      P.list.sort(function (a, b) { return a.want - b.want || a.e.idx - b.e.idx; });
      // apart by 24, or by half of each label when the wires carry labels side by side
      var lw = P.list.map(function (p) { var t = p.e.o && p.e.o.label; return !t ? 0 : P.horiz ? measure(d.svg, t, 11.5, 'ed-llabel') + 12 : 22; });
      var gaps = P.list.map(function (p, i) { return i ? Math.max(24, (lw[i - 1] + lw[i]) / 2) : 0; });
      var sum = gaps.reduce(function (s, g) { return s + g; }, 0), fit = sum > len - 2 * m ? (len - 2 * m) / sum : 1;
      gaps = gaps.map(function (g) { return g * fit; });
      P.list.forEach(function (p, i) { p.p = clamp(p.want, lo + m, lo + len - m); if (i) p.p = Math.max(p.p, P.list[i - 1].p + gaps[i]); });
      for (var i = k - 1; i >= 0; i--) P.list[i].p = Math.min(P.list[i].p, i === k - 1 ? lo + len - m : P.list[i + 1].p - gaps[i + 1]);
      // ends pushed apart from one wanted point stay centred on it
      var mean = function (f) { return P.list.reduce(function (s, p) { return s + f(p); }, 0) / k; };
      var shift = clamp(mean(function (p) { return clamp(p.want, lo + m, lo + len - m); }) - mean(function (p) { return p.p; }),
        lo + m - P.list[0].p, lo + len - m - P.list[k - 1].p);
      P.list.forEach(function (p) { p.p += shift; });
      P.lo = lo; P.len = len; P.m = m;
    }
    function otherPort(p) {   // where the other end of a direct link sits on its side, if placed
      if (p.e.path.length !== 2) return null;
      var P = ports[p.next.id + '|' + p.e.ends[1 - p.k][1]];
      if (!P || P.list.length < 2) return null;
      for (var i = 0; i < P.list.length; i++) if (P.list[i].e === p.e && P.list[i].p != null) return P.list[i].p;
      return null;
    }
    var multi = Object.keys(ports).map(function (k) { return ports[k]; }).filter(function (P) { return P.list.length > 1; });
    multi.forEach(function (P) { spreadSide(P, false); });
    multi.sort(function (a, b) { return a.n.rank - b.n.rank || a.n.idx - b.n.idx; }).forEach(function (P) { spreadSide(P, true); });
    // a wire whose ends are a few units out of line would jog: move one end onto the other
    function canMove(P, p, v) {
      if (v < P.lo + P.m - 0.01 || v > P.lo + P.len - P.m + 0.01) return false;
      return P.list.every(function (q) { return q === p || Math.abs(q.p - v) >= 10 && (q.p - p.p) * (q.p - v) > 0; });
    }
    multi.forEach(function (P) {
      P.list.forEach(function (p) {
        var Q = ports[p.next.id + '|' + p.e.ends[1 - p.k][1]];
        if (p.e.path.length !== 2 || !Q || Q.list.length < 2) return;
        var q = Q.list.filter(function (x) { return x.e === p.e; })[0], dd = Math.abs(p.p - q.p);
        if (dd < 0.5 || dd >= 30) return;
        if (canMove(Q, q, p.p)) { q.p = p.p; return; }
        if (canMove(P, p, q.p)) { p.p = q.p; return; }
        // else far enough apart that the wire turns twice on purpose
        var tries = [[Q, q, p.p], [P, p, q.p]];
        for (var i = 0; i < 2; i++) {
          var A = tries[i][0], a = tries[i][1], o = tries[i][2];
          var c = [o - 30, o + 30, A.lo + A.m, A.lo + A.len - A.m].filter(function (v) { return Math.abs(v - o) >= 30 && canMove(A, a, v); });
          c.sort(function (u, v) { return Math.abs(u - a.p) - Math.abs(v - a.p); });
          if (c.length) { a.p = c[0]; return; }
        }
      });
    });
    multi.forEach(function (P) { P.list.forEach(function (p) { p.arr[2] = (p.p - P.lo) / P.len; }); });

    fans.forEach(function (F) {   // the trunk faces the ends; each end faces the trunk
      var S = F.shared, k = F.ends[0];
      var side = S.rank === k.rank ? (k.c >= S.c ? XAFTER : XBEFORE) : k.rank > S.rank ? AFTER : BEFORE;
      if (!given(F.sh[1])) F.sh[1] = side;
      F.many.forEach(function (m) { if (!given(m[1])) m[1] = OPP[F.sh[1]]; });
    });

    d.layoutInfo = {dir: lr ? 'LR' : 'TB', ranks: R, crossings: opts.order === 'input' ? inputCrossings : bestC,
      inputCrossings: inputCrossings, width: W, height: H,
      order: layers.map(function (L) { return L.map(function (v) { return v.real ? v.id : '~'; }); })};
    return d.layoutInfo;
  }

  global.EdgeLayout = {place: place, size: size, version: VERSION};
})(window);
