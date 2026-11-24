/* EdgeSequence v1.3.1 — sequence diagrams for single-file HTML pages and decks.
 *
 *   var q = EdgeSequence.create(svg, {icons: window.EDGE_ICONS});
 *   q.group('CENTRE', ['api', 'db']);                                   // a band over some actors' columns
 *   q.actor('web', {icon: 'desktop', title: 'Browser', sub: 'SPA'});
 *   q.actor('api', {icon: 'server', title: 'API', tone: 'accent'});
 *   q.msg('m1', {from: 'web', to: 'api', label: 'POST /orders', caption: 'The browser sends the write.'});
 *   q.self('m2', {at: 'api', label: 'validate'});
 *   q.msg('m3', {from: 'api', to: 'web', label: '202 Accepted', reply: true});
 *   q.note('n1', {over: ['web', 'api'], text: 'the browser never waits for the database'});
 *   q.frame('f1', {kind: 'alt', label: 'valid', from: 'm2', to: 'm3', else: [{at: 'm3', label: 'invalid'}]});
 *   var ctl = q.steps();          // one step per message and note, in order; or q.steps([{show: [ids], caption}])
 *
 * Actors sit in equal columns across the viewBox's width, with a dashed lifeline below each. Every
 * message is one horizontal row, numbered, with its label above the arrow; a reply is dashed; a
 * message to an actor starts an activation bar on it and the reply from that actor ends it. Frames
 * (alt, opt, loop, par, or any word) box a run of messages across the columns they touch. The
 * viewBox's height follows the content.
 *
 * Steps: step 0 shows the actors; each later step shows its messages, the current ones drawn
 * thicker with a packet travelling along them. Forward steps animate with CSS transitions, back
 * steps jump; reduced motion never animates. ctl.timeline is a paused GSAP timeline with labels
 * s0..sN and onStep, for EdgeDeck, when GSAP is on the page.
 *
 * {debug: true} or window.ED_DEBUG checks the layout once fonts are loaded: labels on each other,
 * labels wider than the gap they span, text outside its box, anything outside the viewBox. The
 * issues go into the shared <pre id="ed-issues"> that scripts/shot.sh --check reads.
 *
 * Colours come from the theme's tokens (--ed-ink, --ed-accent, ...), as in EdgeDiagram.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', VERSION = '1.3.1', UID = 0;
  /* ?static or ?static=K in the address, or window.TRAZO_STATIC = true | K before the library loads:
     no motion, and steps stay at step K (default: the last). scripts/visual.py renders pages so. */
  var still = (function (v, m) { if (v == null && m) v = m[1] == null ? true : +m[1];
    return v == null || v === false ? null : v === true ? 'end' : +v; })(global.TRAZO_STATIC, /[?&]static(?:=(\d+))?(?:&|$)/.exec(global.location ? global.location.search : ''));
  var reduce = still != null || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TONES = ['neutral', 'accent', 'add', 'gap', 'p3', 'muted', 'ink', 'ink2'];

  var CSS = [
    '.sq-root{--_ink:var(--ed-ink,#15201d);--_ink2:var(--ed-ink2,#3f4f4a);--_muted:var(--ed-muted,#66756f);',
    '--_surface:var(--ed-surface,#fff);--_layer:var(--ed-layer,#e9eeec);--_rule:var(--ed-rule,#d2dbd7);',
    '--_accent:var(--ed-accent,#2456a4);--_accent-soft:var(--ed-accent-soft,#e3ebf6);--_gap:var(--ed-gap,#b87d00);',
    '--_gap-soft:var(--ed-gap-soft,#fbf1d9);--_add:var(--ed-add,#0b8a0b);--_add-soft:var(--ed-add-soft,#e3f3e3);',
    '--_p3:var(--ed-p3,#6b46c1);--_p3-soft:var(--ed-p3-soft,#efe9fb);overflow:visible}',
    '.sq-root text{font-family:var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);fill:var(--_ink)}',
    '.sq-group rect{fill:var(--_layer);stroke:var(--_rule)}.sq-group text{font-family:var(--ed-mono,monospace)!important;font-size:10.5px;letter-spacing:.09em;fill:var(--_muted)}',
    '.sq-actor .sq-box{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.2}.sq-actor use{color:var(--_ink)}',
    '.sq-actor .sq-t{font-family:var(--ed-display,"Archivo Narrow",sans-serif)!important;font-weight:600;font-size:15px}',
    '.sq-actor .sq-s{font-size:11px;fill:var(--_ink2)}',
    '.sq-actor.t-accent .sq-box{fill:var(--_accent-soft);stroke:var(--_accent);stroke-width:1.6}.sq-actor.t-accent use{color:var(--_accent)}',
    '.sq-actor.t-add .sq-box{fill:var(--_add-soft);stroke:var(--_add)}.sq-actor.t-add use{color:var(--_add)}',
    '.sq-actor.t-gap .sq-box{fill:var(--_gap-soft);stroke:var(--_gap)}.sq-actor.t-gap use{color:var(--_gap)}',
    '.sq-actor.t-p3 .sq-box{fill:var(--_p3-soft);stroke:var(--_p3);stroke-dasharray:5 3}.sq-actor.t-p3 use{color:var(--_p3)}',
    '.sq-actor.t-muted .sq-box{stroke:var(--_muted);stroke-dasharray:4 3}',
    '.sq-life{stroke:var(--_rule);stroke-width:1.4;stroke-dasharray:4 5}',
    '.sq-act{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.1}',
    '.sq-msg .sq-wire{fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round;transition:stroke-dashoffset .45s ease-in-out,stroke-width .2s}',
    '.sq-msg.reply .sq-wire{stroke-dasharray:5 4}',
    '.sq-msg.now .sq-wire{stroke-width:2.8}',
    '.sq-msg .sq-label{font-size:12px;fill:var(--_ink2)}.sq-msg.now .sq-label{fill:var(--_ink);font-weight:600}',
    '.sq-n{font-family:var(--ed-mono,monospace)!important;font-size:10.5px;font-weight:600}',
    '.sq-plate{fill:var(--ed-plate,var(--_surface));opacity:.92}',
    '.sq-pkt{stroke:none}',
    '.sq-note rect{fill:var(--_gap-soft);stroke:var(--_gap);stroke-width:1}.sq-note text{font-size:11.5px;fill:var(--_ink2)}',
    '.sq-frame rect.sq-fbox{fill:none;stroke:var(--_muted);stroke-width:1.1}.sq-frame path{fill:var(--_layer);stroke:var(--_muted);stroke-width:1.1}',
    '.sq-frame text{font-size:11px;fill:var(--_ink2)}.sq-frame text.sq-k{font-family:var(--ed-mono,monospace)!important;font-weight:600;fill:var(--_ink)}',
    '.sq-frame line{stroke:var(--_muted);stroke-width:1;stroke-dasharray:5 4}',
    '.sq-item{transition:opacity .3s}.sq-item.off{opacity:0;pointer-events:none}',
    '.sq-root .sq-item[tabindex]{cursor:help;outline:none}.sq-root .sq-item[tabindex]:focus-visible .sq-wire,.sq-root .sq-item[tabindex]:focus-visible .sq-box{stroke-width:3}',
    '.sq-debug rect{fill:none;stroke:#e0102f;stroke-width:2;stroke-dasharray:5 3}',
    '@media (prefers-reduced-motion:reduce){.sq-item,.sq-msg .sq-wire{transition:none}}'
  ];
  TONES.forEach(function (t) {
    var c = {neutral: 'ink2', ink: 'ink', ink2: 'ink2'}[t] || t;
    CSS.push('.sq-msg.t-' + t + ' .sq-wire{stroke:var(--_' + c + ')}.sq-head.t-' + t + ',.sq-pkt.t-' + t + ',.sq-msg.t-' + t + ' .sq-n{fill:var(--_' + c + ')}');
  });
  CSS = CSS.join('\n');

  function el(tag, a, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function injectCSS() {
    if (document.getElementById('sq-css')) return;
    var s = document.createElement('style'); s.id = 'sq-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function injectIcons(icons) {
    if (!icons || document.getElementById('ed-icons')) return;
    var h = el('svg', {id: 'ed-icons', 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden'});
    h.innerHTML = '<defs>' + icons + '</defs>';
    document.body.insertBefore(h, document.body.firstChild);
  }
  function wrap(text, max) {
    if (Array.isArray(text)) return text;
    var out = [], cur = '';
    String(text).split(/\s+/).forEach(function (w) {
      if ((cur + ' ' + w).trim().length > max && cur) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim();
    });
    if (cur) out.push(cur);
    return out;
  }
  function bbox(e) { try { var b = e.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; } catch (x) { return null; } }
  function inter(a, b, pad) { return a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad; }
  function contains(a, b) { return b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5; }

  function create(svg, options) {
    options = options || {};
    injectCSS(); injectIcons(options.icons);
    svg.classList.add('sq-root');
    var self = ++UID, sid = svg.id || 'sq' + self, debug = !!(options.debug || global.ED_DEBUG);
    var vbv = svg.viewBox && svg.viewBox.baseVal;
    var W = options.width || (vbv && vbv.width) || 1000;
    var actors = [], A = {}, entries = [], E = {}, frames = [], groups = [], items = {}, drawn = false, vb = null;
    var opt = {row: options.row || 44, top: options.top || 14, margin: options.margin != null ? options.margin : 16,
               boxW: options.boxW || 0, boxH: options.boxH || 56, numbers: options.numbers !== false};
    var api = {svg: svg, items: items, version: VERSION};

    api.actor = function (id, o) { o = o || {}; A[id] = {id: id, o: o, i: actors.length}; actors.push(A[id]); drawn = false; return api; };
    api.group = function (label, ids, o) { groups.push({label: label, ids: ids, o: o || {}}); drawn = false; return api; };
    function entry(kind, id, o) {
      if (E[id]) throw new Error('EdgeSequence: ' + id + ' is defined twice');
      E[id] = {kind: kind, id: id, o: o || {}, n: 0}; entries.push(E[id]); drawn = false; return api;
    }
    api.msg = function (id, o) {
      if (!A[o.from] || !A[o.to]) throw new Error('EdgeSequence: message ' + id + ' needs existing actors');
      return entry(o.from === o.to ? 'self' : 'msg', id, o.from === o.to ? Object.assign({at: o.from}, o) : o);
    };
    api.self = function (id, o) {
      if (!A[o.at]) throw new Error('EdgeSequence: message ' + id + ' needs an existing actor');
      return entry('self', id, o);
    };
    api.note = function (id, o) {
      var over = [].concat(o.over || o.at);
      over.forEach(function (a) { if (!A[a]) throw new Error('EdgeSequence: note ' + id + ' needs existing actors'); });
      return entry('note', id, Object.assign({}, o, {over: over}));
    };
    api.frame = function (id, o) { frames.push({id: id, o: o}); drawn = false; return api; };

    /* ---------- layout ---------- */
    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      Object.keys(items).forEach(function (k) { delete items[k]; });
      var defs = el('defs', {}, svg), L = {groups: el('g', {}, svg), frames: el('g', {}, svg), lives: el('g', {}, svg)};
      L.acts = el('g', {}, svg); L.msgs = el('g', {}, svg); L.notes = el('g', {}, svg); L.actors = el('g', {}, svg); L.pkts = el('g', {}, svg);
      var marks = {};
      function head(tone) {
        if (marks[tone]) return marks[tone];
        var m = el('marker', {id: 'sq-' + sid + '-' + tone, viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8,
          orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse'}, defs);
        el('path', {d: 'M0 1 L10 5 L0 9 Z', 'class': 'sq-head t-' + tone}, m);
        return (marks[tone] = 'url(#' + m.id + ')');
      }
      var n = actors.length, m = opt.margin, cw = (W - 2 * m) / Math.max(1, n);
      var hasGroups = groups.length > 0, gTop = opt.top, aTop = gTop + (hasGroups ? 26 : 0);
      var bw = Math.min(cw - 14, opt.boxW || 190), bh = opt.boxH;
      actors.forEach(function (a, i) { a.x = m + cw * (i + 0.5); });

      // the order of rows: frame headers and else-lines go before their messages, frame ends after
      var starts = {}, elses = {}, ends = {};
      frames.forEach(function (f) {
        if (!E[f.o.from] || !E[f.o.to || f.o.from]) throw new Error('EdgeSequence: frame ' + f.id + ' needs existing messages');
        (starts[f.o.from] = starts[f.o.from] || []).push(f);
        (ends[f.o.to || f.o.from] = ends[f.o.to || f.o.from] || []).push(f);
        (f.o.else || []).forEach(function (e) { (elses[e.at] = elses[e.at] || []).push({f: f, e: e}); });
      });
      var y = aTop + bh + 26, num = 0, stack = {}, bars = [];
      actors.forEach(function (a) { stack[a.id] = []; });
      function depth(a) { return stack[a].length; }
      function edge(a, toward) {   // where a wire meets an actor: the side of its innermost bar, else the lifeline
        var d = depth(a), x = A[a].x;
        return d ? x + (d - 1) * 4 + (toward > x ? 5 : -5) : x;
      }
      entries.forEach(function (e) {
        (starts[e.id] || []).forEach(function (f) { f.y0 = y - 6; y += 30; });
        (elses[e.id] || []).forEach(function (s) { s.e.y = y; y += 24; });
        var o = e.o;
        if (e.kind === 'msg') {
          e.n = ++num;
          var ax = A[o.from].x, bx = A[o.to].x;
          e.y = y; e.x0 = edge(o.from, bx);
          if (o.reply) { var b = stack[o.from].pop(); if (b) { b.y1 = y; bars.push(b); } }
          else if (o.activate !== false) stack[o.to].push({a: o.to, y0: y, d: depth(o.to)});
          e.x1 = edge(o.to, ax); e.bottom = y + 12;
          y += opt.row;
        } else if (e.kind === 'self') {
          e.n = ++num;
          var at = o.at, d0 = depth(at);
          // the loop opens to the right, or to the left from the last column or with side: 'left'
          e.dir = o.side === 'left' || (o.side !== 'right' && A[at].i === actors.length - 1 && actors.length > 1) ? -1 : 1;
          e.x0 = edge(at, e.dir * Infinity); e.y = y;
          bars.push({a: at, y0: y + 16, y1: y + 34, d: d0});
          e.x1 = A[at].x + d0 * 4 + 5 * e.dir; e.bottom = y + 34;
          y += opt.row + 22;
        } else {
          var lines = wrap(o.text, o.wrap || 34);
          e.lines = lines; e.y = y; e.h = lines.length * 15 + 12; e.bottom = y + e.h;
          y += e.h + 14;
        }
        (ends[e.id] || []).forEach(function (f, i) { f.y1 = e.bottom + 8 + i * 8; y = Math.max(y, f.y1 + 22); });
      });
      actors.forEach(function (a) { while (stack[a.id].length) { var b = stack[a.id].pop(); b.y1 = y - 10; bars.push(b); } });
      var H = y + 8;
      vb = {x: 0, y: 0, w: W, h: H};
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);

      groups.forEach(function (g, i) {
        var xs = g.ids.map(function (id) { if (!A[id]) throw new Error('EdgeSequence: group ' + g.label + ' needs existing actors'); return A[id].x; });
        var x0 = Math.min.apply(null, xs) - cw / 2 + 4, x1 = Math.max.apply(null, xs) + cw / 2 - 4;
        var gg = el('g', {'class': 'sq-group'}, L.groups);
        el('rect', {x: x0, y: gTop, width: x1 - x0, height: H - gTop - 4, rx: 10}, gg);
        el('text', {x: x0 + 12, y: gTop + 17}, gg, g.label);
        items['group' + i] = {el: gg, kind: 'group'};
      });
      actors.forEach(function (a) {
        el('line', {x1: a.x, y1: aTop + bh, x2: a.x, y2: H - 6, 'class': 'sq-life'}, L.lives);
        var o = a.o, g = el('g', {'class': 'sq-actor t-' + (o.tone || 'neutral'), 'data-id': a.id, 'data-box': ''}, L.actors);
        var bx = a.x - bw / 2;
        el('rect', {x: bx, y: aTop, width: bw, height: bh, rx: o.shape === 'pill' ? bh / 2 : 9, 'class': 'sq-box'}, g);
        var is = o.icon ? 22 : 0, subs = o.sub ? wrap(o.sub, o.subWrap || 26) : [];
        var block = 15 + subs.length * 14, ty = aTop + (bh - block) / 2 + 12;
        var t = el('text', {x: a.x + (is ? (is + 8) / 2 : 0), y: ty, 'text-anchor': 'middle', 'class': 'sq-t'}, g, o.title || a.id);
        var sub = subs.map(function (s, i) { return el('text', {x: a.x + (is ? (is + 8) / 2 : 0), y: ty + 14 * (i + 1), 'text-anchor': 'middle', 'class': 'sq-s'}, g, s); });
        if (is) {
          var u = el('use', {href: '#i-' + o.icon, width: is, height: is, y: aTop + (bh - is) / 2, x: a.x - bw / 2 + 10}, g);
          a.fitIcon = function () {   // left of the wider line
            var wd = 0; [t].concat(sub).forEach(function (e) { try { wd = Math.max(wd, e.getComputedTextLength()); } catch (x) {} });
            u.setAttribute('x', Math.max(bx + 8, a.x + (is + 8) / 2 - wd / 2 - is - 8));
          };
          a.fitIcon();
        }
        if (o.info) tip(g, o.title || a.id, o.info);
        items[a.id] = {el: g, kind: 'actor'};
      });
      bars.forEach(function (b) {
        el('rect', {x: A[b.a].x - 5 + b.d * 4, y: b.y0, width: 10, height: Math.max(8, b.y1 - b.y0), rx: 2, 'class': 'sq-act'}, L.acts);
      });

      entries.forEach(function (e) {
        var o = e.o, tone = o.tone || (o.reply ? 'muted' : 'accent');
        if (e.kind === 'note') {
          var xs = o.over.map(function (a) { return A[a].x; }), x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
          var w = Math.max(x1 - x0 + 60, 150), g = el('g', {'class': 'sq-item sq-note', 'data-id': e.id, 'data-box': ''}, L.notes);
          var nx = (x0 + x1) / 2 - w / 2;
          el('rect', {x: nx, y: e.y, width: w, height: e.h, rx: 4}, g);
          e.lines.forEach(function (s, i) { el('text', {x: nx + w / 2, y: e.y + 18 + i * 15, 'text-anchor': 'middle'}, g, s); });
          items[e.id] = {el: g, kind: 'note', e: e};
          return;
        }
        var g2 = el('g', {'class': 'sq-item sq-msg t-' + tone + (o.reply ? ' reply' : ''), 'data-id': e.id}, L.msgs), d;
        if (e.kind === 'msg') d = 'M' + e.x0 + ' ' + e.y + ' H' + e.x1;
        else { var r = 6 * e.dir, xo = e.x0 + 34 * e.dir; d = 'M' + e.x0 + ' ' + e.y + ' H' + (xo - r) + ' Q' + xo + ' ' + e.y + ' ' + xo + ' ' + (e.y + 6) +
          ' V' + (e.y + 16) + ' Q' + xo + ' ' + (e.y + 22) + ' ' + (xo - r) + ' ' + (e.y + 22) + ' H' + e.x1; }
        var p = el('path', {d: d, 'class': 'sq-wire', pathLength: o.reply ? null : 1}, g2);   // a reply keeps its dashes
        p.setAttribute('marker-end', head(tone));
        var lx = e.kind === 'msg' ? (e.x0 + e.x1) / 2 : e.x0 + 42 * e.dir, ly = e.kind === 'msg' ? e.y - 8 : e.y + 15;
        var pl = el('rect', {'class': 'sq-plate', rx: 3}, g2);
        var t = el('text', {x: lx, y: ly, 'text-anchor': e.kind === 'msg' ? 'middle' : e.dir > 0 ? 'start' : 'end', 'class': 'sq-label'}, g2);
        if (opt.numbers) el('tspan', {'class': 'sq-n'}, t, e.n + '  ');
        el('tspan', {}, t, o.label || '');
        e.plate = pl; e.text = t; e.path = p; e.g = g2;
        if (o.info) tip(g2, o.label || e.id, o.info);
        items[e.id] = {el: g2, kind: 'msg', e: e};
      });
      placeLabels();   // measured first, so that a frame spans its self messages' labels
      frames.forEach(function (f) {
        var F = f.o, lo = Infinity, hi = -Infinity, nest = 0;
        entries.slice(entries.indexOf(E[F.from]), entries.indexOf(E[F.to || F.from]) + 1).forEach(function (e) {
          var xs = e.kind === 'note' ? e.o.over.map(function (a) { return A[a].x; }) : e.kind === 'self' ? [e.x0, e.lbox ? (e.dir > 0 ? e.lbox.x + e.lbox.w : e.lbox.x) : e.x0 + 104 * e.dir] : [e.x0, e.x1];
          lo = Math.min.apply(null, [lo].concat(xs)); hi = Math.max.apply(null, [hi].concat(xs));
        });
        frames.forEach(function (o2) { if (o2 !== f && o2.y0 <= f.y0 && o2.y1 >= f.y1 && (o2.y0 < f.y0 || o2.y1 > f.y1)) nest++; });
        var pad = Math.min(cw / 2 - 10, 60) - nest * 8, x0 = lo - pad, x1 = hi + pad;
        if (F.over) { var ox = [].concat(F.over).map(function (a) { return A[a].x; }); x0 = Math.min(x0, Math.min.apply(null, ox) - pad); x1 = Math.max(x1, Math.max.apply(null, ox) + pad); }
        var g = el('g', {'class': 'sq-item sq-frame', 'data-id': f.id}, L.frames), k = F.kind || 'alt', kw = k.length * 7.4 + 16;
        el('rect', {x: x0, y: f.y0, width: x1 - x0, height: f.y1 - f.y0, rx: 4, 'class': 'sq-fbox'}, g);
        el('path', {d: 'M' + x0 + ' ' + (f.y0 + 4) + ' Q' + x0 + ' ' + f.y0 + ' ' + (x0 + 4) + ' ' + f.y0 + ' H' + (x0 + kw) + ' V' + (f.y0 + 12) + ' L' + (x0 + kw - 6) + ' ' + (f.y0 + 18) + ' H' + x0 + ' Z'}, g);
        el('text', {x: x0 + 7, y: f.y0 + 13, 'class': 'sq-k'}, g, k);
        if (F.label) f.ltext = el('text', {x: x0 + kw + 8, y: f.y0 + 13}, g, '[' + F.label + ']');
        f.ktext = g.querySelector('.sq-k');
        (F.else || []).forEach(function (s) {
          el('line', {x1: x0, y1: s.y, x2: x1, y2: s.y}, g);
          el('text', {x: x0 + 10, y: s.y + 14}, g, '[' + s.label + ']');
        });
        f.box = {x: x0, y: f.y0, w: x1 - x0, h: f.y1 - f.y0};
        items[f.id] = {el: g, kind: 'frame', f: f};
      });
      L.pktLayer = L.pkts;
      api.layers = L;
      placeLabels();
      drawn = true;
    }
    function placeLabels() {
      entries.forEach(function (e) {
        if (!e.text) return;
        var b = bbox(e.text); if (!b) return;
        e.plate.setAttribute('x', b.x - 3); e.plate.setAttribute('y', b.y - 1); e.plate.setAttribute('width', b.w + 6); e.plate.setAttribute('height', b.h + 2);
        e.lbox = b;
      });
      actors.forEach(function (a) { if (a.fitIcon) a.fitIcon(); });
    }
    function tip(g, name, info) {
      el('title', {}, g, name + ': ' + info);
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', name + '. ' + info);
    }
    api.render = function () { if (!drawn) render(); return api; };

    /* ---------- steps ---------- */
    var pkts = [], running = false;
    function loop(ts) {
      if (!pkts.length || document.hidden) { running = false; return; }
      pkts.forEach(function (k) {
        var len = k.p.getTotalLength(), u = ((ts / 1000) / 1.4 + k.ph) % 1, pt = k.p.getPointAtLength(len * u);
        k.c.setAttribute('cx', pt.x); k.c.setAttribute('cy', pt.y);
        k.c.setAttribute('opacity', u < 0.1 ? u / 0.1 : u > 0.9 ? (1 - u) / 0.1 : 1);
      });
      global.requestAnimationFrame(loop);
    }
    api.steps = function (list, o) {
      o = o || {};
      api.render();
      var all = actors.map(function (a) { return a.id; }).concat(groups.map(function (g, i) { return 'group' + i; }));
      if (!list) {
        list = [{show: all, caption: o.caption0 || ''}];
        entries.forEach(function (e) {
          if (e.o.with && list.length > 1) { list[list.length - 1].show.push(e.id); return; }
          list.push({show: [e.id], caption: e.o.caption || ''});
        });
      } else if (list[0] && list[0].show) list[0] = Object.assign({}, list[0], {show: all.concat(list[0].show)});
      // a frame shows with its first message
      frames.forEach(function (f) { list.forEach(function (s) { if ((s.show || []).indexOf(f.o.from) >= 0 && s.show.indexOf(f.id) < 0) s.show = s.show.concat([f.id]); }); });
      var at = {};
      list.forEach(function (s, k) { (s.show || []).forEach(function (id) { if (!items[id]) throw new Error('EdgeSequence: unknown item ' + id); if (at[id] == null) at[id] = k; }); });
      Object.keys(items).forEach(function (id) { if (at[id] == null) at[id] = 0; });
      var cur = -1;
      function apply(k, animate) {
        if (still != null) k = still === 'end' ? list.length - 1 : still;
        k = Math.max(0, Math.min(list.length - 1, k));
        var fwd = animate && k > cur && !reduce;
        Object.keys(items).forEach(function (id) {
          var it = items[id], on = at[id] <= k, now = at[id] === k && k > 0;
          var was = !it.el.classList.contains('off');
          it.el.classList.toggle('off', !on);
          it.el.classList.toggle('now', now);
          if (it.kind === 'msg') {
            var p = it.e.path, tr = p.style.transition;
            if (!it.e.o.reply) {
              if (on && !was && fwd) {   // draw the wire, then its arrowhead
                p.style.transition = 'none'; p.style.strokeDasharray = '1 2'; p.style.strokeDashoffset = '1';
                p.removeAttribute('marker-end'); p.getBoundingClientRect(); p.style.transition = tr;
                p.style.strokeDashoffset = '0';
                (function (pp, mk) { setTimeout(function () { pp.setAttribute('marker-end', mk); }, 430); })(p, p.dataset.mk || p.getAttribute('marker-end') || '');
              } else { p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; }
            }
            if (!p.dataset.mk && p.getAttribute('marker-end')) p.dataset.mk = p.getAttribute('marker-end');
            if (!(on && !was && fwd) && p.dataset.mk) p.setAttribute('marker-end', p.dataset.mk);
          }
        });
        while (api.layers.pkts.firstChild) api.layers.pkts.removeChild(api.layers.pkts.firstChild);
        pkts = [];
        if (!reduce && k > 0 && o.packets !== false) (list[k].show || []).forEach(function (id, i) {
          var it = items[id]; if (!it || it.kind !== 'msg') return;
          var tone = it.e.o.tone || (it.e.o.reply ? 'muted' : 'accent');
          pkts.push({p: it.e.path, c: el('circle', {r: 4.5, 'class': 'sq-pkt t-' + tone, opacity: 0}, api.layers.pkts), ph: i * 0.15});
        });
        if (pkts.length && !running) { running = true; global.requestAnimationFrame(loop); }
        cur = k;
        if (o.onStep) o.onStep(k, list[k], ctl);   // ctl: the first call comes before steps() returns
      }
      var G = global.gsap, tl = null;
      if (G) {   // labels s0..sN for EdgeDeck, which calls onStep on every step
        tl = G.timeline({paused: true});
        list.forEach(function (s, k) { tl.addLabel('s' + k, k * 0.5); });
        tl.to({}, {duration: 0.01}, (list.length - 1) * 0.5);
        tl.onStep = function (k) { if (k < 0) { pkts = []; while (api.layers.pkts.firstChild) api.layers.pkts.removeChild(api.layers.pkts.firstChild); } else apply(k, true); };
      }
      var ctl = {
        get step() { return cur; }, count: list.length, timeline: tl, steps: list,
        go: function (k) { apply(k, k > cur); },
        next: function () { if (cur < list.length - 1) apply(cur + 1, true); },
        prev: function () { if (cur > 0) apply(cur - 1, false); },
        end: function () { apply(list.length - 1, false); }
      };
      api.stepSets = list.map(function (s, k) { return Object.keys(items).filter(function (id) { return at[id] <= k; }); });
      apply(o.start === 'end' ? list.length - 1 : o.start || 0, false);
      return ctl;
    };

    /* ---------- check ---------- */
    api.check = function () {
      api.render(); placeLabels();
      var out = [], seen = {}, name = svg.id ? '#' + svg.id : 'svg';
      function add(msg, b) { if (seen[msg]) return; seen[msg] = 1; out.push({msg: name + ': ' + msg, box: b}); }
      actors.forEach(function (a) {
        var g = items[a.id].el, box = bbox(g.querySelector('.sq-box'));
        [].forEach.call(g.querySelectorAll('text'), function (t) {
          var b = bbox(t); if (b && b.w && !contains({x: box.x + 2, y: box.y + 1, w: box.w - 4, h: box.h - 2}, b)) add('text "' + t.textContent + '" runs outside actor ' + a.id, b);
        });
      });
      var labelled = entries.filter(function (e) { return e.lbox; });
      labelled.forEach(function (e, i) {
        var b = e.lbox;
        if (vb && !contains(vb, b)) add('label of ' + e.id + ' is outside the viewBox', b);
        if (e.kind === 'msg' && b.w > Math.abs(e.x1 - e.x0) - 8) add('label of ' + e.id + ' is wider than the gap it spans: shorten it or widen the viewBox', b);
        if (e.kind === 'self') actors.forEach(function (a) { if (a.id !== e.o.at && a.x > b.x && a.x < b.x + b.w) add('label of ' + e.id + ' crosses the lifeline of ' + a.id, b); });
        labelled.slice(i + 1).forEach(function (f) { if (inter(b, f.lbox, 1)) add('labels of ' + e.id + ' and ' + f.id + ' overlap', b); });
      });
      entries.forEach(function (e) {
        if (e.kind !== 'note') return;
        var g = items[e.id].el, box = bbox(g.querySelector('rect'));
        if (vb && !contains(vb, box)) add('note ' + e.id + ' is outside the viewBox', box);
        [].forEach.call(g.querySelectorAll('text'), function (t) { var b = bbox(t); if (b && b.w && !contains(box, b)) add('text of note ' + e.id + ' runs outside it', b); });
      });
      frames.forEach(function (f) {
        if (vb && !contains(vb, f.box)) add('frame ' + f.id + ' is outside the viewBox', f.box);
        [f.ktext, f.ltext].forEach(function (t) {
          var b = t && bbox(t); if (!b) return;
          labelled.forEach(function (e) { if (inter(b, e.lbox, 1)) add('the head of frame ' + f.id + ' is under the label of ' + e.id, b); });
        });
      });
      if (debug) {
        var old = svg.querySelector('.sq-debug'); if (old) old.remove();
        var g = el('g', {'class': 'sq-debug', 'aria-hidden': 'true'}, svg);
        out.forEach(function (i) { if (i.box) el('rect', {x: i.box.x - 2, y: i.box.y - 2, width: i.box.w + 4, height: i.box.h + 4, rx: 3}, g); });
      }
      return out.map(function (i) { return i.msg; });
    };
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      if (drawn) placeLabels();
      if (debug) setTimeout(function () { report('sequence:' + self, api.check()); }, 0);
    });
    return api;
  }

  // the issues of every checked figure, shared with EdgeDiagram and EdgeSketch, in the <pre> shot.sh --check reads
  function report(key, list) {
    var R = global.ED_ISSUES = global.ED_ISSUES || {};
    R[key] = list;
    var pre = document.getElementById('ed-issues');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'ed-issues'; pre.hidden = true; document.body.appendChild(pre); }
    var keys = Object.keys(R);
    pre.textContent = keys.map(function (k) { return R[k].join('\n'); }).filter(Boolean).join('\n');
    pre.setAttribute('data-diagrams', keys.length);
    list.forEach(function (m) { if (global.console) console.warn('[EdgeSequence] ' + m); });
  }

  global.EdgeSequence = {create: create, version: VERSION};
})(window);
