/* EdgeTimeline v1.3.1 — timelines and Gantt-style roadmaps for single-file HTML pages and decks.
 *
 *   var t = EdgeTimeline.create(svg, {start: '2027-01-01', end: '2027-12-31', unit: 'month', today: '2027-04-12'});
 *   t.band('build', {title: 'BUILD'});                                   // a titled group of lanes
 *   t.lane('api', {title: 'API', band: 'build'}).lane('web', {title: 'Web app', band: 'build'});
 *   t.phase('p1', {start: '2027-01-01', end: '2027-03-31', label: 'Discover', tone: 'accent', caption: '...'});
 *   t.bar('schema', {lane: 'api', start: '2027-01-11', end: '2027-02-26', label: 'Schema', tone: 'accent', progress: 0.6});
 *   t.bar('ui', {lane: 'web', start: '2027-03-01', end: '2027-05-28', label: 'Screens', planned: true});
 *   t.milestone('beta', {lane: 'web', at: '2027-06-01', label: 'Beta', tone: 'gap', line: true});
 *   t.dep('d1', {from: 'schema', to: 'ui'});                            // finish to start, at right angles
 *   var ctl = t.steps();          // one step per phase, or {by: 'item'}, or t.steps([{show: [ids], caption}])
 *
 * The time axis runs across the viewBox's width right of the lane titles: dates ('YYYY-MM-DD', 'YYYY-MM',
 * 'YYYY' or Date; an end date is inclusive) with ticks by day, week, month, quarter or year and a second
 * tier above (months or years), or abstract units (numbers, start 0, labels W1, W2 ... or any prefix).
 * Lanes are rows, grouped in bands; bars, milestones and phases sit on them; dependencies run at right
 * angles from a bar's end to the next one's start and go around bars. The viewBox's height follows the
 * content.
 *
 * Steps: step 0 shows the axis and the lanes; each later step one phase and what starts in it (or one
 * item). Forward steps grow the bars and draw the arrows, back steps jump; reduced motion never
 * animates. ctl.timeline is a paused GSAP timeline with labels s0..sN and onStep, for EdgeDeck.
 * Hovering or focusing an item with info dims the rest but its dependencies, and shows a tooltip.
 *
 * {debug: true} or window.ED_DEBUG checks the layout once fonts are loaded: labels running out of their
 * bar or the chart, bars overlapping in a lane, dependencies pointing backward in time or crossing a
 * bar, items outside the axis, text on text. The issues go into the shared <pre id="ed-issues"> that
 * scripts/shot.sh --check reads.
 * With lib/edgesketch.js on the page (shot.sh --check puts it there), check() adds EdgeSketch.paint:
 * contrast in the light and the dark theme, wires through text, wires run together.
 *
 * Colours come from the theme's tokens (--ed-ink, --ed-accent, ...), as in EdgeDiagram.
 *
 * t.describe() returns a text description (phases, lanes with bars, dates and milestones, dependencies,
 * today, captions); the svg points aria-describedby at it, and a live region reads each step.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', VERSION = '1.3.1', UID = 0, DAY = 864e5, REG = [];
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var TONES = ['neutral', 'accent', 'add', 'gap', 'p3', 'muted'];
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PREFIX = {day: 'D', week: 'W', sprint: 'S', month: 'M', quarter: 'Q', year: 'Y', phase: 'P'};

  var CSS = [
    '.tl-root{--_ink:var(--ed-ink,#15201d);--_ink2:var(--ed-ink2,#3f4f4a);--_muted:var(--ed-muted,#66756f);',
    '--_surface:var(--ed-surface,#fff);--_layer:var(--ed-layer,#e9eeec);--_rule:var(--ed-rule,#d2dbd7);',
    '--_accent:var(--ed-accent,#2456a4);--_accent-soft:var(--ed-accent-soft,#e3ebf6);--_gap:var(--ed-gap,#b87d00);',
    '--_gap-soft:var(--ed-gap-soft,#fbf1d9);--_add:var(--ed-add,#0b8a0b);--_add-soft:var(--ed-add-soft,#e3f3e3);',
    '--_p3:var(--ed-p3,#6b46c1);--_p3-soft:var(--ed-p3-soft,#efe9fb);overflow:visible}',
    '.tl-root text{font-family:var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);fill:var(--_ink)}',
    '.tl-band rect{fill:var(--_layer)}.tl-band text{font-family:var(--ed-mono,monospace)!important;font-size:10.5px;letter-spacing:.09em;fill:var(--_muted)}',
    '.tl-lane .tl-t{font-family:var(--ed-display,"Archivo Narrow",sans-serif)!important;font-weight:600;font-size:14px}',
    '.tl-lane .tl-s{font-size:11px;fill:var(--_ink2)}.tl-lane use{color:var(--_ink2)}',
    '.tl-rule{stroke:var(--_rule);stroke-width:1}',
    '.tl-grid{stroke:var(--_rule);stroke-width:1;stroke-dasharray:2 4}.tl-grid.major{stroke-dasharray:none}',
    '.tl-axis text{font-family:var(--ed-mono,monospace)!important;font-size:11px;fill:var(--_ink2)}',
    '.tl-axis text.major{font-weight:600;fill:var(--_ink)}.tl-axis text.thin{display:none}.tl-axis line{stroke:var(--_rule)}',
    '.tl-phase .tl-strip{fill:var(--_layer);stroke:var(--_muted);stroke-width:1}.tl-col{fill:var(--_layer);opacity:.55}',
    '.tl-phase text{font-family:var(--ed-display,"Archivo Narrow",sans-serif)!important;font-weight:600;font-size:13px}',
    '.tl-bar .tl-shape{fill:var(--_surface);stroke:var(--_ink2);stroke-width:1.3;transform-box:fill-box;transform-origin:left center;transition:transform .45s ease-out,stroke-width .2s}',
    '.tl-bar .tl-prog{fill:var(--_ink2);fill-opacity:.28;transform-box:fill-box;transform-origin:left center;transition:transform .45s ease-out}',
    '.tl-bar text{font-size:12px}.tl-bar.now .tl-shape{stroke-width:2.6}.tl-bar.now text{font-weight:600}',
    '.tl-bar.planned .tl-shape,.tl-bar.t-p3 .tl-shape,.tl-bar.t-muted .tl-shape{stroke-dasharray:5 3}.tl-bar.planned .tl-shape{fill:var(--_surface)}',
    '.tl-ms path{stroke:var(--_surface);stroke-width:1.5}.tl-ms text{font-size:12px;font-weight:600}.tl-ms.now path{stroke:var(--_ink)}',
    '.tl-guide{stroke-width:1.2;stroke-dasharray:3 4}',
    '.tl-dep .tl-wire{fill:none;stroke:var(--_muted);stroke-width:1.4;stroke-linejoin:round;transition:stroke-dashoffset .45s ease-in-out}',
    '.tl-dep.now .tl-wire{stroke:var(--_ink2);stroke-width:2}.tl-head{fill:var(--_muted)}',
    '.tl-today line{stroke:var(--_ink);stroke-width:1.5}.tl-today rect{fill:var(--_ink)}',
    '.tl-today text{fill:var(--_surface);font-family:var(--ed-mono,monospace)!important;font-size:10.5px;font-weight:600}',
    '.tl-item{transition:opacity .3s}.tl-item.off{opacity:0;pointer-events:none}',
    '.tl-root.tl-focusing .tl-item:not(.tl-hot):not(.off){opacity:.2;transition:opacity .15s}',
    '.tl-root [tabindex]{cursor:help;outline:none}.tl-root [tabindex]:focus-visible .tl-shape,.tl-root [tabindex]:focus-visible .tl-strip,.tl-root [tabindex]:focus-visible path{stroke-width:3}',
    '.tl-root .tl-lane[tabindex]:focus-visible .tl-t{text-decoration:underline}',
    '.tl-tip{position:fixed;z-index:1000;max-width:min(300px,calc(100vw - 16px));pointer-events:none;background:var(--ed-tip-bg,#15201d);color:var(--ed-tip-ink,#f3f6f4);',
    'font:13px/1.45 var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);padding:9px 12px;border-radius:6px;box-shadow:0 8px 24px -12px rgba(0,0,0,.5)}',
    '.tl-tip b{display:block;font-weight:600;margin-bottom:2px}.tl-tip span{display:block}',
    '.tl-tip dl{display:grid;grid-template-columns:auto 1fr;gap:2px 12px;margin:6px 0 0;font-size:12px}.tl-tip dt{opacity:.72}.tl-tip dd{margin:0;font-variant-numeric:tabular-nums}',
    '.tl-tip.pinned{pointer-events:auto;outline:2px solid var(--ed-accent,#2456a4)}',
    '.tl-tip.sheet{left:8px!important;right:8px;top:auto!important;bottom:calc(8px + env(safe-area-inset-bottom,0px));max-width:none}',
    '.tl-debug rect{fill:none;stroke:#e0102f;stroke-width:2;stroke-dasharray:5 3}',
    '@media (prefers-reduced-motion:reduce){.tl-item,.tl-bar .tl-shape,.tl-bar .tl-prog,.tl-dep .tl-wire{transition:none}}',
    '@media (forced-colors:active){.tl-bar .tl-shape,.tl-phase .tl-strip,.tl-dep .tl-wire{stroke:CanvasText}.tl-ms path,.tl-head{fill:CanvasText}.tl-tip{border:1px solid CanvasText}}'
  ];
  TONES.forEach(function (t) {
    var c = t === 'neutral' ? 'ink2' : t, s = t === 'neutral' ? 'layer' : t === 'muted' ? 'surface' : t + '-soft';
    if (t !== 'neutral') CSS.push('.tl-bar.t-' + t + ' .tl-shape{fill:var(--_' + s + ');stroke:var(--_' + c + ')}.tl-bar.t-' + t + ' .tl-prog{fill:var(--_' + c + ')}',
      '.tl-phase.t-' + t + ' .tl-strip{fill:var(--_' + s + ');stroke:var(--_' + c + ')}.tl-col.t-' + t + '{fill:var(--_' + s + ')}');
    CSS.push('.tl-ms.t-' + t + ' path{fill:var(--_' + c + ')}.tl-guide.t-' + t + '{stroke:var(--_' + c + ')}');
  });
  CSS.push('.tl-phase.t-p3 .tl-strip{stroke-dasharray:5 3}');
  CSS = CSS.join('\n');

  function el(tag, a, parent, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in a) if (a[k] != null) e.setAttribute(k, a[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function injectCSS() {
    if (document.getElementById('tl-css')) return;
    var s = document.createElement('style'); s.id = 'tl-css'; s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function injectIcons(icons) {
    if (!icons || document.getElementById('ed-icons')) return;
    var h = el('svg', {id: 'ed-icons', 'aria-hidden': 'true', style: 'position:absolute;width:0;height:0;overflow:hidden'});
    h.innerHTML = '<defs>' + icons + '</defs>';
    document.body.insertBefore(h, document.body.firstChild);
  }
  function bbox(e) { try { var b = e.getBBox(); return {x: b.x, y: b.y, w: b.width, h: b.height}; } catch (x) { return null; } }
  function inter(a, b, pad) { return a.x < b.x + b.w - pad && b.x < a.x + a.w - pad && a.y < b.y + b.h - pad && b.y < a.y + a.h - pad; }
  function contains(a, b) { return b.x >= a.x - 0.5 && b.y >= a.y - 0.5 && b.x + b.w <= a.x + a.w + 0.5 && b.y + b.h <= a.y + a.h + 0.5; }
  function textW(t) {
    var w = 0; try { w = t.getComputedTextLength(); } catch (x) {}
    return w || String(t.textContent).length * 6.6;
  }

  /* ---------- time: dates are whole days since 1970 (UTC), abstract units are plain numbers ---------- */
  function isDate(v) { return v instanceof Date || (typeof v === 'string' && /^\d{4}(-\d{2}(-\d{2})?)?$/.test(v)); }
  function toDay(v, isEnd) {   // an end date is inclusive: the day after it, or the month or year after
    if (v instanceof Date) return Math.floor(Date.UTC(v.getFullYear(), v.getMonth(), v.getDate()) / DAY) + (isEnd ? 1 : 0);
    var m = String(v).match(/^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/);
    if (!m) throw new Error('EdgeTimeline: not a date: ' + v);
    var y = +m[1], mo = m[2] ? +m[2] - 1 : 0, d = m[3] ? +m[3] : 1;
    if (isEnd) { if (m[3]) d++; else if (m[2]) mo++; else y++; }
    return Date.UTC(y, mo, d) / DAY;
  }
  function D(t) { return new Date(t * DAY); }
  function unitStart(t, u) {
    var d = D(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (u === 'day') return Math.floor(t);
    if (u === 'week') return Math.floor(t) - (d.getUTCDay() + 6) % 7;
    if (u === 'month') return Date.UTC(y, m, 1) / DAY;
    if (u === 'quarter') return Date.UTC(y, m - m % 3, 1) / DAY;
    if (u === 'year') return Date.UTC(y, 0, 1) / DAY;
    throw new Error('EdgeTimeline: unknown unit ' + u + ' (day, week, month, quarter or year)');
  }
  function unitNext(t, u) {
    var d = D(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    return u === 'day' ? t + 1 : u === 'week' ? t + 7 : u === 'month' ? Date.UTC(y, m + 1, 1) / DAY :
      u === 'quarter' ? Date.UTC(y, m + 3, 1) / DAY : Date.UTC(y + 1, 0, 1) / DAY;
  }
  function isoWeek(t) {
    var d = D(t), th = t + 3 - (d.getUTCDay() + 6) % 7, y = D(th).getUTCFullYear();
    return 1 + Math.floor((th - Date.UTC(y, 0, 1) / DAY) / 7);
  }
  function unitLabel(t, u, upper) {
    var d = D(t), y = d.getUTCFullYear(), m = d.getUTCMonth();
    if (u === 'day') return String(d.getUTCDate());
    if (u === 'week') return 'W' + isoWeek(t);
    if (u === 'month') return upper ? MON[m] + ' ' + y : MON[m];
    if (u === 'quarter') return 'Q' + (m / 3 + 1);
    return String(y);
  }
  function fmtDay(t) { var d = D(t); return d.getUTCDate() + ' ' + MON[d.getUTCMonth()] + ' ' + d.getUTCFullYear(); }

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
    svg.classList.add('tl-root');
    var self = ++UID, sid = svg.id || 'tl' + self, debug = !!(options.debug || global.ED_DEBUG);
    var vbv = svg.viewBox && svg.viewBox.baseVal;
    var W = options.width || (vbv && vbv.width) || 1000;
    if (options.start == null || options.end == null) throw new Error('EdgeTimeline: create needs start and end');
    var dates = isDate(options.start), unit = options.unit || (dates ? 'month' : 'week');
    var T0 = dates ? toDay(options.start) : +options.start, T1 = dates ? toDay(options.end, true) : +options.end;
    if (!(T1 > T0)) throw new Error('EdgeTimeline: end must come after start');
    var opt = {row: options.row || 40, barH: options.barH || 22, margin: options.margin != null ? options.margin : 16,
               labelW: options.labelW != null ? options.labelW : 170, top: options.top || 8, first: options.first != null ? options.first : 1};
    var prefix = options.prefix != null ? options.prefix : PREFIX[unit] || unit + ' ';
    var bands = [], B = {}, lanes = [], LN = {}, items = {}, order = [], deps = [], phases = [], drawn = false, vb = null, geo = {};
    var api = {svg: svg, items: items, version: VERSION};

    function T(v, isEnd) { return dates ? toDay(v, isEnd) : +v; }
    function fmt(t0, t1) {   // the span an item covers, for its tooltip
      if (options.format) return options.format(t0, t1);
      if (dates) return t1 == null ? fmtDay(Math.floor(t0)) : fmtDay(t0) + ' – ' + fmtDay(t1 - 1);
      return t1 == null ? 'at ' + prefix + (t0 + opt.first) : prefix + (t0 + opt.first) + (t1 - t0 > 1 ? '–' + prefix + (t1 - 1 + opt.first) : '');
    }
    function add(kind, id, o, extra) {
      if (items[id] || LN[id]) throw new Error('EdgeTimeline: ' + id + ' is defined twice');
      var it = Object.assign({id: id, kind: kind, o: o, els: []}, extra);
      items[id] = it; order.push(it); drawn = false; return api;
    }
    function needLane(id, o) { if (!LN[o.lane]) throw new Error('EdgeTimeline: ' + id + ' needs an existing lane, not ' + o.lane); }

    api.band = function (id, o) { B[id] = {id: id, o: o || {}}; bands.push(B[id]); drawn = false; return api; };
    api.lane = function (id, o) {
      o = o || {};
      if (LN[id]) throw new Error('EdgeTimeline: lane ' + id + ' is defined twice');
      if (o.band && !B[o.band]) api.band(o.band, {title: o.band});
      LN[id] = {id: id, o: o, items: []}; lanes.push(LN[id]); drawn = false; return api;
    };
    api.bar = function (id, o) {
      needLane(id, o);
      if (o.start == null || o.end == null) throw new Error('EdgeTimeline: bar ' + id + ' needs start and end');
      return add('bar', id, o, {t0: T(o.start), t1: T(o.end, true), lane: LN[o.lane]});
    };
    api.milestone = function (id, o) {
      needLane(id, o);
      var t = dates ? toDay(o.at) + 0.5 : +o.at;   // a dated milestone sits in the middle of its day
      return add('ms', id, o, {t0: t, t1: t, lane: LN[o.lane]});
    };
    api.phase = function (id, o) {
      (o.lanes || []).forEach(function (l) { if (!LN[l]) throw new Error('EdgeTimeline: phase ' + id + ' needs existing lanes'); });
      add('phase', id, o, {t0: T(o.start), t1: T(o.end, true)});
      phases.push(items[id]); return api;
    };
    api.dep = function (id, o) {
      add('dep', id, o, {});
      deps.push(items[id]); return api;
    };

    /* ---------- the axis's cells: [t0, t1, label] per tier ---------- */
    function cells(u, upper) {
      var out = [];
      if (dates) {
        for (var t = unitStart(T0, u); t < T1; t = unitNext(t, u)) {
          var a = Math.max(t, T0), b = Math.min(unitNext(t, u), T1);
          var f = upper ? options.upperFormat : options.tickFormat;
          out.push([a, b, f ? f(D(t)) : unitLabel(t, u, upper), a > t || b < unitNext(t, u)]);
        }
      } else {
        var every = upper ? upper.every : options.every || 1, i = 0;
        for (var v = T0; v < T1; v += every, i++) {
          var lab = upper ? (typeof upper.label === 'function' ? upper.label(i) : (upper.prefix != null ? upper.prefix : '') + (i + 1))
                          : options.tickFormat ? options.tickFormat(v) : prefix + (v + opt.first);
          out.push([v, Math.min(v + every, T1), lab, v + every > T1]);
        }
      }
      return out;
    }
    function upperUnit() {
      if (options.tiers === 1) return null;
      if (!dates) return options.upper || null;
      return {day: 'month', week: 'month', month: 'year', quarter: 'year'}[unit] || null;
    }

    /* ---------- layout ---------- */
    function render() {
      while (svg.firstChild) svg.removeChild(svg.firstChild);
      order.forEach(function (it) { it.els = []; });
      lanes.forEach(function (l) { l.items = []; });
      var defs = el('defs', {}, svg), L = {};
      ['bands', 'cols', 'grid', 'lanes', 'axis', 'phases', 'guides', 'today', 'bars', 'deps', 'ms', 'debug'].forEach(function (k) { L[k] = el('g', {}, svg); });
      var m = opt.margin, X0 = m + opt.labelW, X1 = W - m - (options.right != null ? options.right : 8);
      function X(t) { return X0 + (t - T0) / (T1 - T0) * (X1 - X0); }
      geo = {X: X, X0: X0, X1: X1};

      // rows from the top: the axis's tiers, the phases' strips, then the bands and their lanes
      var y = opt.top, up = upperUnit(), tiers = [];
      if (up) { tiers.push({y: y, h: 20, cells: cells(dates ? up : 0, dates ? true : up), major: true}); y += 20; }
      tiers.push({y: y, h: 22, cells: cells(unit, false), major: false}); y += 22;
      var axisBottom = y;
      y += 6;
      var prow = [];   // the phases' strips, overlapping ones on separate rows
      phases.slice().sort(function (a, b) { return a.t0 - b.t0; }).forEach(function (p) {
        for (var r = 0; r < prow.length; r++) if (prow[r] <= p.t0) break;
        prow[r] = p.t1; p.row = r;
      });
      var phaseTop = y; y += prow.length ? prow.length * 26 + 4 : 0;
      var lanesTop = y, blocks = [], seen = {};
      lanes.forEach(function (l) {
        var k = l.o.band || '';
        if (seen[k] == null) { seen[k] = blocks.length; blocks.push({band: B[k], lanes: []}); }
        blocks[seen[k]].lanes.push(l);
      });
      blocks.forEach(function (bk, bi) {
        bk.y0 = y;
        if (bk.band && bk.band.o.title) y += 24;
        bk.lanes.forEach(function (l) { l.y = y; l.h = l.o.h || opt.row; y += l.h; });
        bk.y1 = y + (bk.band ? 4 : 0);
        y = bk.y1 + (bi < blocks.length - 1 && (bk.band || blocks[bi + 1].band) ? 8 : 0);
      });
      var lanesBottom = y, todayT = options.today != null ? (dates ? toDay(options.today) + 0.5 : +options.today) : null;
      var hasToday = todayT != null && todayT >= T0 && todayT <= T1;
      if (hasToday) y += 24;
      var H = y + 8;
      vb = {x: 0, y: 0, w: W, h: H};
      svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      geo.lanesTop = lanesTop; geo.lanesBottom = lanesBottom; geo.axisBottom = axisBottom;

      // bands, lanes and their titles
      blocks.forEach(function (bk) {
        if (!bk.band) return;
        var g = el('g', {'class': 'tl-band', 'data-id': bk.band.id}, L.bands);
        el('rect', {x: m, y: bk.y0, width: W - 2 * m, height: bk.y1 - bk.y0, rx: 8}, g);
        if (bk.band.o.title) el('text', {x: m + 10, y: bk.y0 + 16}, g, bk.band.o.title);
      });
      blocks.forEach(function (bk) {
        bk.lanes.forEach(function (l, i) {
          if (i > 0) el('line', {x1: m + 8, x2: W - m - 8, y1: l.y, y2: l.y, 'class': 'tl-rule'}, L.lanes);
          var o = l.o, g = el('g', {'class': 'tl-lane', 'data-id': l.id}, L.lanes), is = o.icon ? 18 : 0, tx = m + 10 + (is ? is + 7 : 0);
          var yc = l.y + l.h / 2;
          l.title = el('text', {x: tx, y: o.sub ? yc - 2 : yc + 5, 'class': 'tl-t'}, g, o.title || l.id);
          if (o.sub) l.sub = el('text', {x: tx, y: yc + 12, 'class': 'tl-s'}, g, o.sub);
          if (is) el('use', {href: '#i-' + o.icon, x: m + 10, y: yc - is / 2, width: is, height: is}, g);
          if (o.info) tip(g, 'lane', l.id, o.title || l.id, o.info);
          l.g = g;
        });
      });

      // the axis: tier labels centred in their cells, ticks at the boundaries, grid lines down the lanes
      var ga = el('g', {'class': 'tl-axis'}, L.axis);
      tiers.forEach(function (tr) {
        tr.texts = tr.cells.map(function (c) {
          var t = el('text', {x: (X(c[0]) + X(c[1])) / 2, y: tr.y + tr.h - 7, 'text-anchor': 'middle', 'class': tr.major ? 'major' : null}, ga, c[2]);
          t._w = X(c[1]) - X(c[0]); t._part = c[3];
          return t;
        });
        tr.cells.forEach(function (c, i) {
          if (i === 0) return;
          var x = X(c[0]);
          el('line', {x1: x, x2: x, y1: tr.y + 3, y2: tr.y + tr.h}, ga);
          el('line', {x1: x, x2: x, y1: lanesTop, y2: lanesBottom, 'class': 'tl-grid' + (tr.major ? ' major' : '')}, L.grid);
        });
      });
      el('line', {x1: X0, x2: X1, y1: axisBottom, y2: axisBottom, 'class': 'tl-rule'}, L.axis);
      geo.tiers = tiers;

      // phases: a strip above the lanes and a soft column behind the lanes they span
      phases.forEach(function (p) {
        var o = p.o, tone = o.tone || 'neutral', x0 = X(p.t0), x1 = X(p.t1), py = phaseTop + p.row * 26;
        var g = el('g', {'class': 'tl-item tl-phase t-' + tone, 'data-id': p.id}, L.phases);
        el('rect', {x: x0 + 1, y: py, width: Math.max(2, x1 - x0 - 2), height: 21, rx: 4, 'class': 'tl-strip'}, g);
        p.text = el('text', {x: (x0 + x1) / 2, y: py + 15, 'text-anchor': 'middle'}, g, o.label || p.id);
        var ls = o.lanes ? o.lanes.map(function (id) { return LN[id]; }) : lanes;
        var c0 = Math.min.apply(null, ls.map(function (l) { return l.y; })), c1 = Math.max.apply(null, ls.map(function (l) { return l.y + l.h; }));
        if (!o.lanes) { c0 = lanesTop; c1 = lanesBottom; }
        var col = el('rect', {x: x0, y: c0, width: x1 - x0, height: c1 - c0, 'class': 'tl-item tl-col t-' + tone, 'data-id': p.id + '.col'}, L.cols);
        p.box = {x: x0, y: py, w: x1 - x0, h: 21}; p.lanes = ls;
        p.els = [g, col]; p.g = g;
        if (o.info) tip(g, 'item', p.id, o.label || p.id, o.info);
      });

      // bars and milestones
      var bh = opt.barH;
      order.forEach(function (it) {
        var o = it.o;
        if (it.kind === 'bar') {
          var l = it.lane, x0 = X(it.t0), x1 = X(it.t1), by = l.y + (l.h - bh) / 2;
          var g = el('g', {'class': 'tl-item tl-bar t-' + (o.tone || 'neutral') + (o.planned ? ' planned' : ''), 'data-id': it.id, 'data-box': ''}, L.bars);
          it.shape = el('rect', {x: x0, y: by, width: Math.max(1, x1 - x0), height: bh, rx: Math.min(5, (x1 - x0) / 2), 'class': 'tl-shape'}, g);
          if (o.progress > 0) {
            var cp = el('clipPath', {id: 'tl-' + sid + '-c-' + it.id}, defs);
            el('rect', {x: x0, y: by, width: Math.max(1, x1 - x0), height: bh, rx: Math.min(5, (x1 - x0) / 2)}, cp);
            it.prog = el('rect', {x: x0, y: by, width: (x1 - x0) * Math.min(1, o.progress), height: bh, 'class': 'tl-prog', 'clip-path': 'url(#' + cp.id + ')'}, g);
          }
          if (o.label) it.text = el('text', {x: x0 + 8, y: by + bh / 2 + 4}, g, o.label);
          it.x0 = x0; it.x1 = x1; it.y = by; it.yc = by + bh / 2; it.box = {x: x0, y: by, w: x1 - x0, h: bh};
          it.els = [g]; it.g = g; l.items.push(it);
        } else if (it.kind === 'ms') {
          var lm = it.lane, cx = X(it.t0), cy = lm.y + lm.h / 2, s = o.size || 8;
          var gm = el('g', {'class': 'tl-item tl-ms t-' + (o.tone || 'neutral'), 'data-id': it.id}, L.ms);
          el('path', {d: 'M' + cx + ' ' + (cy - s) + ' L' + (cx + s) + ' ' + cy + ' L' + cx + ' ' + (cy + s) + ' L' + (cx - s) + ' ' + cy + ' Z'}, gm);
          if (o.label) it.text = el('text', {x: cx + s + 5, y: cy + 4}, gm, o.label);
          it.x0 = cx - s; it.x1 = cx + s; it.y = cy - s; it.yc = cy; it.box = {x: cx - s, y: cy - s, w: 2 * s, h: 2 * s};
          it.els = [gm]; it.g = gm; lm.items.push(it);
          if (o.line) it.els.push(el('line', {x1: cx, x2: cx, y1: lanesTop, y2: lanesBottom, 'class': 'tl-item tl-guide t-' + (o.tone || 'neutral'), 'data-id': it.id + '.line'}, L.guides));
        }
        if ((it.kind === 'bar' || it.kind === 'ms') && o.info) tip(it.g, 'item', it.id, o.label || it.id, o.info);
      });
      lanes.forEach(function (l) { l.items.sort(function (a, b) { return a.t0 - b.t0; }); });

      // dependencies: finish to start, at right angles, around bars
      var head = el('marker', {id: 'tl-' + sid + '-head', viewBox: '0 0 10 10', refX: 9, refY: 5, markerWidth: 7, markerHeight: 7,
        orient: 'auto-start-reverse', markerUnits: 'userSpaceOnUse'}, defs);
      el('path', {d: 'M0 1 L10 5 L0 9 Z', 'class': 'tl-head'}, head);
      deps.forEach(function (d) {
        var a = items[d.o.from], b = items[d.o.to];
        if (!a || !b || (a.kind !== 'bar' && a.kind !== 'ms') || (b.kind !== 'bar' && b.kind !== 'ms'))
          throw new Error('EdgeTimeline: dependency ' + d.id + ' needs an existing bar or milestone at both ends');
        d.from = a; d.to = b;
        d.pts = route(a, b);
        var g = el('g', {'class': 'tl-item tl-dep', 'data-id': d.id}, L.deps);
        d.path = el('path', {d: rounded(d.pts, 5), 'class': 'tl-wire', pathLength: 1, 'marker-end': 'url(#' + head.id + ')'}, g);
        d.els = [g]; d.g = g;
        if (d.o.info) tip(g, 'item', d.id, d.o.label || (b.o.label || b.id) + ' starts after ' + (a.o.label || a.id) + ' ends', d.o.info);
      });

      if (hasToday) {
        var tx = X(todayT), gt = el('g', {'class': 'tl-today'}, L.today), lab = options.todayLabel || 'today';
        el('line', {x1: tx, x2: tx, y1: lanesTop - 4, y2: lanesBottom + 4}, gt);
        var cw = lab.length * 7 + 12, cx0 = Math.max(X0, Math.min(X1 - cw, tx - cw / 2));
        geo.todayRect = el('rect', {x: cx0, y: lanesBottom + 4, width: cw, height: 17, rx: 8.5}, gt);
        geo.todayText = el('text', {x: cx0 + cw / 2, y: lanesBottom + 16.5, 'text-anchor': 'middle'}, gt, lab);
      }
      api.layers = L;
      drawn = true;
      fit();
    }

    function obstacles(skip) { return order.filter(function (it) { return (it.kind === 'bar' || it.kind === 'ms') && skip.indexOf(it) < 0; }); }
    function crosses(p, q, box) {   // a horizontal or vertical segment through a box, its edges excepted
      var x0 = Math.min(p[0], q[0]), x1 = Math.max(p[0], q[0]), y0 = Math.min(p[1], q[1]), y1 = Math.max(p[1], q[1]);
      return x0 < box.x + box.w - 0.5 && x1 > box.x + 0.5 && y0 < box.y + box.h - 0.5 && y1 > box.y + 0.5;
    }
    function hits(pts, obs) {
      var n = 0;
      for (var i = 1; i < pts.length; i++) obs.forEach(function (o) { if (crosses(pts[i - 1], pts[i], o.box)) n++; });
      return n;
    }
    function route(a, b) {
      var s = [a.x1, a.yc], e = [b.x0, b.yc], obs = obstacles([a, b]), gap = e[0] - s[0];
      var level = Math.abs(s[1] - e[1]) < 0.5;
      if (level && gap >= 8 && !hits([s, e], obs)) return [s, e];
      if (gap >= 20) {   // a Z: out, down at the column that crosses fewest bars (nearest the source), in
        var best = null;
        for (var x = s[0] + 10; x <= e[0] - 10; x += 2) {
          var p = [s, [x, s[1]], [x, e[1]], e], n = hits(p, obs);
          if (!best || n < best.n) best = {p: p, n: n};
          if (n === 0) break;
        }
        if (best && best.n === 0) return best.p;
      }
      // the target starts too soon for a Z: out, along the boundary between lanes, back, and in
      var xa = s[0] + 10, xb = e[0] - 10, la = a.lane, lb = b.lane;
      var ys = level ? [la.y + la.h, la.y] : e[1] > s[1] ? [la.y + la.h, lb.y] : [la.y, lb.y + lb.h];
      var cand = ys.map(function (yc) { var p = [s, [xa, s[1]], [xa, yc], [xb, yc], [xb, e[1]], e]; return {p: p, n: hits(p, obs)}; });
      if (gap >= 20) cand.push(best);
      cand.sort(function (u, v) { return u.n - v.n; });
      return cand[0].p;
    }
    function rounded(pts, r) {
      var d = 'M' + pts[0][0] + ' ' + pts[0][1];
      for (var i = 1; i < pts.length - 1; i++) {
        var p = pts[i - 1], c = pts[i], q = pts[i + 1];
        var l1 = Math.hypot(c[0] - p[0], c[1] - p[1]), l2 = Math.hypot(q[0] - c[0], q[1] - c[1]), k = Math.min(r, l1 / 2, l2 / 2);
        if (k < 0.5) { d += ' L' + c[0] + ' ' + c[1]; continue; }
        var a = [c[0] - (c[0] - p[0]) / l1 * k, c[1] - (c[1] - p[1]) / l1 * k], b = [c[0] + (q[0] - c[0]) / l2 * k, c[1] + (q[1] - c[1]) / l2 * k];
        d += ' L' + a[0] + ' ' + a[1] + ' Q' + c[0] + ' ' + c[1] + ' ' + b[0] + ' ' + b[1];
      }
      var z = pts[pts.length - 1];
      return d + ' L' + z[0] + ' ' + z[1];
    }

    /* ---------- labels: measured once the fonts are in ---------- */
    function fit() {
      if (!drawn) return;
      // axis labels: every k-th cell, k the smallest that lets each label fit
      (geo.tiers || []).forEach(function (tr) {
        var full = tr.texts.filter(function (t) { return !t._part; }), k = 1;
        while (k < full.length && full.some(function (t) { return textW(t) + 6 > t._w * k; })) k++;
        var i = 0;
        tr.texts.forEach(function (t) {
          var off = t._part ? textW(t) + 6 > t._w : (i++ % k) !== 0;
          t.classList.toggle('thin', off);
        });
      });
      var segs = [];
      deps.forEach(function (d) { for (var i = 1; i < d.pts.length; i++) segs.push({d: d, a: d.pts[i - 1], b: d.pts[i]}); });
      lanes.forEach(function (l) {
        var placed = [];
        l.items.forEach(function (it) {
          it.lbox = null;
          if (!it.text) return;
          var o = it.o, w = textW(it.text), h = 14, ty = it.yc - 7, pos = o.labelPos || 'auto', s = it.kind === 'ms' ? 5 : 6;
          var inside = it.kind === 'bar' && (pos === 'inside' || (pos === 'auto' && w + 16 <= it.x1 - it.x0));
          var c;
          if (inside) c = {x: it.x0 + 8, anchor: 'start', box: {x: it.x0 + 8, y: ty, w: w, h: h}, side: 'in'};
          else {
            var right = {x: it.x1 + s, anchor: 'start', box: {x: it.x1 + s, y: ty, w: w, h: h}, side: 'right'};
            var left = {x: it.x0 - s, anchor: 'end', box: {x: it.x0 - s - w, y: ty, w: w, h: h}, side: 'left'};
            var cands = pos === 'left' ? [left, right] : pos === 'right' ? [right, left] : [right, left];
            c = cands.filter(function (k) { return free(k.box, it, l, placed, segs); })[0] || cands[0];
          }
          it.text.setAttribute('x', c.x); it.text.setAttribute('text-anchor', c.anchor);
          it.text.setAttribute('class', c.side === 'in' ? 'in' : 'out');
          it.lbox = c.box; it.side = c.side; placed.push(c.box);
        });
      });
    }
    function free(box, it, l, placed, segs) {
      if (box.x < geo.X0 + 2 || box.x + box.w > W - opt.margin) return false;
      if (l.items.some(function (o) { return o !== it && inter(box, o.box, 0); })) return false;
      if (placed.some(function (p) { return inter(box, p, 0); })) return false;
      return !segs.some(function (s) { return crosses(s.a, s.b, {x: box.x - 2, y: box.y, w: box.w + 4, h: box.h}); });
    }

    /* ---------- focus and tooltip ---------- */
    var tipEl = document.createElement('div');
    tipEl.className = 'tl-tip'; tipEl.id = 'tl-tip-' + self; tipEl.setAttribute('role', 'tooltip'); tipEl.hidden = true;
    (document.body || document.documentElement).appendChild(tipEl);
    tipEl.addEventListener('click', function (e) { e.stopPropagation(); });
    var pinned = null, current = null;
    function tip(g, kind, id, title, info) {
      g.setAttribute('tabindex', '0'); g.setAttribute('role', 'img');
      g.setAttribute('aria-label', title + '. ' + (typeof info === 'string' ? info : info.text || ''));
      var key = kind + ':' + id;
      g.addEventListener('pointerenter', function (e) { if (e.pointerType !== 'touch' && !pinned) focusOn(kind, id); });
      g.addEventListener('pointerleave', function (e) { if (e.pointerType !== 'touch') clearFocus(false); });
      g.addEventListener('focus', function () { if (!pinned) focusOn(kind, id); });
      g.addEventListener('blur', function () { clearFocus(false); });
      g.addEventListener('click', function (e) {
        e.stopPropagation();
        if (pinned === key) { clearFocus(true); return; }
        clearAll(); focusOn(kind, id); pinned = key; tipEl.classList.add('pinned');
      });
      g.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') { clearFocus(true); return; }
        if (e.key !== 'Enter' && e.key !== ' ') return;
        e.preventDefault(); e.stopPropagation();
        if (pinned === key) clearFocus(true); else { clearAll(); focusOn(kind, id); pinned = key; tipEl.classList.add('pinned'); }
      });
    }
    function related(kind, id) {   // what stays lit: the item, its dependencies and their other ends
      var hot = [];
      if (kind === 'lane') return LN[id].items.slice();
      var it = items[id]; hot.push(it);
      if (it.kind === 'phase') order.forEach(function (o) { if ((o.kind === 'bar' || o.kind === 'ms') && o.t0 < it.t1 && o.t1 >= it.t0 && it.lanes.indexOf(o.lane) >= 0) hot.push(o); });
      if (it.kind === 'dep') hot.push(it.from, it.to);
      deps.forEach(function (d) { if (d.from === it || d.to === it) hot.push(d, d.from, d.to); });
      return hot;
    }
    function facts(kind, id) {
      if (kind === 'lane') return [];
      var it = items[id], f = [];
      if (it.kind === 'bar' || it.kind === 'phase') f.push(['when', fmt(it.t0, it.t1)]);
      if (it.kind === 'ms') f.push(['when', fmt(it.t0)]);
      if (it.o.progress != null) f.push(['done', Math.round(it.o.progress * 100) + ' %']);
      if (it.o.planned) f.push(['status', 'planned']);
      var after = deps.filter(function (d) { return d.to === it; }).map(function (d) { return d.from.o.label || d.from.id; });
      if (after.length) f.push(['after', after.join(', ')]);
      return f;
    }
    function focusOn(kind, id) {
      var src = kind === 'lane' ? LN[id] : items[id];
      if (!src || !src.o.info || src.g.classList.contains('off')) return;
      var g = src.g;
      clearHot(); svg.classList.add('tl-focusing');
      related(kind, id).forEach(function (o) { o.els.forEach(function (e) { e.classList.add('tl-hot'); }); });
      var info = src.o.info, title = src.o.label || src.o.title || id;
      tipEl.textContent = '';
      var b = document.createElement('b'); b.textContent = title; tipEl.appendChild(b);
      var t = typeof info === 'string' ? info : info.text;
      if (t) { var sp = document.createElement('span'); sp.textContent = t; tipEl.appendChild(sp); }
      var fl = facts(kind, id).concat(info.facts || []);
      if (fl.length) {
        var dl = document.createElement('dl');
        fl.forEach(function (kv) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = kv[0]; dd.textContent = kv[1]; dl.appendChild(dt); dl.appendChild(dd); });
        tipEl.appendChild(dl);
      }
      tipEl.hidden = false;
      if (current && current !== g) current.removeAttribute('aria-describedby');
      current = g; g.setAttribute('aria-describedby', tipEl.id);
      placeTip(g);
      tipEl.classList.toggle('pinned', pinned === kind + ':' + id);
    }
    function placeTip(target) {
      var vw = document.documentElement.clientWidth || global.innerWidth, vh = global.innerHeight;
      if (vw < 560) { tipEl.classList.add('sheet'); return; }
      tipEl.classList.remove('sheet');
      var r = target.getBoundingClientRect(), w = tipEl.offsetWidth, h = tipEl.offsetHeight;
      var left = Math.max(8, Math.min(vw - w - 8, r.left + r.width / 2 - w / 2)), top = r.top - h - 10;
      if (top < 8) top = r.bottom + 10;
      if (top + h > vh - 8) top = Math.max(8, vh - h - 8);
      tipEl.style.left = left + 'px'; tipEl.style.top = top + 'px';
    }
    function clearHot() { [].forEach.call(svg.querySelectorAll('.tl-hot'), function (e) { e.classList.remove('tl-hot'); }); }
    function clearFocus(force) {
      if (pinned && !force) return;
      pinned = null; svg.classList.remove('tl-focusing'); tipEl.hidden = true; tipEl.classList.remove('pinned');
      if (current) current.removeAttribute('aria-describedby');
      current = null; clearHot();
    }
    REG.push({clear: function () { clearFocus(true); }, reposition: function () { if (current && !tipEl.hidden) placeTip(current); }});
    api.render = function () { if (!drawn) render(); return api; };

    /* ---------- steps ---------- */
    api.steps = function (list, o) {
      o = o || {};
      api.render();
      var shown = order.filter(function (it) { return it.kind !== 'dep'; });
      if (!list) {
        list = [{show: [], caption: o.caption0 || ''}];
        if (phases.length && o.by !== 'item') {
          var ps = phases.slice().sort(function (a, b) { return a.t0 - b.t0; });
          ps.forEach(function (p) { list.push({show: [p.id], caption: p.o.caption || ''}); });
          shown.forEach(function (it) {
            if (it.kind === 'phase') return;
            for (var k = 0; k < ps.length; k++) if (it.t0 < ps[k].t1) break;
            list[Math.min(k, ps.length - 1) + 1].show.push(it.id);
          });
        } else {
          shown.filter(function (it) { return it.kind !== 'phase'; }).sort(function (a, b) { return a.t0 - b.t0 || order.indexOf(a) - order.indexOf(b); })
            .forEach(function (it) {
              if (it.o.with && list.length > 1) { list[list.length - 1].show.push(it.id); return; }
              list.push({show: [it.id], caption: it.o.caption || ''});
            });
          phases.forEach(function (p) { list[0].show.push(p.id); });
        }
      }
      var at = {};
      list.forEach(function (s, k) { (s.show || []).forEach(function (id) { if (!items[id]) throw new Error('EdgeTimeline: unknown item ' + id); if (at[id] == null) at[id] = k; }); });
      shown.forEach(function (it) { if (at[it.id] == null) at[it.id] = 0; });
      deps.forEach(function (d) { if (at[d.id] == null) at[d.id] = Math.max(at[d.from.id], at[d.to.id]); });
      var cur = -1, told = false;
      stepCaps = list; DESC.prepare();
      function apply(k, animate) {
        k = Math.max(0, Math.min(list.length - 1, k));
        var fwd = animate && k > cur && !reduce;
        order.forEach(function (it) {
          var on = at[it.id] <= k, now = at[it.id] === k && k > 0, was = !it.els[0].classList.contains('off');
          it.els.forEach(function (e) { e.classList.toggle('off', !on); e.classList.toggle('now', now); });
          var grow = on && !was && fwd;
          if (it.kind === 'bar') [it.shape, it.prog].forEach(function (r) {
            if (!r) return;
            if (grow) { var tr = r.style.transition; r.style.transition = 'none'; r.style.transform = 'scaleX(0)'; r.getBoundingClientRect(); r.style.transition = tr; }
            r.style.transform = '';
          });
          if (it.kind === 'dep') {
            var p = it.path, mk = 'url(#tl-' + sid + '-head)';
            if (grow) {   // draw the wire, then its arrowhead
              var tp = p.style.transition; p.style.transition = 'none'; p.style.strokeDasharray = '1 2'; p.style.strokeDashoffset = '1';
              p.removeAttribute('marker-end'); p.getBoundingClientRect(); p.style.transition = tp; p.style.strokeDashoffset = '0';
              clearTimeout(it.timer); it.timer = setTimeout(function () { p.setAttribute('marker-end', mk); p.style.strokeDasharray = ''; }, 460);
            } else { clearTimeout(it.timer); p.style.strokeDasharray = ''; p.style.strokeDashoffset = ''; p.setAttribute('marker-end', mk); }
          }
        });
        cur = k;
        if (o.onStep) o.onStep(k, list[k], ctl);   // ctl: the first call comes before steps() returns
        if (told) DESC.step(k, list.length, list[k].caption, shownText(list[k]));   // the live region reads it
      }
      var G = global.gsap, tl = null;
      if (G) {   // labels s0..sN for EdgeDeck, which calls onStep on every step
        tl = G.timeline({paused: true});
        list.forEach(function (s, k) { tl.addLabel('s' + k, k * 0.5); });
        tl.to({}, {duration: 0.01}, (list.length - 1) * 0.5);
        tl.onStep = function (k) { if (k >= 0) apply(k, true); };
      }
      var ctl = {
        get step() { return cur; }, count: list.length, timeline: tl, steps: list,
        go: function (k) { apply(k, k > cur); },
        next: function () { if (cur < list.length - 1) apply(cur + 1, true); },
        prev: function () { if (cur > 0) apply(cur - 1, false); },
        end: function () { apply(list.length - 1, false); }
      };
      apply(o.start === 'end' ? list.length - 1 : o.start || 0, false);
      told = true;
      return ctl;
    };

    /* ---------- the text description: the axis and today, the phases, each band's lanes with their bars
       and milestones and dates, the dependencies, and the steps' captions ---------- */
    var DESC = A11Y.attach(svg, options, 'Timeline', describeBlocks), stepCaps = null;
    function nm(it) { return A11Y.plain(it.o.label) || it.id; }
    function itemText(it) {
      var o = it.o, bits = [];
      if (it.kind === 'ms') bits.push((o.line ? 'gate ' : 'milestone ') + nm(it) + ', ' + fmt(it.t0).replace(/^at /, ''));
      else {
        bits.push(nm(it) + ', ' + fmt(it.t0, it.t1));
        if (o.progress != null) bits.push(Math.round(o.progress * 100) + '% done');
        if (o.planned) bits.push('planned');
      }
      var info = A11Y.plain(o.info && (typeof o.info === 'string' ? o.info : o.info.text));
      return bits.join(', ') + (info ? ': ' + info.replace(/\.$/, '') : '');
    }
    function describeBlocks() {
      var out = [], todayT = options.today != null ? (dates ? toDay(options.today) + 0.5 : +options.today) : null;
      out.push('A timeline from ' + (dates ? fmtDay(T0) + ' to ' + fmtDay(T1 - 1) : prefix + (T0 + opt.first) + ' to ' + prefix + (T1 - 1 + opt.first)) +
        ', ' + lanes.length + ' lanes' + (phases.length ? ' in ' + phases.length + ' phases' : '') + '.' +
        (todayT != null ? ' Today is ' + fmt(todayT).replace(/^at /, '') + '.' : ''));
      if (phases.length) out.push({head: 'Phases:', items: phases.slice().sort(function (a, b) { return a.t0 - b.t0; }).map(function (p) {
        var cap = A11Y.plain(p.o.caption);
        return nm(p) + ', ' + fmt(p.t0, p.t1) + (cap ? ': ' + A11Y.stop(cap) : '.');
      })});
      var blocks = [], seen = {};
      lanes.forEach(function (l) {   // in the order drawn: a band's lanes together
        var k = l.o.band || '';
        if (seen[k] == null) { seen[k] = blocks.length; blocks.push({band: B[k], lanes: []}); }
        blocks[seen[k]].lanes.push(l);
      });
      blocks.forEach(function (bk) {
        out.push({head: (bk.band ? A11Y.plain(bk.band.o.title) || bk.band.id : 'Lanes') + ':', items: bk.lanes.map(function (l) {
          var its = order.filter(function (it) { return it.lane === l && (it.kind === 'bar' || it.kind === 'ms'); }).sort(function (a, b) { return a.t0 - b.t0; });
          return (A11Y.plain(l.o.title) || l.id) + ': ' + (its.length ? its.map(itemText).join('; ') : 'nothing') + '.';
        })});
      });
      if (deps.length) out.push({head: 'Dependencies:', items: deps.map(function (d) {
        var a = items[d.o.from], b = items[d.o.to];
        return (b ? nm(b) : d.o.to) + ' starts after ' + (a ? nm(a) : d.o.from) + ' ends.';
      })});
      var caps = (stepCaps || []).map(function (s) { return A11Y.plain(s.caption); });
      if (caps.some(Boolean)) out.push({head: 'In ' + caps.length + ' steps:', items: caps.map(function (c, k) { return (k + 1) + '. ' + (c || '…'); })});
      return out;
    }
    function shownText(s) {   // a step without a caption names what it brings in
      var ns = (s.show || []).filter(function (id) { return items[id] && items[id].kind !== 'dep'; }).map(function (id) { return nm(items[id]); });
      return ns.length ? 'shows ' + A11Y.and(ns) : '';
    }
    api.describe = function () { return DESC.describe(); };
    A11Y.watch(api, ['band', 'lane', 'bar', 'milestone', 'phase', 'dep', 'steps'], DESC);

    /* ---------- check ---------- */
    api.check = function () {
      api.render(); fit();
      var out = [], seen = {}, name = svg.id ? '#' + svg.id : 'svg', tol = dates ? 1 : 1e-9;
      function issue(msg, b) { if (seen[msg]) return; seen[msg] = 1; out.push({msg: name + ': ' + msg, box: b}); }
      var texts = [];
      lanes.forEach(function (l) {
        [l.title, l.sub].forEach(function (t) {
          var b = t && bbox(t); if (!b) return;
          texts.push({b: b, s: t.textContent});
          if (b.x + b.w > geo.X0 - 6) issue('title of lane ' + l.id + ' runs into the chart: shorten it or widen labelW', b);
        });
        var bars = l.items.filter(function (it) { return it.kind === 'bar'; });
        bars.forEach(function (a, i) {
          bars.slice(i + 1).forEach(function (b) { if (a.t0 < b.t1 && b.t0 < a.t1) issue('bars ' + a.id + ' and ' + b.id + ' overlap in lane ' + l.id + ': give one its own lane', b.box); });
        });
      });
      order.forEach(function (it) {
        if (it.kind === 'dep') return;
        if (it.t0 < T0 - 1e-9 || it.t1 > T1 + 1e-9) issue((it.kind === 'ms' ? 'milestone ' : it.kind + ' ') + it.id + ' runs outside the time axis', it.box);
        if (it.kind === 'phase') {
          var pb = bbox(it.text);
          if (pb) { texts.push({b: pb, s: it.text.textContent}); if (pb.w + 8 > it.box.w) issue('label of phase ' + it.id + ' is wider than the phase: shorten it', pb); }
          return;
        }
        if (!it.text) return;
        var b = bbox(it.text) || it.lbox; texts.push({b: b, s: it.text.textContent});
        if (it.side === 'in' && b.w + 12 > it.x1 - it.x0) issue('label of ' + it.id + ' overflows its bar', b);
        if (b.x < geo.X0 || b.x + b.w > W - opt.margin + 0.5) issue('label of ' + it.id + ' runs outside the chart', b);
        if (it.side !== 'in') {
          it.lane.items.forEach(function (o) { if (o !== it && inter(b, o.box, 0.5)) issue('label of ' + it.id + ' runs into ' + o.id, b); });
          deps.forEach(function (d) {
            for (var i = 1; i < d.pts.length; i++) if (crosses(d.pts[i - 1], d.pts[i], b)) { issue('label of ' + it.id + ' is crossed by dependency ' + d.id, b); break; }
          });
        }
      });
      deps.forEach(function (d) {
        if (d.to.t0 < d.from.t1 - tol) issue('dependency ' + d.id + ' points backward in time: ' + d.to.id + ' starts before ' + d.from.id + ' ends', d.to.box);
        obstacles([d.from, d.to]).forEach(function (o) {
          for (var i = 1; i < d.pts.length; i++) if (crosses(d.pts[i - 1], d.pts[i], o.box)) { issue('dependency ' + d.id + ' crosses ' + o.id + ': move one of them', o.box); break; }
        });
      });
      (geo.tiers || []).forEach(function (tr) { tr.texts.forEach(function (t) { var b = !t.classList.contains('thin') && bbox(t); if (b) texts.push({b: b, s: t.textContent}); }); });
      if (geo.todayText) texts.push({b: bbox(geo.todayText), s: geo.todayText.textContent});
      texts.forEach(function (a, i) {
        if (!a.b) return;
        if (vb && !contains(vb, a.b)) issue('text "' + a.s + '" is outside the viewBox', a.b);
        texts.slice(i + 1).forEach(function (c) { if (c.b && inter(a.b, c.b, 1.5)) issue('texts "' + a.s + '" and "' + c.s + '" overlap', a.b); });
      });
      // contrast in both themes, wires over text, wires run together: lib/edgesketch.js, when it is on the page
      if (global.EdgeSketch && global.EdgeSketch.paint) global.EdgeSketch.paint(svg, name).forEach(function (i) { if (!seen[i.msg]) { seen[i.msg] = 1; out.push(i); } });
      if (debug) {
        var g = api.layers.debug; while (g.firstChild) g.removeChild(g.firstChild);
        g.setAttribute('class', 'tl-debug'); g.setAttribute('aria-hidden', 'true');
        out.forEach(function (i) { if (i.box) el('rect', {x: i.box.x - 2, y: i.box.y - 2, width: i.box.w + 4, height: i.box.h + 4, rx: 3}, g); });
      }
      return out.map(function (i) { return i.msg; });
    };
    var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
    ready.then(function () {
      if (drawn) fit();
      if (debug) setTimeout(function () { report('timeline:' + self, api.check()); }, 0);
    });
    return api;
  }

  function clearAll() { REG.forEach(function (r) { r.clear(); }); }
  function reposition() { REG.forEach(function (r) { r.reposition(); }); }
  if (global.addEventListener) {
    global.addEventListener('scroll', reposition, true);
    global.addEventListener('resize', reposition);
    document.addEventListener('click', clearAll);
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') clearAll(); });
  }

  // the issues of every checked figure, shared with EdgeDiagram, EdgeSketch and EdgeSequence, in the <pre> shot.sh --check reads
  function report(key, list) {
    var R = global.ED_ISSUES = global.ED_ISSUES || {};
    R[key] = list;
    var pre = document.getElementById('ed-issues');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'ed-issues'; pre.hidden = true; document.body.appendChild(pre); }
    var keys = Object.keys(R);
    pre.textContent = keys.map(function (k) { return R[k].join('\n'); }).filter(Boolean).join('\n');
    pre.setAttribute('data-diagrams', keys.length);
    list.forEach(function (m) { if (global.console) console.warn('[EdgeTimeline] ' + m); });
  }

  global.EdgeTimeline = {create: create, clearAll: clearAll, version: VERSION};
})(window);
