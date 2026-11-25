/* EdgeMatrix v1.5.0 — matrices, coverage maps and planes for single-file HTML pages and decks.
 *
 *   var m = EdgeMatrix.create(svg, {status: document.getElementById('info')});
 *   m.colGroup('io', {label: 'INPUTS'}).col('c1', {label: 'Sensor feed', group: 'io'});
 *   m.rowGroup('g1', {label: 'Safety', caption: 'The safety rows first.'});
 *   m.row('r1', {code: 'R-01', label: 'Stops within 2 s', group: 'g1'});
 *   m.cell('r1', 'c1', 'full');                          // or {state: 'part', mark: '2', info: '...'}
 *   m.cells({r2: 'FPN.X'});                              // one letter per column, from the legend's keys
 *   var ctl = m.steps();                                 // one step per row group; or m.steps([{show: [ids], caption}])
 *   m.filter('gaps'); m.highlight({states: ['none']});   // rows with gaps only; dim all but one state
 *
 * Rows and columns with headers, optional groups (a band of headers above the columns, a band
 * beside the rows), cells in a state from a small legend that maps each state to a tone and a
 * style (solid, soft, outline, blank), an optional short mark in a cell, totals per state for
 * rows and columns, and a legend the library draws. Long column headers turn to read bottom to
 * top. The viewBox follows the content: cells are sized from their marks and headers, and a large
 * matrix (over 60 rows or 900 cells) is drawn compact, so it never needs to scroll inside the SVG.
 *
 * Plane mode ({mode: 'plane'}, axes {x, y}) is for SGAM-like grids: wide cells that hold small
 * boxes with icons (m.item), labelled axes with arrows, headers that wrap.
 *
 * Hovering a cell or moving to it with the arrow keys (the figure is focusable) highlights its row
 * and column and shows its info, in o.status if given, else in a tooltip. Legend entries toggle a
 * highlight of their state.
 *
 * {debug: true} or window.ED_DEBUG checks the layout once fonts are loaded: headers that overflow
 * their band, group labels wider than their span, marks too large for their cell, item labels out
 * of their box, anything outside the viewBox. The issues go into the shared <pre id="ed-issues">
 * that scripts/shot.sh --check reads.
 * With lib/edgesketch.js on the page (shot.sh --check puts it there), check() adds EdgeSketch.paint:
 * contrast in the light and the dark theme, wires through text, wires run together.
 *
 * Colours come from the theme's tokens (--ed-ink, --ed-add, ...), as in EdgeDiagram; the tone bad
 * reads --ed-bad, else the page's --bad.
 *
 * m.describe() returns a text description (cells per state, then the rows and columns with gaps); the
 * svg points aria-describedby at it, a hidden <table> holds every cell, and a live region reads each step.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', VERSION = '1.5.0', UID = 0;
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TONES = {neutral: ['ink2', 'surface'], accent: ['accent', 'accent-soft'], add: ['add', 'add-soft'], gap: ['gap', 'gap-soft'],
               bad: ['bad', 'bad-soft'], p3: ['p3', 'p3-soft'], muted: ['muted', 'layer'], ink: ['ink', 'layer']};
  var LEGEND = [
    {id: 'full', key: 'F', label: 'Covered', tone: 'add', style: 'solid'},
    {id: 'part', key: 'P', label: 'Partly covered', tone: 'gap', style: 'soft', gap: true},
    {id: 'none', key: 'N', label: 'Not covered', tone: 'bad', style: 'outline', gap: true},
    {id: 'na', key: 'X', label: 'Not applicable', tone: 'muted', style: 'blank'}
  ];
  // sizes in viewBox units: cell width and height, gap, header, mark and group font, line height, caps
  var SIZES = {
    normal: {cw: 26, ch: 22, gap: 3, fs: 12, ms: 11, gs: 10.5, lh: 15, rowMax: 300, colH: 170, ggap: 8, rx: 3},
    compact: {cw: 14, ch: 14, gap: 1.5, fs: 10.5, ms: 8.5, gs: 9.5, lh: 12.5, rowMax: 240, colH: 130, ggap: 5, rx: 1.5},
    plane: {cw: 128, ch: 50, gap: 8, fs: 12.5, ms: 11, gs: 10.5, lh: 15.5, rowMax: 150, colH: 170, ggap: 8, rx: 8}
  };

  var CSS = [
    '.em-root{--_ink:var(--ed-ink,#15201d);--_ink2:var(--ed-ink2,#3f4f4a);--_muted:var(--ed-muted,#5a6963);',
    '--_surface:var(--ed-surface,#fff);--_layer:var(--ed-layer,#e9eeec);--_rule:var(--ed-rule,#d2dbd7);',
    '--_accent:var(--ed-accent,#2456a4);--_accent-soft:var(--ed-accent-soft,#e3ebf6);--_gap:var(--ed-gap,#ad7600);',
    '--_gap-soft:var(--ed-gap-soft,#fbf1d9);--_add:var(--ed-add,#0b8a0b);--_add-soft:var(--ed-add-soft,#e3f3e3);',
    '--_p3:var(--ed-p3,#6b46c1);--_p3-soft:var(--ed-p3-soft,#efe9fb);--_bad:var(--ed-bad,var(--bad,#b42318));--_bad-soft:var(--ed-bad-soft,var(--bad-soft,#fde7e4));',
    'overflow:hidden;outline:none}',
    '.em-root text{font-family:var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);fill:var(--_ink);text-rendering:geometricPrecision}',
    '.em-root .em-h{fill:var(--_ink2)}.em-root .em-code{font-family:var(--ed-mono,ui-monospace,monospace);fill:var(--_muted)}',
    '.em-root .em-h.em-hot,.em-root .em-code.em-hot{fill:var(--_accent);font-weight:600}',
    '.em-root .em-h.em-now{fill:var(--_ink);font-weight:600}',
    '.em-root .em-g rect{fill:var(--_layer)}.em-root .em-g text,.em-root .em-gt{font-family:var(--ed-mono,ui-monospace,monospace);letter-spacing:.08em;fill:var(--_muted)}',
    '.em-root .em-corner{font-family:var(--ed-mono,ui-monospace,monospace);fill:var(--_muted)}',
    '.em-c{stroke-width:1}.em-c.empty{fill:var(--_layer);stroke:none}',
    '.em-c.s-outline{stroke-width:1.5}.em-c.s-blank{fill:none;stroke-dasharray:3 2}',
    '.em-root .em-m{font-family:var(--ed-mono,ui-monospace,monospace);font-weight:600;text-anchor:middle;pointer-events:none;fill:var(--_ink)}',
    '.em-root .em-m.on{fill:var(--_surface)}',
    '.em-pc{fill:var(--_layer);stroke:var(--_rule)}',
    '.em-item rect{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.1}.em-item use{color:var(--_ink2)}.em-root .em-item text{font-size:11.5px}',
    '.em-item.t-p3 rect{stroke-dasharray:4 3}.em-item.t-muted rect{stroke-dasharray:4 3}',
    '.em-root .em-tot{font-family:var(--ed-mono,ui-monospace,monospace);text-anchor:middle;fill:var(--_ink)}.em-root .em-tot.zero{fill:var(--_muted)}',
    '.em-band{fill:var(--_accent-soft);pointer-events:none}',
    '.em-cursor{fill:none;stroke:var(--_accent);stroke-width:2;pointer-events:none}',
    '.em-axis{stroke:var(--_muted);stroke-width:1.4;fill:none}.em-axis-head{fill:var(--_muted)}',
    '.em-root .em-axis-l{font-family:var(--ed-mono,ui-monospace,monospace);letter-spacing:.1em;fill:var(--_muted)}',
    '.em-lg{cursor:pointer;outline:none}.em-root .em-lg text{fill:var(--_ink2)}.em-lg:focus-visible rect.em-lgk,.em-lg.on rect.em-lgk{stroke:var(--_accent);stroke-width:2}',
    '.em-lg.on text{font-weight:600}.em-lgk{fill:none;stroke:none}',
    '.em-off{opacity:0;pointer-events:none}.em-dim{opacity:.16}',
    '.em-fade .em-c,.em-fade .em-m,.em-fade .em-item,.em-fade .em-h,.em-fade .em-code,.em-fade .em-tot{transition:opacity .3s}',
    '.em-root .em-item[tabindex]{cursor:help;outline:none}.em-root .em-item[tabindex]:focus-visible rect{stroke:var(--_accent);stroke-width:2.4}',
    '.em-root:focus-visible{outline:2px solid var(--_accent);outline-offset:-2px}',
    '.em-tip{position:fixed;z-index:1000;max-width:min(320px,calc(100vw - 16px));pointer-events:none;background:var(--ed-tip-bg,#15201d);color:var(--ed-tip-ink,#f3f6f4);',
    'font:13px/1.45 var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);padding:8px 11px;border-radius:6px;box-shadow:0 8px 24px -12px rgba(0,0,0,.5)}',
    '.em-tip b{display:block;font-weight:600}.em-tip span{display:block}',
    '.em-debug rect{fill:none;stroke:#e0102f;stroke-width:2;stroke-dasharray:5 3}',
    '@media (prefers-reduced-motion:reduce){.em-fade *{transition:none!important}}',
    '@media (forced-colors:active){.em-c{stroke:CanvasText}.em-cursor{stroke:Highlight}.em-tip{border:1px solid CanvasText}}'
  ];
  Object.keys(TONES).forEach(function (t) {
    var c = 'var(--_' + TONES[t][0] + ')', s = 'var(--_' + TONES[t][1] + ')';
    CSS.push('.em-c.t-' + t + '{stroke:' + c + '}.em-c.s-solid.t-' + t + '{fill:' + c + '}.em-c.s-soft.t-' + t + '{fill:' + s + '}.em-c.s-outline.t-' + t + '{fill:var(--_surface)}',
      '.em-item.t-' + t + ' rect{stroke:' + c + ';fill:' + (t === 'neutral' ? 'var(--_surface)' : s) + '}.em-item.t-' + t + ' use{color:' + c + '}',
      '.em-totc.t-' + t + '{fill:' + s + ';stroke:none}');
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
    if (document.getElementById('em-css')) return;
    var s = document.createElement('style'); s.id = 'em-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function injectIcons(icons) {
    if (!icons || document.getElementById('ed-icons')) return;
    var h = el('svg', {id: 'ed-icons', 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden'});
    h.innerHTML = '<defs>' + icons + '</defs>';
    document.body.insertBefore(h, document.body.firstChild);
  }
  function bbox(e) { try { var b = e.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; } catch (x) { return null; } }
  function r1(v) { return Math.round(v * 10) / 10; }

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

  function create(svg, options) {
    options = options || {};
    injectCSS(); injectIcons(options.icons);
    svg.classList.add('em-root');
    var self = ++UID, debug = !!(options.debug || global.ED_DEBUG);
    var plane = options.mode === 'plane';
    var legend = (options.legend || LEGEND).map(function (s) { return Object.assign({tone: 'neutral', style: 'soft'}, s); });
    var L = {}, KEY = {};
    legend.forEach(function (s) { L[s.id] = s; if (s.key) KEY[s.key] = s.id; });
    var rows = [], R = {}, cols = [], C = {}, rgroups = {}, cgroups = {}, rgOrder = [], cgOrder = [];
    var cells = {}, items = [], I = {}, drawn = false;
    var state = {filter: null, hl: null, legendHl: null, step: -1, cursor: null};
    var api = {svg: svg, version: VERSION, legend: legend};
    var view = null;   // the current layout

    /* ---------- data ---------- */
    api.rowGroup = function (id, o) { if (!rgroups[id]) rgOrder.push(id); rgroups[id] = Object.assign({id: id, label: id}, o || {}); drawn = false; return api; };
    api.colGroup = function (id, o) { if (!cgroups[id]) cgOrder.push(id); cgroups[id] = Object.assign({id: id, label: id}, o || {}); drawn = false; return api; };
    api.row = function (id, o) {
      if (R[id]) throw new Error('EdgeMatrix: row ' + id + ' is defined twice');
      R[id] = Object.assign({id: id, label: id}, o || {}); rows.push(R[id]); drawn = false; return api;
    };
    api.col = function (id, o) {
      if (C[id]) throw new Error('EdgeMatrix: column ' + id + ' is defined twice');
      C[id] = Object.assign({id: id, label: id}, o || {}); cols.push(C[id]); drawn = false; return api;
    };
    api.rows = function (list) { list.forEach(function (r) { api.row(r.id, r); }); return api; };
    api.cols = function (list) { list.forEach(function (c) { api.col(c.id, c); }); return api; };
    api.cell = function (r, c, v) {
      if (!R[r] || !C[c]) throw new Error('EdgeMatrix: cell ' + r + ' × ' + c + ' needs an existing row and column');
      var o = typeof v === 'string' ? {state: v} : Array.isArray(v) ? {state: v[0], mark: v[1], info: v[2]} : Object.assign({}, v);
      if (o.state != null && !L[o.state]) throw new Error('EdgeMatrix: state ' + o.state + ' is not in the legend');
      cells[r + '\u0001' + c] = o; drawn = false; return api;
    };
    // {rowId: 'FPN.X'} (one legend key per column, '.' or ' ' for none) or {rowId: {colId: value}}
    api.cells = function (map) {
      Object.keys(map).forEach(function (r) {
        var v = map[r];
        if (typeof v === 'string') v.split('').forEach(function (ch, j) {
          if (j >= cols.length) throw new Error('EdgeMatrix: row ' + r + ' has more keys than there are columns');
          if (ch === '.' || ch === ' ') return;
          if (!KEY[ch]) throw new Error('EdgeMatrix: key ' + ch + ' is not in the legend');
          api.cell(r, cols[j].id, KEY[ch]);
        });
        else Object.keys(v).forEach(function (c) { api.cell(r, c, v[c]); });
      });
      return api;
    };
    api.item = function (id, o) {
      if (I[id]) throw new Error('EdgeMatrix: item ' + id + ' is defined twice');
      if (!R[o.row] || !C[o.col]) throw new Error('EdgeMatrix: item ' + id + ' needs an existing row and column');
      I[id] = Object.assign({id: id}, o); items.push(I[id]); drawn = false; return api;
    };
    api.get = function (r, c) { return cells[r + '\u0001' + c] || null; };
    // counts per state over the visible columns of a row, or the visible rows of a column
    api.counts = function (id) {
      var out = {}; legend.forEach(function (s) { out[s.id] = 0; });
      var isRow = !!R[id], list = isRow ? visCols() : visRows();
      list.forEach(function (x) { var v = isRow ? api.get(id, x.id) : api.get(x.id, id); if (v && v.state) out[v.state]++; });
      return out;
    };
    function hasGap(r) { return cols.some(function (c) { var v = api.get(r.id, c.id); return v && L[v.state] && L[v.state].gap; }); }
    function visRows() {
      var f = state.filter; if (!f) return rows.slice();
      return rows.filter(function (r) {
        if (f === 'gaps') return hasGap(r);
        if (f.states) return cols.some(function (c) { var v = api.get(r.id, c.id); return v && f.states.indexOf(v.state) >= 0; });
        if (f.rows) return typeof f.rows === 'function' ? f.rows(r, api.counts(r.id)) : f.rows.indexOf(r.id) >= 0 || f.rows.indexOf(r.group) >= 0;
        return true;
      });
    }
    function visCols() {
      var f = state.filter; if (!f || !f.cols) return cols.slice();
      return cols.filter(function (c) { return typeof f.cols === 'function' ? f.cols(c) : f.cols.indexOf(c.id) >= 0 || f.cols.indexOf(c.group) >= 0; });
    }

    /* ---------- measuring ---------- */
    var mtext = null;   // one hidden text per class and size: Chrome may keep a stale length when only the class changes
    function measure(s, cls, size) {
      if (!mtext || !mtext.g.parentNode) mtext = {g: el('g', {visibility: 'hidden', 'aria-hidden': 'true'}, svg), t: {}};
      var k = (cls || '') + '@' + size, t = mtext.t[k];
      if (!t) t = mtext.t[k] = el('text', {'class': cls || null, 'font-size': size}, mtext.g);
      t.textContent = s == null ? '' : String(s);
      try { return t.getComputedTextLength(); } catch (x) { return String(s).length * size * 0.55; }
    }
    function wrapTo(s, max, cls, size) {
      var out = [], cur = '';
      String(s).split(/\s+/).forEach(function (w) {
        var t = cur ? cur + ' ' + w : w;
        if (cur && measure(t, cls, size) > max) { out.push(cur); cur = w; } else cur = t;
      });
      if (cur) out.push(cur);
      return out;
    }
    function clipTo(s, max, cls, size) {   // the longest start of s, with an ellipsis, that fits max
      s = String(s); if (measure(s, cls, size) <= max) return s;
      var lo = 0, hi = s.length;
      while (lo < hi) { var mid = (lo + hi + 1) >> 1; if (measure(s.slice(0, mid).trimEnd() + '…', cls, size) <= max) lo = mid; else hi = mid - 1; }
      return s.slice(0, lo).trimEnd() + '…';
    }

    /* ---------- layout ---------- */
    function sizes(nr, nc) {
      var c = options.compact;
      var key = plane ? 'plane' : c === true || (c !== false && (nr > 60 || nr * nc > 900)) ? 'compact' : 'normal';
      var S = Object.assign({key: key}, SIZES[key]);
      ['cw', 'ch', 'gap', 'fs', 'ms', 'rowMax', 'colH'].forEach(function (k) { if (options[k] != null) S[k] = options[k]; });
      return S;
    }
    var LY = {};   // layers
    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      mtext = null;
      var vr = visRows(), vc = visCols(), S = sizes(vr.length, vc.length), m = options.margin != null ? options.margin : 8;
      var tot = options.totals ? Object.assign({rows: true, cols: true}, options.totals === true ? {} : options.totals) : null;
      var totStates = tot ? (tot.states || legend.map(function (s) { return s.id; })) : [];
      var marks = options.marks !== false;
      var hasRG = vr.some(function (r) { return r.group && rgroups[r.group]; }), hasCG = vc.some(function (c) { return c.group && cgroups[c.group]; });
      var rgMode = options.rowGroups || 'side', clip = !!options.clip, axes = options.axes || null;
      var defs = el('defs', {}, svg);
      ['legend', 'groups', 'bands', 'heads', 'cells', 'marks', 'items', 'totals', 'axes', 'cursor'].forEach(function (k) { LY[k] = el('g', {'class': 'em-l-' + k}, svg); });

      /* the cell width, from the marks and the items */
      var maxMark = 0, ip = 6, ih = 26;
      if (marks) Object.keys(cells).forEach(function (k) { var v = cells[k]; if (v.mark != null && v.mark !== '') maxMark = Math.max(maxMark, measure(v.mark, 'em-m', S.ms)); });
      items.forEach(function (it) {
        var lw = it.label ? measure(it.label, '', 11.5) : 0;
        it.w = it.label ? Math.ceil(8 + (it.icon ? 15 + 5 : 0) + lw + 9) : ih;
      });
      var maxItem = items.reduce(function (a, it) { return Math.max(a, it.w); }, 0);
      var base = Math.max(S.cw, maxMark ? Math.min(maxMark + 6, S.cw * 2) : 0, maxItem ? maxItem + 2 * ip : 0);   // a mark widens a cell up to twice

      /* column headers: across, or turned to read bottom to top */
      var labW = vc.map(function (c) { return measure(colText(c), 'em-h', S.fs); }), maxLab = Math.max.apply(null, [0].concat(labW));
      var rot = options.rotate === true || (options.rotate !== false && !plane && maxLab + 8 > base * 1.6);
      var colW = base, hh, colLines = {};
      if (rot) hh = Math.min(S.colH, Math.ceil(maxLab + 10));
      else if (plane) {
        var longest = 0;
        vc.forEach(function (c) { String(colText(c)).split(/\s+/).forEach(function (w) { longest = Math.max(longest, measure(w, 'em-h', S.fs)); }); });
        colW = Math.max(base, Math.ceil(longest + 12));
        var nl = 1; vc.forEach(function (c) { colLines[c.id] = wrapTo(colText(c), colW - 8, 'em-h', S.fs); nl = Math.max(nl, colLines[c.id].length); });
        hh = nl * S.lh + 10;
      } else { colW = Math.max(base, Math.ceil(maxLab + 8)); hh = S.fs + 12; }

      /* totals columns */
      var totW = 0;
      if (tot && tot.rows) {
        totW = Math.max(S.cw, measure(String(vc.length), 'em-tot', S.ms) + 8);
        if (!rot) totStates.forEach(function (s) { totW = Math.max(totW, measure(L[s].label, 'em-h', S.fs) + 8); });
        else hh = Math.max(hh, Math.min(S.colH, Math.ceil(Math.max.apply(null, totStates.map(function (s) { return measure(L[s].label, 'em-h', S.fs); })) + 10)));
      }

      /* row headers: an optional code column, then the label */
      var codeW = 0; vr.forEach(function (r) { if (r.code) codeW = Math.max(codeW, measure(r.code, 'em-code', S.fs - 1)); });
      if (codeW) codeW = Math.ceil(codeW + 8);
      var labMax = 0; vr.forEach(function (r) { labMax = Math.max(labMax, measure(r.label, 'em-h', S.fs)); });
      if (tot && tot.cols) totStates.forEach(function (s) { labMax = Math.max(labMax, measure(L[s].label, 'em-h', S.fs) - codeW); });
      var corner = options.corner || '';
      if (corner && !rot) labMax = Math.max(labMax, measure(corner, 'em-corner', S.gs) - codeW);
      var rowW = codeW + Math.min(S.rowMax, Math.ceil(labMax + 4));
      var rowLines = {};
      vr.forEach(function (r) {
        var room = rowW - codeW;
        rowLines[r.id] = plane ? wrapTo(r.label, room, 'em-h', S.fs) : [clip ? clipTo(r.label, room, 'em-h', S.fs) : String(r.label)];
      });

      /* row groups, beside the rows or as a band above each */
      var gw = 0;
      if (hasRG && rgMode === 'side') {
        var gmax = 0; rgOrder.forEach(function (g) { String(rgroups[g].label).split(/\s+/).forEach(function (w) { gmax = Math.max(gmax, measure(w, 'em-gt', S.gs)); }); });
        rgOrder.forEach(function (g) { gmax = Math.max(gmax, Math.min(options.groupW || 130, measure(rgroups[g].label, 'em-gt', S.gs))); });
        gw = Math.ceil(gmax + 14);
      }

      /* x: axis, row groups, row headers, columns, totals */
      var x = m, yAxisX = null;
      if (axes && axes.y) { yAxisX = x + 6; x += 34; }
      var xg = x; if (gw) x += gw + 6;
      var xr = x; x += rowW + 10;
      var x0 = x, prevG = null;
      vc.forEach(function (c, i) { if (i && c.group !== prevG) x += S.ggap; c._x = x; x += colW + S.gap; prevG = c.group; });
      var gridR = x - S.gap, xt = gridR + 12;
      if (tot && tot.rows) x = xt + totStates.length * (totW + S.gap) - S.gap;
      else x = gridR;
      var W = Math.ceil(x + m);
      if (axes && axes.x) W = Math.max(W, Math.ceil(gridR + 18 + m));

      /* the legend: entries flow left to right, wrapping at the width */
      var y = m, lgH = 0, lgEls = [];
      if (options.legend !== false && legend.length && !(plane && !Object.keys(cells).length)) {
        var lx = m, lsz = Math.min(14, S.ch), row0 = y, lfs = Math.max(11, S.fs);
        legend.forEach(function (s) {
          var tw = measure(s.label, '', lfs), w = lsz + 6 + tw + 18;
          if (lx > m && lx + w - 18 > W - m) { lx = m; row0 += 20; }
          lgEls.push({s: s, x: lx, y: row0, w: w - 18, tw: tw});
          lx += w;
        });
        lgH = row0 + 18 - y; y += lgH + 12;
        lgEls.forEach(function (e) {
          var g = el('g', {'class': 'em-lg', 'data-state': e.s.id, tabindex: options.keys === false ? null : 0, role: 'button', 'aria-pressed': 'false',
            'aria-label': 'Highlight ' + e.s.label}, LY.legend);
          el('rect', {'class': 'em-lgk', x: e.x - 3, y: e.y - 1, width: e.w + 6, height: 18, rx: 4}, g);
          el('rect', {'class': 'em-c ' + cellCls(e.s), x: e.x, y: e.y + 9 - lsz / 2, width: lsz, height: lsz, rx: S.rx}, g);
          el('text', {x: e.x + lsz + 6, y: e.y + 9 + lfs * 0.35, 'font-size': lfs}, g, e.s.label);
          e.g = g;
        });
      }

      /* y: column groups, headers, rows, column totals, axis */
      var gTop = y; if (hasCG) y += 22;
      var hTop = y; y += hh; var hBot = y; y += 5;
      var y0 = y, prevRG = null, headH = S.lh + 8;
      vr.forEach(function (r, i) {
        var gChange = r.group !== prevRG;
        if (hasRG && rgMode === 'head' && gChange && r.group && rgroups[r.group]) { r._head = y; y += headH; } else r._head = null;
        if (i && gChange && rgMode !== 'head') y += S.ggap;
        var h = S.ch;
        if (plane) {
          h = Math.max(h, rowLines[r.id].length * S.lh + 10);
          vc.forEach(function (c) { h = Math.max(h, flow(r.id, c.id, colW, ip, ih).h); });
        }
        r._y = y; r._h = h; y += h + S.gap; prevRG = r.group;
      });
      var gridB = y - S.gap, yt = gridB + 12, totH = S.ch, totRot = false;
      if (tot && tot.cols) {   // counts that do not fit across a column are turned, in taller rows
        var dw = measure(String(vr.length), 'em-tot', S.ms) + 4;
        if (dw > colW) { totRot = true; totH = Math.ceil(dw + 4); }
        y = yt + totStates.length * (totH + S.gap) - S.gap;
      } else y = gridB;
      var xAxisY = null;
      if (axes && axes.x) { xAxisY = y + 12; y += 40; }
      var H = Math.ceil(y + m);
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      if (options.maxScale !== 0) svg.style.maxWidth = Math.round(W * (options.maxScale || 1.15)) + 'px';
      view = {S: S, W: W, H: H, vr: vr, vc: vc, colW: colW, hh: hh, rot: rot, xr: xr, rowW: rowW, codeW: codeW, x0: x0, gridR: gridR, y0: y0, gridB: gridB,
              hTop: hTop, hBot: hBot, totH: totH, gTop: gTop, xg: xg, gw: gw, xt: xt, yt: yt, totW: totW, totStates: totStates, tot: tot, lg: lgEls, checks: []};

      /* column groups */
      var runs = runsOf(vc, function (c) { return c.group && cgroups[c.group] ? c.group : null; });
      runs.forEach(function (run) {
        var a = run.list[0]._x, b = run.list[run.list.length - 1]._x + colW, g = el('g', {'class': 'em-g', 'data-cg': run.key}, LY.groups);
        el('rect', {x: a, y: gTop, width: b - a, height: 18, rx: 4}, g);
        var lab = clip ? clipTo(cgroups[run.key].label, b - a - 8, 'em-gt', S.gs) : cgroups[run.key].label;
        var t = el('text', {x: (a + b) / 2, y: gTop + 9 + S.gs * 0.36, 'text-anchor': 'middle', 'font-size': S.gs}, g, lab);
        view.checks.push({kind: 'cgroup', t: t, max: b - a - 4, name: cgroups[run.key].label});
        run.el = g;
      });
      view.cruns = runs;

      /* row groups */
      var rruns = runsOf(vr, function (r) { return r.group && rgroups[r.group] ? r.group : null; });
      rruns.forEach(function (run) {
        var top = run.list[0]._y, bot = run.list[run.list.length - 1]._y + run.list[run.list.length - 1]._h;
        var g = el('g', {'class': 'em-g', 'data-rg': run.key}, LY.groups), G = rgroups[run.key];
        if (rgMode === 'head') {
          var hy = run.list[0]._head != null ? run.list[0]._head : top - headH;
          el('rect', {x: xr - 4, y: hy + 1, width: (tot && tot.rows ? x - xr : gridR - xr) + 8 - 0, height: headH - 4, rx: 4}, g);
          var ht = el('text', {x: xr, y: hy + 1 + (headH - 4) / 2 + S.gs * 0.36, 'font-size': S.gs}, g, G.label);
          view.checks.push({kind: 'rgroup', t: ht, max: (tot && tot.rows ? x - xr : gridR - xr), name: G.label});
        } else {
          el('rect', {x: xg, y: top - 1, width: gw, height: bot - top + 2, rx: 4}, g);
          var lines = wrapTo(G.label, gw - 12, 'em-gt', S.gs), lh = S.gs + 3;
          var tg = el('text', {x: xg + 7, y: top + 4 + S.gs * 0.85, 'font-size': S.gs}, g);
          lines.forEach(function (s, i) { el('tspan', {x: xg + 7, dy: i ? lh : 0}, tg, s); });
          view.checks.push({kind: 'rgroup', t: tg, max: gw - 6, maxH: bot - top, name: G.label});
        }
        run.el = g;
      });
      view.rruns = rruns;

      /* hover bands and the cursor */
      view.bandR = el('rect', {'class': 'em-band', x: xr - 4, height: 0, width: 0, display: 'none'}, LY.bands);
      view.bandC = el('rect', {'class': 'em-band', y: hTop, width: 0, height: 0, display: 'none'}, LY.bands);
      view.cursor = el('rect', {'class': 'em-cursor', rx: S.rx + 1, display: 'none'}, LY.cursor);

      /* corner */
      if (corner) {
        var ct = el('text', {'class': 'em-corner', x: xr, y: hBot - 6, 'font-size': S.gs}, LY.heads, corner);
        view.checks.push({kind: 'corner', t: ct, max: rot ? x0 - xr - 6 : rowW + 6, name: corner});
      }

      /* column headers */
      vc.forEach(function (c) {
        var g = el('g', {'data-c': c.id}, LY.heads), cx = c._x + colW / 2, t;
        if (rot) {
          var bx = r1(cx + S.fs * 0.36), by = hBot - 5, room = hh - 8, s = clip ? clipTo(colText(c), room, 'em-h', S.fs) : colText(c);
          t = el('text', {'class': 'em-h', x: bx, y: by, 'font-size': S.fs, transform: 'rotate(-90 ' + bx + ' ' + by + ')'}, g, s);
          view.checks.push({kind: 'colrot', t: t, max: room + 2, name: c.label});
        } else {
          var lines = plane ? colLines[c.id] : [clip ? clipTo(colText(c), colW - 4, 'em-h', S.fs) : colText(c)];
          t = el('text', {'class': 'em-h', x: cx, y: hBot - 6 - (lines.length - 1) * S.lh, 'text-anchor': 'middle', 'font-size': S.fs}, g);
          lines.forEach(function (s, i) { el('tspan', {x: cx, dy: i ? S.lh : 0}, t, s); });
          view.checks.push({kind: 'col', t: t, max: colW + (plane ? 0 : S.gap) - 1, name: c.label});
        }
        if (c.info || clip) el('title', {}, g, c.label + (c.info ? ': ' + c.info : ''));
        c._els = [g]; c._t = t;
      });

      /* row headers */
      vr.forEach(function (r) {
        var g = el('g', {'data-r': r.id}, LY.heads), lines = rowLines[r.id], cy = r._y + r._h / 2;
        var by = r1(cy + S.fs * 0.36 - (lines.length - 1) * S.lh / 2);
        if (r.code) el('text', {'class': 'em-code', x: xr, y: by, 'font-size': S.fs - 1}, g, r.code);
        var t = el('text', {'class': 'em-h', x: xr + codeW, y: by, 'font-size': S.fs}, g);
        lines.forEach(function (s, i) { el('tspan', {x: xr + codeW, dy: i ? S.lh : 0}, t, s); });
        if (r.info || clip) el('title', {}, g, r.label + (r.info ? ': ' + r.info : ''));
        view.checks.push({kind: 'row', t: t, max: rowW - codeW + 2, maxH: r._h + S.gap, name: r.label});
        r._els = [g]; r._t = t;
      });

      /* cells and marks */
      view.cells = [];
      vr.forEach(function (r) {
        vc.forEach(function (c) {
          var v = api.get(r.id, c.id), s = v && v.state ? L[v.state] : null;
          var rect = el('rect', {'class': 'em-c ' + (plane && !s ? 'em-pc' : s ? cellCls(s) : 'empty'), x: c._x, y: r._y, width: colW, height: r._h, rx: S.rx,
            'data-r': r.id, 'data-c': c.id}, LY.cells);
          var cell = {r: r, c: c, v: v, s: s, rect: rect, els: [rect]};
          if (marks && v && v.mark != null && v.mark !== '') {
            var mt = el('text', {'class': 'em-m' + (s && s.style === 'solid' ? ' on' : ''), x: r1(c._x + colW / 2), y: r1(r._y + r._h / 2 + S.ms * 0.36), 'font-size': S.ms}, LY.marks, String(v.mark));
            cell.els.push(mt); cell.mark = mt;
          }
          view.cells.push(cell);
        });
      });

      /* items (plane) */
      view.items = [];
      vr.forEach(function (r) {
        vc.forEach(function (c) {
          var f = flow(r.id, c.id, colW, ip, ih); if (!f.list.length) return;
          var top = r._y + (r._h - f.h) / 2 + ip;
          f.lines.forEach(function (line, li) {
            var lw = line.reduce(function (a, it) { return a + it.w; }, 0) + (line.length - 1) * 5, ix = c._x + (colW - lw) / 2;
            line.forEach(function (it) {
              var g = el('g', {'class': 'em-item t-' + (it.tone || 'neutral'), 'data-i': it.id, 'data-r': r.id, 'data-c': c.id}, LY.items);
              var iy = top + li * (ih + 5);
              el('rect', {x: r1(ix), y: r1(iy), width: it.w, height: ih, rx: 5}, g);
              var tx = ix + 8;
              if (it.icon) { el('use', {href: '#i-' + it.icon, x: r1(it.label ? ix + 7 : ix + (ih - 16) / 2), y: r1(iy + (ih - 16) / 2), width: 16, height: 16}, g); tx += 20; }
              var t = it.label ? el('text', {x: r1(tx), y: r1(iy + ih / 2 + 4), 'font-size': 11.5}, g, it.label) : null;
              if (it.info) {
                el('title', {}, g, (it.label || it.id) + ': ' + it.info);
                g.setAttribute('tabindex', '0'); g.setAttribute('role', 'img'); g.setAttribute('aria-label', (it.label || it.id) + '. ' + it.info);
              }
              view.items.push({it: it, g: g, t: t, box: {x: ix, y: iy, w: it.w, h: ih}, cell: {x: c._x, y: r._y, w: colW, h: r._h}});
              ix += it.w + 5;
            });
          });
        });
      });

      /* totals */
      view.totR = {}; view.totC = {}; view.totHead = [];
      if (tot && tot.rows) totStates.forEach(function (s, j) {
        var tx = xt + j * (totW + S.gap), g = el('g', {'class': 'em-th'}, LY.totals), cx = tx + totW / 2, t;
        if (rot) {
          var bx = r1(cx + S.fs * 0.36), by = hBot - 5;
          t = el('text', {'class': 'em-h', x: bx, y: by, 'font-size': S.fs, transform: 'rotate(-90 ' + bx + ' ' + by + ')'}, g, L[s].label);
          view.checks.push({kind: 'colrot', t: t, max: hh - 6, name: L[s].label});
        } else {
          t = el('text', {'class': 'em-h', x: cx, y: hBot - 6, 'text-anchor': 'middle', 'font-size': S.fs}, g, L[s].label);
          view.checks.push({kind: 'col', t: t, max: totW + S.gap - 1, name: L[s].label});
        }
        view.totHead.push(g);
        vr.forEach(function (r) {
          var n = api.counts(r.id)[s], gg = el('g', {'data-r': r.id}, LY.totals);
          if (n) el('rect', {'class': 'em-totc t-' + L[s].tone, x: tx, y: r._y, width: totW, height: r._h, rx: S.rx}, gg);
          var tt = el('text', {'class': 'em-tot' + (n ? '' : ' zero'), x: r1(cx), y: r1(r._y + r._h / 2 + S.ms * 0.36), 'font-size': S.ms}, gg, String(n));
          view.checks.push({kind: 'tot', t: tt, max: totW - 2, name: L[s].label + ' of ' + r.label});
          (view.totR[r.id] = view.totR[r.id] || []).push(gg);
        });
      });
      if (tot && tot.cols) totStates.forEach(function (s, j) {
        var ty = yt + j * (totH + S.gap), g = el('g', {'class': 'em-th'}, LY.totals);
        el('text', {'class': 'em-h', x: xr + codeW, y: r1(ty + totH / 2 + S.fs * 0.36), 'font-size': S.fs}, g, L[s].label);
        view.totHead.push(g);
        vc.forEach(function (c) {
          var n = api.counts(c.id)[s], gg = el('g', {'data-c': c.id}, LY.totals);
          if (n) el('rect', {'class': 'em-totc t-' + L[s].tone, x: c._x, y: ty, width: colW, height: totH, rx: S.rx}, gg);
          var tx2 = r1(c._x + colW / 2), ty2 = r1(ty + totH / 2 + S.ms * 0.36);
          var tt = el('text', {'class': 'em-tot' + (n ? '' : ' zero'), x: tx2, y: ty2, 'font-size': S.ms}, gg, String(n));
          if (totRot) { tx2 = r1(c._x + colW / 2 + S.ms * 0.36); ty2 = r1(ty + totH / 2); tt.setAttribute('x', tx2); tt.setAttribute('y', ty2); tt.setAttribute('transform', 'rotate(-90 ' + tx2 + ' ' + ty2 + ')'); }
          view.checks.push({kind: totRot ? 'colrot' : 'tot', t: tt, max: totRot ? totH - 2 : colW - 2, name: L[s].label + ' of ' + c.label});
          (view.totC[c.id] = view.totC[c.id] || []).push(gg);
        });
      });

      /* axes (plane): arrows along the left and the bottom, at right angles */
      if (axes) {
        var mk = el('marker', {id: 'em-' + self + '-head', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 8, markerHeight: 8, orient: 'auto', markerUnits: 'userSpaceOnUse'}, defs);
        el('path', {d: 'M0 1 L10 5 L0 9 Z', 'class': 'em-axis-head'}, mk);
        if (axes.y) {
          var up = axes.yDir !== 'down';
          el('path', {'class': 'em-axis', d: 'M' + yAxisX + ' ' + (up ? gridB : hTop) + ' V' + (up ? hTop : gridB), 'marker-end': 'url(#' + mk.id + ')'}, LY.axes);
          var ay = (hTop + gridB) / 2, axl = yAxisX + 18;
          var at = el('text', {'class': 'em-axis-l', x: axl, y: ay, 'text-anchor': 'middle', 'font-size': S.gs, transform: 'rotate(-90 ' + axl + ' ' + ay + ')'}, LY.axes, axes.y);
          view.checks.push({kind: 'colrot', t: at, max: gridB - hTop, name: axes.y});
        }
        if (axes.x) {
          el('path', {'class': 'em-axis', d: 'M' + x0 + ' ' + xAxisY + ' H' + (gridR + 8), 'marker-end': 'url(#' + mk.id + ')'}, LY.axes);
          var xt2 = el('text', {'class': 'em-axis-l', x: (x0 + gridR) / 2, y: xAxisY + 20, 'text-anchor': 'middle', 'font-size': S.gs}, LY.axes, axes.x);
          view.checks.push({kind: 'col', t: xt2, max: gridR - x0, name: axes.x});
        }
      }
      if (mtext && mtext.g.parentNode) mtext.g.parentNode.removeChild(mtext.g);
      mtext = null;
      bind();
      drawn = true;
      // what was on before the drawing: the step, the highlight, the cursor
      if (stepsCtl) applyStep(state.step, false);
      applyHighlight();
      if (state.cursor && R[state.cursor.r] && C[state.cursor.c]) moveCursor(state.cursor.r, state.cursor.c, false);
    }
    function colText(c) { return c.code && options.colCodes !== false ? c.code + (c.label && c.label !== c.id ? ' ' + c.label : '') : String(c.label); }
    function cellCls(s) { return 's-' + (s.style || 'soft') + ' t-' + (s.tone || 'neutral'); }
    function runsOf(list, key) {
      var out = [];
      list.forEach(function (x) { var k = key(x), last = out[out.length - 1]; if (last && last.key === k) last.list.push(x); else out.push({key: k, list: [x]}); });
      return out.filter(function (r) { return r.key != null; });
    }
    function flow(r, c, colW, ip, ih) {   // items of a cell in lines that fit the column
      var list = items.filter(function (it) { return it.row === r && it.col === c; }), lines = [], cur = [], w = 0, room = colW - 2 * ip;
      list.forEach(function (it) {
        if (cur.length && w + 5 + it.w > room) { lines.push(cur); cur = []; w = 0; }
        w += (cur.length ? 5 : 0) + it.w; cur.push(it);
      });
      if (cur.length) lines.push(cur);
      return {list: list, lines: lines, h: lines.length ? lines.length * ih + (lines.length - 1) * 5 + 2 * ip : 0};
    }
    api.render = function () { if (!drawn) render(); return api; };
    api.redraw = function () { render(); return api; };

    /* ---------- hover, keyboard and info ---------- */
    var statusEl = typeof options.status === 'string' ? document.querySelector(options.status) : options.status || null;
    var idle = statusEl ? statusEl.textContent : '';
    var tip = null;
    if (!statusEl && options.tooltip !== false) {
      tip = document.createElement('div'); tip.className = 'em-tip'; tip.setAttribute('role', 'status'); tip.hidden = true;
      (document.body || document.documentElement).appendChild(tip);
    }
    function describe(r, c) {
      var v = api.get(r, c), s = v && v.state ? L[v.state] : null;
      var its = items.filter(function (it) { return it.row === r && it.col === c; });
      var lines = [C[c].label];
      if (s || (v && v.mark != null)) lines.push((s ? s.label : '') + (v && v.mark != null && v.mark !== '' ? (s ? ' · ' : '') + v.mark : ''));
      if (its.length) lines.push(its.map(function (it) { return it.label || it.id; }).join(', '));
      if (v && v.info) lines.push(v.info);
      if (options.describe) return options.describe(R[r], C[c], v, its);
      return {title: (R[r].code ? R[r].code + ' ' : '') + R[r].label, lines: lines};
    }
    function show(info, target) {
      var d = typeof info === 'string' ? {title: info, lines: []} : info;
      if (statusEl) { statusEl.textContent = [d.title].concat(d.lines).join(' · '); return; }
      if (!tip) return;
      tip.textContent = '';
      var b = document.createElement('b'); b.textContent = d.title; tip.appendChild(b);
      d.lines.forEach(function (l) { var s = document.createElement('span'); s.textContent = l; tip.appendChild(s); });
      tip.hidden = false;
      var vw = document.documentElement.clientWidth || global.innerWidth, vh = global.innerHeight;
      var rc = target.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight;
      var left = Math.max(8, Math.min(vw - w - 8, rc.left + rc.width / 2 - w / 2)), top = rc.top - h - 10;
      if (top < 8) top = rc.bottom + 10;
      if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
      tip.style.left = left + 'px'; tip.style.top = top + 'px';
    }
    function hide() { if (statusEl) statusEl.textContent = idle; if (tip) tip.hidden = true; }
    function cellOf(r, c) { return view && view.cells.filter(function (x) { return x.r.id === r && x.c.id === c; })[0]; }
    function hot(r, c) {
      if (!view) return;
      var S = view.S;
      [].forEach.call(svg.querySelectorAll('.em-hot'), function (e) { e.classList.remove('em-hot'); });
      var rr = r && R[r] && R[r]._els ? R[r] : null, cc = c && C[c] && C[c]._els ? C[c] : null;
      if (rr && view.vr.indexOf(rr) >= 0) {
        var right = view.tot && view.tot.rows ? view.xt + view.totStates.length * (view.totW + S.gap) : view.gridR;
        view.bandR.setAttribute('y', rr._y - S.gap / 2); view.bandR.setAttribute('height', rr._h + S.gap);
        view.bandR.setAttribute('width', right - view.xr + 6); view.bandR.removeAttribute('display');
        rr._t.classList.add('em-hot'); var code = rr._els[0].querySelector('.em-code'); if (code) code.classList.add('em-hot');
      } else view.bandR.setAttribute('display', 'none');
      if (cc && view.vc.indexOf(cc) >= 0) {
        var bottom = view.tot && view.tot.cols ? view.yt + view.totStates.length * (view.totH + S.gap) : view.gridB;
        view.bandC.setAttribute('x', cc._x - S.gap / 2); view.bandC.setAttribute('width', view.colW + S.gap);
        view.bandC.setAttribute('height', bottom - view.hTop + 2); view.bandC.removeAttribute('display');
        cc._t.classList.add('em-hot');
      } else view.bandC.setAttribute('display', 'none');
    }
    function unhot() {
      if (!view) return;
      view.bandR.setAttribute('display', 'none'); view.bandC.setAttribute('display', 'none');
      [].forEach.call(svg.querySelectorAll('.em-hot'), function (e) { e.classList.remove('em-hot'); });
    }
    function isOn(e) { return !e.classList.contains('em-off') && !(e.closest && e.closest('.em-off')); }
    function onCells() { return view.cells.filter(function (x) { return isOn(x.rect); }); }
    function moveCursor(r, c, announce) {
      var x = cellOf(r, c); if (!x) return;
      state.cursor = {r: r, c: c};
      var p = x.rect, S = view.S;
      view.cursor.setAttribute('x', +p.getAttribute('x') - 1.5); view.cursor.setAttribute('y', +p.getAttribute('y') - 1.5);
      view.cursor.setAttribute('width', +p.getAttribute('width') + 3); view.cursor.setAttribute('height', +p.getAttribute('height') + 3);
      view.cursor.setAttribute('rx', S.rx + 1); view.cursor.removeAttribute('display');
      hot(r, c);
      if (announce !== false) {
        show(describe(r, c), p);
        if (p.scrollIntoView && document.activeElement === svg) try { p.scrollIntoView({block: 'nearest', inline: 'nearest'}); } catch (e) {}
      }
    }
    function clearCursor() { state.cursor = null; if (view) view.cursor.setAttribute('display', 'none'); unhot(); hide(); }
    var bound = false;
    function bind() {
      if (bound) return; bound = true;
      if (options.keys !== false) { svg.setAttribute('tabindex', '0'); svg.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown ArrowLeft ArrowRight Home End PageUp PageDown Escape'); }
      svg.addEventListener('pointermove', function (e) {
        var t = e.target.closest && e.target.closest('[data-r],[data-c]');
        if (!t || !svg.contains(t) || !isOn(t)) { if (!state.cursor) { unhot(); hide(); } else moveCursor(state.cursor.r, state.cursor.c, false); return; }
        var r = t.getAttribute('data-r'), c = t.getAttribute('data-c');
        hot(r, c);
        if (r && c) show(t.getAttribute('data-i') ? itemInfo(I[t.getAttribute('data-i')]) : describe(r, c), t);
        else show(r ? R[r].label + (R[r].info ? ': ' + R[r].info : '') : C[c].label + (C[c].info ? ': ' + C[c].info : ''), t);
      });
      svg.addEventListener('pointerleave', function () { if (state.cursor && document.activeElement === svg) moveCursor(state.cursor.r, state.cursor.c); else { unhot(); hide(); } });
      svg.addEventListener('click', function (e) {
        var lg = e.target.closest && e.target.closest('.em-lg');
        if (lg) { toggleLegend(lg.getAttribute('data-state')); return; }
        var t = e.target.closest && e.target.closest('[data-r][data-c]');
        if (t && isOn(t)) { if (options.keys !== false) svg.focus({preventScroll: true}); moveCursor(t.getAttribute('data-r'), t.getAttribute('data-c')); }
      });
      svg.addEventListener('focusin', function (e) {
        var it = e.target.closest && e.target.closest('.em-item[tabindex]');
        if (it) { hot(it.getAttribute('data-r'), it.getAttribute('data-c')); show(itemInfo(I[it.getAttribute('data-i')]), it); }
      });
      svg.addEventListener('focus', function () {
        if (!view) return;
        var on = onCells(); if (!on.length) return;
        var cur = state.cursor && cellOf(state.cursor.r, state.cursor.c);
        if (!cur || !isOn(cur.rect)) cur = on[0];
        moveCursor(cur.r.id, cur.c.id);
      });
      svg.addEventListener('blur', function () { if (view) view.cursor.setAttribute('display', 'none'); unhot(); hide(); });
      svg.addEventListener('keydown', function (e) {
        if (e.ctrlKey || e.metaKey || e.altKey) return;
        var lg = e.target.closest && e.target.closest('.em-lg');
        if (lg && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleLegend(lg.getAttribute('data-state')); return; }
        if (e.target !== svg || !view) return;
        var on = onCells(); if (!on.length) return;
        var rs = [], cs = [];
        on.forEach(function (x) { if (rs.indexOf(x.r) < 0) rs.push(x.r); if (cs.indexOf(x.c) < 0) cs.push(x.c); });
        var cur = state.cursor || {r: on[0].r.id, c: on[0].c.id};
        var i = Math.max(0, rs.indexOf(R[cur.r])), j = Math.max(0, cs.indexOf(C[cur.c]));
        var k = e.key, ni = i, nj = j;
        if (k === 'ArrowDown') ni++; else if (k === 'ArrowUp') ni--; else if (k === 'ArrowRight') nj++; else if (k === 'ArrowLeft') nj--;
        else if (k === 'PageDown') ni += 10; else if (k === 'PageUp') ni -= 10; else if (k === 'Home') nj = 0; else if (k === 'End') nj = cs.length - 1;
        else if (k === 'Escape') { clearCursor(); return; } else return;
        e.preventDefault(); e.stopPropagation();
        ni = Math.max(0, Math.min(rs.length - 1, ni)); nj = Math.max(0, Math.min(cs.length - 1, nj));
        moveCursor(rs[ni].id, cs[nj].id);
      });
    }
    function itemInfo(it) { return {title: it.label || it.id, lines: [R[it.row].label + ' × ' + C[it.col].label].concat(it.info ? [it.info] : [])}; }
    api.focus = function (r, c) { api.render(); if (r == null) clearCursor(); else moveCursor(r, c); return api; };

    /* ---------- filter and highlight ---------- */
    // filter: null, 'gaps' (rows with a cell in a state marked gap), {states: [...]}, {rows: [ids] | fn(row, counts)}, {cols: [ids] | fn(col)}
    api.filter = function (spec) { state.filter = spec || null; render(); return api; };
    // highlight: null, {states: [...]}, {rows: [ids]}, {cols: [ids]}, {groups: [ids]} or fn(row, col, value); the rest is dimmed
    api.highlight = function (spec) { state.hl = spec || null; state.legendHl = null; api.render(); applyHighlight(); return api; };
    function toggleLegend(id) {
      state.legendHl = state.legendHl === id ? null : id;
      state.hl = state.legendHl ? {states: [state.legendHl]} : null;
      applyHighlight();
    }
    function match(spec, x) {
      if (typeof spec === 'function') return !!spec(x.r, x.c, x.v);
      var ok = true;
      if (spec.states) ok = ok && !!(x.v && spec.states.indexOf(x.v.state) >= 0);
      if (spec.rows) ok = ok && spec.rows.indexOf(x.r.id) >= 0;
      if (spec.cols) ok = ok && spec.cols.indexOf(x.c.id) >= 0;
      if (spec.groups) ok = ok && (spec.groups.indexOf(x.r.group) >= 0 || spec.groups.indexOf(x.c.group) >= 0);
      return ok;
    }
    function applyHighlight() {
      if (!view) return;
      var spec = stepHl || state.hl, rowsOn = {}, colsOn = {};
      view.cells.forEach(function (x) {
        var on = !spec || match(spec, x);
        if (on) { rowsOn[x.r.id] = 1; colsOn[x.c.id] = 1; }
        x.els.forEach(function (e) { e.classList.toggle('em-dim', !on); });
      });
      view.items.forEach(function (x) { x.g.classList.toggle('em-dim', !!spec && !match(spec, cellOf(x.it.row, x.it.col) || {r: R[x.it.row], c: C[x.it.col], v: null})); });
      view.vr.forEach(function (r) { r._els.forEach(function (e) { e.classList.toggle('em-dim', !!spec && !rowsOn[r.id]); }); });
      view.vc.forEach(function (c) { c._els.forEach(function (e) { e.classList.toggle('em-dim', !!spec && !colsOn[c.id]); }); });
      view.lg.forEach(function (e) { var on = state.legendHl === e.s.id; e.g.classList.toggle('on', on); e.g.setAttribute('aria-pressed', on ? 'true' : 'false'); });
    }

    /* ---------- steps ---------- */
    var stepsCtl = null, stepList = null, stepAt = null, stepHl = null;
    api.steps = function (list, o) {
      o = o || {};
      api.render();
      if (!list) {
        var gs = rgOrder.filter(function (g) { return rows.some(function (r) { return r.group === g; }); }), key = 'rows';
        if (!gs.length) { gs = cgOrder.filter(function (g) { return cols.some(function (c) { return c.group === g; }); }); key = 'cols'; }
        list = [{show: [], caption: o.caption0 || ''}];
        gs.forEach(function (g) { var G = key === 'rows' ? rgroups[g] : cgroups[g]; list.push({show: [g], caption: G.caption || ''}); });
        if (gs.length && options.totals) list.push({show: ['totals'], caption: o.captionTotals || ''});
        if (list.length === 1) list[0].show = rows.map(function (r) { return r.id; });
      }
      var at = {rows: {}, cols: {}, items: {}, totals: null}, anyR = false, anyC = false, anyI = false;
      list.forEach(function (s, k) {
        (s.show || []).forEach(function (id) {
          var hit = false;
          if (id === 'totals') { if (at.totals == null) at.totals = k; hit = true; }
          rows.forEach(function (r) { if (r.id === id || r.group === id) { hit = true; anyR = true; if (at.rows[r.id] == null) at.rows[r.id] = k; } });
          cols.forEach(function (c) { if (c.id === id || c.group === id) { hit = true; anyC = true; if (at.cols[c.id] == null) at.cols[c.id] = k; } });
          if (I[id]) { hit = true; anyI = true; if (at.items[id] == null) at.items[id] = k; }
          if (!hit) throw new Error('EdgeMatrix: unknown row, column, group or item ' + id);
        });
      });
      if (at.totals == null) at.totals = anyR || anyC ? list.length - 1 : 0;
      at.anyR = anyR; at.anyC = anyC; at.anyI = anyI;
      stepList = list; stepAt = at;
      var G = global.gsap, tl = null;
      if (G) {
        tl = G.timeline({paused: true});
        list.forEach(function (s, k) { tl.addLabel('s' + k, k * 0.5); });
        tl.to({}, {duration: 0.01}, (list.length - 1) * 0.5);
        tl.onStep = function (k) { if (k >= 0) apply(k, true); };
      }
      var told = false; DESC.prepare();
      function apply(k, anim) {
        applyStep(Math.max(0, Math.min(list.length - 1, k)), anim); if (o.onStep) o.onStep(state.step, list[state.step], stepsCtl);
        if (told) DESC.step(state.step, list.length, list[state.step].caption, shownText(list[state.step]));   // the live region reads it
      }
      stepsCtl = {
        get step() { return state.step; }, count: list.length, timeline: tl, steps: list,
        go: function (k) { apply(k, k > state.step); },
        next: function () { if (state.step < list.length - 1) apply(state.step + 1, true); },
        prev: function () { if (state.step > 0) apply(state.step - 1, false); },
        end: function () { apply(list.length - 1, false); }
      };
      apply(o.start === 'end' ? list.length - 1 : o.start || 0, false);
      told = true;
      return stepsCtl;
    };
    function applyStep(k, anim) {
      if (!stepAt || !view) { state.step = k; return; }
      state.step = k;
      var at = stepAt;
      svg.classList.toggle('em-fade', !!anim && !reduce);
      function rAt(r) { return at.anyR ? (at.rows[r.id] != null ? at.rows[r.id] : 0) : 0; }
      function cAt(c) { return at.anyC ? (at.cols[c.id] != null ? at.cols[c.id] : 0) : 0; }
      function set(e, on) { e.classList.toggle('em-off', !on); }
      view.vr.forEach(function (r) { var on = rAt(r) <= k; r._els.forEach(function (e) { set(e, on); }); r._t.classList.toggle('em-now', k > 0 && rAt(r) === k); (view.totR[r.id] || []).forEach(function (e) { set(e, on && at.totals <= k); }); });
      view.vc.forEach(function (c) { var on = cAt(c) <= k; c._els.forEach(function (e) { set(e, on); }); c._t.classList.toggle('em-now', k > 0 && cAt(c) === k); (view.totC[c.id] || []).forEach(function (e) { set(e, on && at.totals <= k); }); });
      view.totHead.forEach(function (e) { set(e, at.totals <= k); });
      view.cells.forEach(function (x) { var on = rAt(x.r) <= k && cAt(x.c) <= k; x.els.forEach(function (e) { set(e, on); }); });
      view.items.forEach(function (x) { set(x.g, rAt(R[x.it.row]) <= k && cAt(C[x.it.col]) <= k && (at.items[x.it.id] != null ? at.items[x.it.id] : 0) <= k); });
      (view.rruns || []).forEach(function (run) { set(run.el, run.list.some(function (r) { return rAt(r) <= k; })); });
      (view.cruns || []).forEach(function (run) { set(run.el, run.list.some(function (c) { return cAt(c) <= k; })); });
      stepHl = stepList[k] && stepList[k].highlight || null;
      applyHighlight();
      if (state.cursor) { var cx = cellOf(state.cursor.r, state.cursor.c); if (cx && !isOn(cx.rect)) clearCursor(); }
    }

    /* ---------- the text description: the size, the cells per state, then the rows and columns with
       gaps; a visually hidden <table> holds every cell (options.table === false leaves it out) ---------- */
    var DESC = A11Y.attach(svg, options, plane ? 'Plane' : 'Matrix', describeBlocks), table = null;
    function head(x) { return (x.code ? x.code + ' ' : '') + A11Y.plain(x.label); }
    function cellText(r, c) {
      var v = api.get(r.id, c.id), s = v && v.state ? L[v.state] : null;
      var its = items.filter(function (it) { return it.row === r.id && it.col === c.id; }).map(function (it) { return A11Y.plain(it.label) || it.id; });
      return [s ? s.label : '', v && v.mark != null ? String(v.mark) : '', its.join(', ')].filter(Boolean).join(', ');
    }
    function fillTable() {   // a real table, for reading cell by cell
      if (!table) {   // in a visually hidden box: a table grows to its content
        var wrap = document.createElement('div'); wrap.className = 'trazo-table'; wrap.style.cssText = A11Y.HIDE;
        table = wrap.appendChild(document.createElement('table'));
      }
      var b = DESC.box(), ref = b && b.parentNode ? b : svg;
      if (!table.parentNode.parentNode && ref.parentNode) ref.parentNode.insertBefore(table.parentNode, ref.nextSibling);
      table.textContent = '';
      var cap = table.createCaption(); cap.textContent = (svg.getAttribute('aria-label') || (plane ? 'Plane' : 'Matrix')) + ', every cell';
      var tr = table.createTHead().insertRow(), body = table.createTBody(), th = document.createElement('th');
      th.textContent = options.axes && options.axes.y ? A11Y.plain(options.axes.y) + ' / ' + A11Y.plain(options.axes.x || '') : ''; tr.appendChild(th);
      cols.forEach(function (c) { var h = document.createElement('th'); h.scope = 'col'; h.textContent = head(c); tr.appendChild(h); });
      rows.forEach(function (r) {
        var row = body.insertRow(), h = document.createElement('th'); h.scope = 'row'; h.textContent = head(r); row.appendChild(h);
        cols.forEach(function (c) { row.insertCell().textContent = cellText(r, c) || '—'; });
      });
    }
    function describeBlocks() {
      var out = [], n = {}, empty = 0, gapState = legend.filter(function (s) { return s.gap; }).map(function (s) { return s.id; });
      legend.forEach(function (s) { n[s.id] = 0; });
      var rgaps = [], cgaps = {};
      rows.forEach(function (r) {
        var g = [];
        cols.forEach(function (c) {
          var v = api.get(r.id, c.id);
          if (v && v.state) n[v.state]++; else empty++;
          if (v && gapState.indexOf(v.state) >= 0) { g.push(L[v.state].label.toLowerCase() + ' in ' + head(c)); cgaps[c.id] = (cgaps[c.id] || 0) + 1; }
        });
        if (g.length) rgaps.push(head(r) + ': ' + g.join(', ') + '.');
      });
      out.push((plane ? 'A plane of ' : 'A matrix of ') + rows.length + ' rows' + (plane && options.axes && options.axes.y ? ' (' + A11Y.plain(options.axes.y) + ')' : '') +
        ' by ' + cols.length + ' columns' + (plane && options.axes && options.axes.x ? ' (' + A11Y.plain(options.axes.x) + ')' : '') + '.');
      var counted = legend.filter(function (s) { return n[s.id]; }).map(function (s) { return s.label + ': ' + n[s.id]; });
      if (counted.length) out.push('Cells per state: ' + counted.join(', ') + (empty && Object.keys(cells).length ? ', empty: ' + empty : '') + '.');
      var rg = rgOrder.filter(function (g) { return rows.some(function (r) { return r.group === g; }); });
      if (rg.length) out.push('Row groups: ' + rg.map(function (g) { var k = rows.filter(function (r) { return r.group === g; }).length; return A11Y.plain(rgroups[g].label) + ' (' + k + (k === 1 ? ' row)' : ' rows)'); }).join(', ') + '.');
      if (gapState.length && Object.keys(cells).length) {
        if (rgaps.length) {
          out.push({head: 'Rows with gaps (' + rgaps.length + ' of ' + rows.length + '):', items: rgaps});
          out.push({head: 'Columns with gaps:', items: cols.filter(function (c) { return cgaps[c.id]; }).map(function (c) { return head(c) + ': ' + cgaps[c.id] + (cgaps[c.id] === 1 ? ' gap.' : ' gaps.'); })});
        } else out.push('No gaps.');
      }
      if (items.length) out.push({head: 'In the cells:', items: rows.map(function (r) {
        var per = cols.map(function (c) {
          var its = items.filter(function (it) { return it.row === r.id && it.col === c.id; });
          return its.length ? head(c) + ': ' + A11Y.and(its.map(function (it) { return A11Y.plain(it.label) || it.id; })) : '';
        }).filter(Boolean);
        return per.length ? head(r) + ': ' + per.join('; ') + '.' : '';
      }).filter(Boolean)});
      var caps = (stepList || []).map(function (s) { return A11Y.plain(s.caption); });
      if (caps.some(Boolean)) out.push({head: 'In ' + caps.length + ' steps:', items: caps.map(function (c, k) { return (k + 1) + '. ' + (c || '…'); })});
      if (options.describe !== false && options.table !== false) { fillTable(); out.push('A table with every cell follows.'); }
      return out;
    }
    function shownText(s) {
      var ns = (s.show || []).map(function (id) { return rgroups[id] ? rgroups[id].label : cgroups[id] ? cgroups[id].label : R[id] ? head(R[id]) : C[id] ? head(C[id]) : id === 'totals' ? 'the totals' : ''; }).filter(Boolean);
      return ns.length ? 'shows ' + A11Y.and(ns.map(A11Y.plain)) : '';
    }
    api.describe = function () { return DESC.describe(); };
    A11Y.watch(api, ['rowGroup', 'colGroup', 'row', 'col', 'cell', 'cells', 'item', 'steps'], DESC);

    /* ---------- check ---------- */
    api.check = function () {
      api.render();
      var out = [], seen = {}, name = svg.id ? '#' + svg.id : 'svg', vb = {x: 0, y: 0, w: view.W, h: view.H};
      function add(msg, b) { if (seen[msg]) return; seen[msg] = 1; out.push({msg: name + ': ' + msg, box: b}); }
      function inside(b) { return b.x >= vb.x - 0.5 && b.y >= vb.y - 0.5 && b.x + b.w <= vb.w + 0.5 && b.y + b.h <= vb.h + 0.5; }
      view.checks.forEach(function (k) {
        var t = k.t, len = 0;
        if (k.kind === 'colrot' || k.kind === 'tot' || k.kind === 'corner') { try { len = t.getComputedTextLength(); } catch (x) {} }
        var b = bbox(t); if (!b) return;
        if (k.kind !== 'colrot') len = b.w;
        if (k.kind === 'colrot') {
          if (len > k.max) add('column header "' + k.name + '" is longer than the header band (' + Math.round(len) + ' > ' + Math.round(k.max) + '): shorten it, raise colH or set clip', {x: b.x, y: b.y - len, w: b.h, h: len});
        } else if (len > k.max + 0.5) {
          var what = {row: 'row header', col: 'column header', cgroup: 'column group label', rgroup: 'row group label', tot: 'total', corner: 'corner text'}[k.kind];
          add(what + ' "' + k.name + '" is wider than its room (' + Math.round(len) + ' > ' + Math.round(k.max) + '): shorten it' + (k.kind === 'row' || k.kind === 'col' ? ', raise rowMax or set clip' : ''), b);
        }
        if (k.maxH && b.h > k.maxH + 1) add((k.kind === 'row' ? 'row header "' : 'row group label "') + k.name + '" is taller than its rows', b);
        if (k.kind !== 'colrot' && !inside(b)) add('text "' + k.name + '" is outside the viewBox', b);
      });
      view.cells.forEach(function (x) {
        if (!x.mark) return;
        var w = 0; try { w = x.mark.getComputedTextLength(); } catch (e) {}
        var cw = +x.rect.getAttribute('width'), ch = +x.rect.getAttribute('height'), fs = +x.mark.getAttribute('font-size');
        if (w > cw - 2 || fs > ch - 2) add('mark "' + x.mark.textContent + '" in ' + x.r.id + ' × ' + x.c.id + ' is too large for its cell', {x: +x.rect.getAttribute('x'), y: +x.rect.getAttribute('y'), w: cw, h: ch});
      });
      view.items.forEach(function (x) {
        var c = x.cell, b = x.box;
        if (b.x < c.x - 0.5 || b.x + b.w > c.x + c.w + 0.5 || b.y < c.y - 0.5 || b.y + b.h > c.y + c.h + 0.5) add('item ' + x.it.id + ' runs out of its cell', b);
        if (x.t) { var tb = bbox(x.t); if (tb && (tb.x + tb.w > b.x + b.w - 2 || tb.x < b.x)) add('label of item ' + x.it.id + ' runs out of its box', tb); }
      });
      view.lg.forEach(function (e) { var b = {x: e.x, y: e.y, w: e.w, h: 18}; if (!inside(b)) add('legend entry "' + e.s.label + '" is outside the viewBox', b); });
      // contrast in both themes, wires over text, wires run together: lib/edgesketch.js, when it is on the page
      if (global.EdgeSketch && global.EdgeSketch.paint) global.EdgeSketch.paint(svg, name).forEach(function (i) { if (!seen[i.msg]) { seen[i.msg] = 1; out.push(i); } });
      if (debug) {
        var old = svg.querySelector('.em-debug'); if (old) old.remove();
        var g = el('g', {'class': 'em-debug', 'aria-hidden': 'true'}, svg);
        out.forEach(function (i) { if (i.box) el('rect', {x: i.box.x - 2, y: i.box.y - 2, width: i.box.w + 4, height: i.box.h + 4, rx: 3}, g); });
      }
      return out.map(function (i) { return i.msg; });
    };
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    function again() {   // measured again with the web fonts, and checked again
      if (drawn) render();
      if (debug) setTimeout(function () { report('matrix:' + self, api.check()); }, 0);
    }
    ready.then(again);
    // a face first used by the drawing itself (the mono of the headers) can load after ready
    if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { if (drawn) again(); });
    return api;
  }

  // the issues of every checked figure, shared with the other libraries, in the <pre> shot.sh --check reads
  function report(key, list) {
    var R = global.ED_ISSUES = global.ED_ISSUES || {};
    R[key] = list;
    var pre = document.getElementById('ed-issues');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'ed-issues'; pre.hidden = true; document.body.appendChild(pre); }
    var keys = Object.keys(R);
    pre.textContent = keys.map(function (k) { return R[k].join('\n'); }).filter(Boolean).join('\n');
    pre.setAttribute('data-diagrams', keys.length);
    list.forEach(function (m) { if (global.console) console.warn('[EdgeMatrix] ' + m); });
  }

  global.EdgeMatrix = {create: create, version: VERSION, legend: LEGEND};
})(window);
