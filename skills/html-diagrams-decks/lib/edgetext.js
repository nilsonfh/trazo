/* EdgeText v1.4.1 — figures written as a few lines of text, drawn by the other libraries.
 *
 *   <svg id="f" role="img" aria-label="..."></svg>
 *   <script type="text/trazo" data-target="#f" data-caption="#cap">
 *   flow LR
 *   zone FIELD { meter[Meter | Modbus] relay[Recloser | DNP3] }
 *   gw[Gateway | polls · converts] {icon: rtu, tone: accent}
 *   meter, relay -> gw: poll
 *   gw -> cloud[Ingest]: forward {tone: add}
 *   step: meter relay | Field devices speak their own protocols.
 *   step: gw | A gateway polls them all.
 *   </script>
 *
 *   var r = EdgeText.render('#f', source, {caption: '#cap'});   // {kind, model, figure, ctl, errors, check()}
 *   var m = EdgeText.parse(source);                              // the model, with m.errors
 *
 * A header line picks the kind, and the rest maps onto a library: flow (EdgeDiagram laid out by
 * EdgeLayout), state (EdgeDiagram's state shapes, top to bottom by default and transitions, laid out too), sequence
 * (EdgeSequence), timeline (EdgeTimeline) and matrix (EdgeMatrix). This file only reads the text;
 * the libraries draw, step and check. Options in braces at the end of a line ({icon: server,
 * tone: accent}) pass straight to the library call the line makes. Lines starting with %% or #
 * are comments. An error names its line; render draws the errors in the figure's place, returns
 * them, and reports them into the <pre id="ed-issues"> that scripts/shot.sh --check reads.
 *
 * script[type="text/trazo"] and pre.trazo blocks render by themselves when the page has loaded
 * (data-target: the svg, else one is made in the block's place; data-caption: where step captions
 * go; data-start: the step to start at). EdgeText.auto() renders any that are left and returns
 * every result, for a page that wires its own buttons.
 */
(function (global) {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg', VERSION = '1.4.1', UID = 0;
  var KINDS = {flow: 'flow', graph: 'flow', flowchart: 'flow', sequence: 'sequence', sequencediagram: 'sequence',
    state: 'state', statediagram: 'state', 'statediagram-v2': 'state', timeline: 'timeline', gantt: 'timeline', matrix: 'matrix'};
  var NEEDS = {flow: ['EdgeDiagram', 'EdgeLayout'], state: ['EdgeDiagram', 'EdgeLayout'], sequence: ['EdgeSequence'],
    timeline: ['EdgeTimeline'], matrix: ['EdgeMatrix']};
  var FILES = {EdgeDiagram: 'edgediagram.js', EdgeLayout: 'edgelayout.js', EdgeSequence: 'edgesequence.js',
    EdgeTimeline: 'edgetimeline.js', EdgeMatrix: 'edgematrix.js'};

  var CSS = [
    '.et-err rect{fill:var(--ed-gap-soft,#fbf1d9);stroke:var(--ed-gap,#b87d00);stroke-width:1.2}',
    '.et-err text{font-family:var(--ed-sans,"IBM Plex Sans",system-ui,sans-serif);font-size:13px;fill:var(--ed-ink,#15201d)}',
    '.et-err text.et-h{font-family:var(--ed-display,"Archivo Narrow",sans-serif);font-weight:700;font-size:16px}',
    '.et-err text.et-src{font-family:var(--ed-mono,monospace);font-size:11.5px;fill:var(--ed-ink2,#3f4f4a)}'
  ].join('\n');
  function injectCSS() {
    if (document.getElementById('et-css')) return;
    var s = document.createElement('style'); s.id = 'et-css'; s.textContent = CSS; document.head.appendChild(s);
  }

  /* ---------- reading ---------- */
  function Err(line, msg) { var e = new Error(msg); e.line = line; return e; }
  function slug(s) { return String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'x'; }
  function uniq(used, base) { var id = base, k = 2; while (used[id]) id = base + '-' + k++; used[id] = true; return id; }
  var ID = /^[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*/;

  // the lines that say something: [{n, text}], comments and blank lines left out
  function lines(src) {
    var out = [];
    String(src || '').replace(/\r\n?/g, '\n').split('\n').forEach(function (raw, i) {
      var t = raw.replace(/(^|\s)%%.*$/, '').trim();
      if (!t || t.charAt(0) === '#') return;
      out.push({n: i + 1, text: t});
    });
    return out;
  }
  // {key: value, key2: 'quoted, with commas', flag}: numbers, true and false become values; a part
  // that does not start with a key belongs to the value before it (so a bare text may hold commas)
  function parseOpts(body, line) {
    var parts = [], cur = '', q = null;
    for (var i = 0; i < body.length; i++) {
      var c = body.charAt(i);
      if (q) { cur += c; if (c === q) q = null; continue; }
      if (c === '"' || c === "'") { q = c; cur += c; continue; }
      if (c === ',') { parts.push(cur); cur = ''; continue; }
      cur += c;
    }
    if (q) throw Err(line, 'a quote is not closed in {' + body + '}');
    parts.push(cur);
    var o = {}, last = null;
    parts.forEach(function (p) {
      var m = /^\s*([A-Za-z_][\w-]*)\s*(?::\s*([\s\S]*))?$/.exec(p);
      if (!m) {
        if (last == null) { if (p.trim()) throw Err(line, 'an option needs a name: "' + p.trim() + '"'); return; }
        o[last] = String(o[last]) + ',' + p; o[last] = value(o[last]); return;
      }
      last = m[1]; o[last] = m[2] == null ? true : value(m[2]);
    });
    return o;
  }
  function value(v) {
    v = String(v).trim();
    if (/^(['"])[\s\S]*\1$/.test(v)) return v.slice(1, -1);
    if (v === 'true') return true;
    if (v === 'false') return false;
    if (/^-?\d+(\.\d+)?$/.test(v)) return +v;
    return v;
  }
  // a line's options in braces at its end: {rest, o}
  function takeOpts(s, line) {
    s = s.trim();
    if (s.charAt(s.length - 1) !== '}') return {rest: s, o: {}};
    var depth = 0;
    for (var i = s.length - 1; i >= 0; i--) {
      var c = s.charAt(i);
      if (c === '}') depth++;
      else if (c === '{' && --depth === 0) return {rest: s.slice(0, i).trim(), o: parseOpts(s.slice(i + 1, -1), line)};
    }
    throw Err(line, 'a "}" has no "{" before it');
  }
  // the text after the first ':' outside brackets: [before, after or null]
  function splitColon(s) {
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c === '[' || c === '(') depth++;
      else if (c === ']' || c === ')') depth--;
      else if (c === ':' && depth <= 0) return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }
    return [s.trim(), null];
  }
  function splitBar(s) {   // 'label | caption' -> [label, caption or null]
    var i = s.indexOf(' | ');
    if (i < 0 && / \|$/.test(s)) return [s.slice(0, -2).trim(), ''];
    return i < 0 ? [s, null] : [s.slice(0, i).trim(), s.slice(i + 3).trim()];
  }
  // 'Title | sub | sub2' -> {title, sub}
  function titled(t) {
    var p = t.split('|').map(function (x) { return x.trim(); });
    var o = {title: p[0]};
    if (p.length === 2) o.sub = p[1]; else if (p.length > 2) o.sub = p.slice(1);
    return o;
  }

  /* A run of node references and arrows: A[Title | sub], B(pill) -> C --> D. Ends in one group are
     separated by commas or & (and by spaces when list is true); returns {groups, arrows}. */
  var ARROWS = /^(<-->|<->|-->>|->>|-->|->|---|--)/;
  function scan(s, line, list, star) {
    var i = 0, groups = [], arrows = [], cur = [];
    function ws() { while (i < s.length && /\s/.test(s.charAt(i))) i++; }
    for (;;) {
      ws();
      var rest = s.slice(i), m = star && /^\[\*\]/.exec(rest) || ID.exec(rest);
      if (!m) throw Err(line, rest ? 'expected a name at "' + rest.slice(0, 24) + '"' : 'a name is missing at the end');
      var ref = {id: m[0]};
      i += m[0].length;
      var c = s.charAt(i), close = c === '[' ? ']' : c === '(' ? ')' : null;
      if (close && ref.id !== '[*]') {
        var j = s.indexOf(close, i + 1);
        if (j < 0) throw Err(line, 'a "' + c + '" after ' + ref.id + ' is not closed');
        Object.assign(ref, titled(s.slice(i + 1, j)));
        if (c === '(') ref.shape = 'pill';
        i = j + 1;
      }
      ws();
      if (s.charAt(i) === '{') {   // options for this name only: A[Title] {icon: server}
        var depth = 0, k = i;
        for (; k < s.length; k++) { if (s.charAt(k) === '{') depth++; else if (s.charAt(k) === '}' && --depth === 0) break; }
        if (k >= s.length) throw Err(line, 'a "{" after ' + ref.id + ' is not closed');
        ref.o = parseOpts(s.slice(i + 1, k), line);
        i = k + 1; ws();
      }
      cur.push(ref);
      if (i >= s.length) { groups.push(cur); break; }
      c = s.charAt(i);
      if (c === ',' || c === '&') { i++; continue; }
      var a = ARROWS.exec(s.slice(i));
      if (a) { groups.push(cur); cur = []; arrows.push(a[0]); i += a[0].length; continue; }
      if (list && ID.test(s.slice(i))) continue;
      throw Err(line, 'unexpected "' + s.slice(i, i + 12) + '" after ' + ref.id + ' (an arrow is ->, -->, <-> or --)');
    }
    return {groups: groups, arrows: arrows};
  }
  function arrowOpts(a) {
    return {'->': {arrow: 'end'}, '->>': {arrow: 'end'}, '-->': {arrow: 'end', dashed: true}, '-->>': {arrow: 'end', dashed: true},
      '<->': {arrow: 'both'}, '<-->': {arrow: 'both', dashed: true}, '--': {arrow: null}, '---': {arrow: null, dashed: true}}[a];
  }

  /* ---------- flow ---------- */
  function parseFlow(L, M) {
    var nodes = [], N = {}, zones = [], Z = {}, links = [], used = {}, steps = [], zone = null, rawSteps = [];
    M.dir = 'TB';
    var hd = M.header.split(/\s+/);
    if (hd[0]) { if (!/^(LR|TB|TD|RL|BT)$/i.test(hd[0])) throw Err(M.headerLine, 'a flow runs LR or TB, not ' + hd[0]); M.dir = /^LR|RL$/i.test(hd[0]) ? 'LR' : 'TB'; }
    function node(ref, line, o) {
      var n = N[ref.id];
      if (!n) {
        if (Z[ref.id]) throw Err(line, ref.id + ' is a zone, not a node');
        n = N[ref.id] = {id: ref.id, o: {title: ref.id}, zone: null, line: line, links: 0};
        nodes.push(n); used[ref.id] = true;
        if (zone) n.zone = zone.id;
      }
      if (ref.title != null) { n.o.title = ref.title; if (ref.sub != null) n.o.sub = ref.sub; }
      if (ref.shape) n.o.shape = ref.shape;
      if (ref.o) Object.assign(n.o, ref.o);
      if (o) Object.assign(n.o, o);
      return n;
    }
    function inZone(n, z, line) {
      if (n.zone && n.zone !== z.id) throw Err(line, n.id + ' is already in zone ' + Z[n.zone].label);
      n.zone = z.id;
    }
    function openZone(t, line) {   // zone NAME { a b } or zone NAME {
      var m = /^zone\s+([^{]+?)\s*\{(.*)$/.exec(t);
      if (!m) throw Err(line, 'a zone is "zone NAME { a b }", or "zone NAME {" with its nodes on the lines below and "}"');
      if (zone) throw Err(line, 'zones do not nest: close ' + zone.label + ' with "}" first');
      var label = m[1], id = uniq(used, 'zone-' + slug(label)), z = {id: id, label: label, o: {}, line: line};
      zones.push(z); Z[id] = z; Z['@' + label.toLowerCase()] = z;
      var body = m[2].trim();
      if (body.charAt(body.length - 1) === '}') {   // one line
        body = body.slice(0, -1).trim();
        if (body) scan(body, line, true).groups[0].forEach(function (r) { inZone(node(r, line), z, line); });
        return;
      }
      if (body) throw Err(line, 'put the nodes of a zone opened with "{" on the lines below it');
      zone = z;
    }
    L.forEach(function (ln) {
      var t = ln.text, line = ln.n, m;
      if ((m = /^title\s*:?\s*(.*)$/i.exec(t))) { M.title = m[1]; return; }
      if (/^zone\s/i.test(t)) return openZone(t, line);
      if (t === '}') { if (!zone) throw Err(line, 'a "}" closes no zone'); zone = null; return; }
      if ((m = /^step\b\s*:?\s*(.*)$/i.exec(t))) {
        var sb = splitBar(m[1]);
        if (/^\|/.test(m[1])) sb = ['', m[1].slice(1).trim()];
        rawSteps.push({tokens: sb[0] ? sb[0].split(/[\s,]+/) : [], caption: sb[1] || '', line: line});
        return;
      }
      var to = takeOpts(t, line), sc = splitColon(to.rest), run = scan(sc[0], line, !sc[1] && !/(->|--)/.test(sc[0]));
      if (!run.arrows.length) {   // a declaration: A[Title | sub] {opts}, or a list of names
        if (sc[1] != null) throw Err(line, 'a label (": ...") belongs on a link, and ' + sc[0] + ' has no arrow');
        run.groups[0].forEach(function (r) { var n = node(r, line, to.o); if (zone) inZone(n, zone, line); });
        return;
      }
      var ends = run.groups.map(function (g) { return g.map(function (r) { return node(r, line).id; }); });
      for (var k = 0; k < run.arrows.length; k++) {
        var a = ends[k], b = ends[k + 1], last = k === run.arrows.length - 1;
        var o = Object.assign({}, arrowOpts(run.arrows[k]), to.o);
        if (last && sc[1]) o.label = sc[1];
        if (a.length > 1 && b.length > 1) throw Err(line, 'one side of a fan must be one node: write ' + a.join(', ') + ' -> X and X -> ' + b.join(', '));
        var L1 = {from: a, to: b, o: o, line: line, fan: a.length > 1 || b.length > 1};
        L1.id = uniq(used, a.length > 1 ? b[0] + '-in' : b.length > 1 ? a[0] + '-out' : a[0] + '-' + b[0]);
        a.concat(b).forEach(function (id) { N[id].links++; });
        links.push(L1);
      }
    });
    if (zone) throw Err(zone.line, 'zone ' + zone.label + ' is not closed with "}"');
    zones.forEach(function (z) { if (!nodes.some(function (n) { return n.zone === z.id; })) throw Err(z.line, 'zone ' + z.label + ' holds no node'); });
    if (!nodes.length) throw Err(M.headerLine, 'a flow needs at least one node');
    // steps: names of nodes, zones (by name or id) and links (A->B, or a link's id)
    rawSteps.forEach(function (s) {
      var items = [];
      s.tokens.forEach(function (tk) {
        if (!tk) return;
        var mm = /^([^-<>]+)-+>+([^-<>]+)$/.exec(tk);
        if (N[tk]) items.push(tk);
        else if (Z[tk] || Z['@' + tk.toLowerCase()]) items.push((Z[tk] || Z['@' + tk.toLowerCase()]).id);
        else if (mm) {
          var hit = links.filter(function (l) { return l.from.indexOf(mm[1]) >= 0 && l.to.indexOf(mm[2]) >= 0; });
          if (!hit.length) throw Err(s.line, 'no link from ' + mm[1] + ' to ' + mm[2]);
          hit.forEach(function (l) { items.push(l.id); });
        } else if (links.some(function (l) { return l.id === tk; })) items.push(tk);
        else throw Err(s.line, 'a step names ' + tk + ', which is no node, zone or link');
      });
      steps.push({items: items, caption: s.caption, line: s.line});
    });
    M.nodes = nodes; M.zones = zones; M.links = links; M.steps = steps;
  }

  function buildFlow(svg, M, o, at) {
    var d = global.EdgeDiagram.create(svg, {icons: o.icons || global.EDGE_ICONS, debug: o.debug, check: o.check});
    var stepped = M.steps.length > 0;
    M.zones.forEach(function (z) { at(z.line); d.zone(z.id, Object.assign({label: z.label}, z.o)); });
    M.nodes.forEach(function (n) {
      at(n.line);
      d.node(n.id, Object.assign({}, n.o, n.zone ? {zone: n.zone} : {}));
    });
    M.links.forEach(function (l) {
      at(l.line);
      var lo = Object.assign({}, l.o);
      if (lo.flow === true || (lo.flow == null && stepped && lo.arrow)) lo.flow = {dir: 1};
      if (lo.flow === false) delete lo.flow;
      if (lo.arrow == null) delete lo.arrow;
      if (!l.fan) d.link(l.id, Object.assign(lo, {from: [l.from[0]], to: [l.to[0]]}));
      else if (l.from.length > 1) d.fan(l.id, Object.assign(lo, {from: l.from.map(function (id) { return [id]; }), to: [l.to[0]]}));
      else d.fan(l.id, Object.assign(lo, {from: [l.from[0]], to: l.to.slice()}));
    });
    at(M.headerLine);
    d.layout(Object.assign({dir: M.dir, bands: M.zones.length > 0}, M.opts));
    d.bindFocus();
    // the steps: a zone shows with its first node, a link once all its ends are shown
    var first = {};
    M.steps.forEach(function (s, k) { s.items.forEach(function (id) { if (first[id] == null) first[id] = k; }); });
    function when(id) { return first[id] || 0; }
    var list = M.steps.length ? M.steps.map(function (s) { return {show: [], flows: [], stopFlows: [], caption: s.caption}; }) : [{flows: [], caption: ''}];
    M.zones.forEach(function (z) {
      var k = first[z.id] != null ? first[z.id] : Math.min.apply(null, M.nodes.filter(function (n) { return n.zone === z.id; }).map(function (n) { return when(n.id); }));
      if (k > 0) list[k].show.push(z.id, z.id + '.label');
    });
    M.nodes.forEach(function (n) { if (first[n.id] > 0) list[first[n.id]].show.push(n.id); });
    M.links.forEach(function (l) {
      var k = first[l.id] != null ? first[l.id] : Math.max.apply(null, l.from.concat(l.to).map(when));
      if (k > 0) list[k].show.push(l.id);
      var flows = l.o.flow === true || (l.o.flow == null && stepped && l.o.arrow);
      if (!flows) return;
      list[stepped ? k : 0].flows.push(l.id);
      if (stepped && k + 1 < list.length && l.o.flow !== true) list[k + 1].stopFlows.push(l.id);
    });
    return {figure: d, list: list, steps: function (opt) { return d.steps(list, opt); }};
  }

  /* ---------- state ---------- */
  function parseState(L, M) {
    var states = [], S = {}, comps = [], C = {}, trans = [], used = {}, scope = null, rawSteps = [], walk = null;
    var hd = M.header.split(/\s+/);
    M.dir = 'TB';   // a column: an LR machine of any length is a thin strip
    if (hd[0]) { if (!/^(LR|TB|TD)$/i.test(hd[0])) throw Err(M.headerLine, 'a state machine runs LR or TB, not ' + hd[0]); M.dir = /^LR$/i.test(hd[0]) ? 'LR' : 'TB'; }
    function pseudo(kind, line) {   // [*] in this scope: its start, or its end
      var id = (kind === 'initial' ? '_start' : '_end') + (scope ? '_' + scope.id : '');
      if (!S[id]) {
        S[id] = {id: id, o: kind === 'initial' ? {shape: 'initial', w: 18, h: 18, label: 'start'} : {shape: 'final', w: 24, h: 24, label: 'end'},
          comp: scope && scope.id, line: line};
        states.push(S[id]);
        if (scope) (kind === 'initial' ? scope.init = id : scope.fin = id);
      }
      return S[id];
    }
    function state(ref, line, o) {
      if (C[ref.id]) {
        if (ref.title != null) C[ref.id].title = ref.title;
        return C[ref.id];
      }
      var s = S[ref.id];
      if (!s) {
        s = S[ref.id] = {id: ref.id, o: {shape: 'state', title: ref.id}, comp: scope && scope.id, line: line};
        states.push(s); used[ref.id] = true;
        if (scope && !scope.first) scope.first = ref.id;
      }
      if (ref.title != null) { s.o.title = ref.title; if (ref.sub != null) s.o.sub = ref.sub; }
      if (ref.o) o = Object.assign({}, ref.o, o);
      if (o) {
        Object.assign(s.o, o);
        var px = {choice: 32, initial: 18, final: 24}[o.shape];   // the pseudo states: a small square, named for screen readers
        if (px && o.w == null) { s.o.w = s.o.h = px; s.o.label = s.o.label || s.o.title; delete s.o.title; }
      }
      return s;
    }
    L.forEach(function (ln) {
      var t = ln.text, line = ln.n, m;
      if ((m = /^title\s*:?\s*(.*)$/i.exec(t))) { M.title = m[1]; return; }
      if (t === '}') { if (!scope) throw Err(line, 'a "}" closes no composite state'); scope = null; return; }
      if ((m = /^step\b\s*:?\s*(.*)$/i.exec(t))) {
        var sb = splitBar(m[1]);
        rawSteps.push({name: sb[0].trim(), caption: sb[1] || '', line: line});
        return;
      }
      if ((m = /^walk\s*:?\s*(.*)$/i.exec(t))) { walk = {names: m[1].split(/\s*(?:->|,|\s)\s*/).filter(Boolean), line: line}; return; }
      if ((m = /^state\s+(.+?)\s*\{$/.exec(t))) {   // a composite: state Name[Title] {
        if (scope) throw Err(line, 'composite states do not nest here: close ' + scope.id + ' with "}" first');
        var r = scan(m[1], line).groups[0][0];
        var was = S[r.id];   // named by a transition before its block: it becomes the composite
        if (was) {
          if (was.comp) throw Err(line, r.id + ' is already a state inside ' + was.comp);
          states.splice(states.indexOf(was), 1); delete S[r.id];
        }
        scope = C[r.id] = {id: r.id, title: r.title || (was && was.o.title) || r.id, line: line};
        comps.push(scope); used[r.id] = true;
        return;
      }
      if ((m = /^state\s+(\S+?)\s*<<\s*(choice|initial|final)\s*>>$/.exec(t))) { state({id: m[1]}, line, {shape: m[2]}); return; }
      if ((m = /^state\s+(.+)$/.exec(t))) t = m[1];
      var to = takeOpts(t, line), sc = splitColon(to.rest), run = scan(sc[0], line, false, true);
      if (!run.arrows.length) {   // a declaration: Name[Title | sub] {opts}, or Name: what it means
        var g = run.groups[0];
        if (g.length > 1) throw Err(line, 'declare one state a line');
        if (g[0].id === '[*]') throw Err(line, '[*] is a start or an end, and needs an arrow');
        var s0 = state(g[0], line, to.o);
        if (sc[1] != null && s0.o) s0.o.sub = sc[1];
        return;
      }
      if (run.arrows.length > 1) throw Err(line, 'write one transition a line');
      if (run.arrows[0] !== '->' && run.arrows[0] !== '-->') throw Err(line, 'a transition is "A -> B" (or --> for a dashed one), not ' + run.arrows[0]);
      if (run.groups[0].length > 1 || run.groups[1].length > 1) throw Err(line, 'a transition joins one state to one state');
      var a = run.groups[0][0], b = run.groups[1][0];
      var from = a.id === '[*]' ? pseudo('initial', line) : state(a, line), too = b.id === '[*]' ? pseudo('final', line) : state(b, line);
      var o = Object.assign({}, to.o);
      if (run.arrows[0] === '-->') o.dashed = true;
      if (sc[1]) {
        var lm = /^([^\[\/]*?)\s*(?:\[([^\]]*)\])?\s*(?:\/\s*(.*))?$/.exec(sc[1]);
        if (lm[1]) o.event = lm[1]; if (lm[2]) o.guard = lm[2]; if (lm[3]) o.action = lm[3];
      }
      trans.push({id: uniq(used, from.id + '-' + too.id), from: from.id, to: too.id, o: o, line: line});
    });
    if (scope) throw Err(scope.line, 'composite state ' + scope.id + ' is not closed with "}"');
    // a transition to a composite enters at its start (else its first state); one from it leaves from its end
    trans.forEach(function (tr) {
      ['from', 'to'].forEach(function (k) {
        var c = C[tr[k]];
        if (!c) return;
        var at = k === 'to' ? c.init || c.first : c.fin || c.first;
        if (!at) throw Err(tr.line, 'composite state ' + c.id + ' holds no state to ' + (k === 'to' ? 'enter' : 'leave'));
        tr[k] = at;
      });
    });
    comps.forEach(function (c) { if (!c.first && !c.init) throw Err(c.line, 'composite state ' + c.id + ' holds no state'); });
    if (!states.length) throw Err(M.headerLine, 'a state machine needs at least one state');
    // a walk: the states in order, each reached by a transition from the one before
    var seq = [], caps = [];
    if (walk && rawSteps.length) throw Err(walk.line, 'use either walk or step lines, not both');
    var named = walk ? walk.names.map(function (n) { return {name: n, line: walk.line, caption: ''}; }) : rawSteps;
    named.forEach(function (s, k) {
      var id = s.name === '[*]' ? '_start' : s.name;
      if (C[id]) id = C[id].init || C[id].first;
      if (!S[id]) throw Err(s.line, 'a step names ' + s.name + ', which is no state');
      if (k) {
        var prev = seq[seq.length - 1], tr = trans.filter(function (x) { return x.from === prev && x.to === id; })[0];
        if (!tr) throw Err(s.line, 'no transition from ' + prev + ' to ' + id);
        seq.push(tr.id);
      }
      seq.push(id); caps.push(s.caption);
    });
    M.states = states; M.composites = comps; M.transitions = trans; M.walk = seq; M.captions = caps;
  }

  function buildState(svg, M, o, at) {
    var d = global.EdgeDiagram.create(svg, {icons: o.icons || global.EDGE_ICONS, debug: o.debug, check: o.check});
    M.composites.forEach(function (c) { at(c.line); d.zone(c.id, {label: c.title}); });
    M.states.forEach(function (s) { at(s.line); d.node(s.id, Object.assign({}, s.o, s.comp ? {zone: s.comp} : {})); });
    M.transitions.forEach(function (t) {
      at(t.line);
      var self = t.from === t.to;
      d.transition(t.id, Object.assign({side: self ? (M.dir === 'LR' ? 'top' : 'right') : undefined}, t.o, {from: self ? t.from : [t.from], to: self ? t.to : [t.to]}));
    });
    at(M.headerLine);
    d.layout(Object.assign({dir: M.dir}, M.opts));
    d.bindFocus();
    var list = M.walk.length ? d.walk(M.walk, M.captions) : [{caption: ''}];
    return {figure: d, list: list, steps: function (opt) { return d.steps(list, opt); }};
  }

  /* ---------- sequence ---------- */
  function parseSequence(L, M) {
    var actors = [], A = {}, groups = [], entries = [], frames = [], stack = [], used = {}, nm = 0, nn = 0, nf = 0;
    function actor(ref, line, o) {
      var a = A[ref.id];
      if (!a) { a = A[ref.id] = {id: ref.id, o: {title: ref.id}, line: line}; actors.push(a); used[ref.id] = true; }
      if (ref.title != null) { a.o.title = ref.title; if (ref.sub != null) a.o.sub = ref.sub; }
      if (ref.o) Object.assign(a.o, ref.o);
      if (o) Object.assign(a.o, o);
      return a;
    }
    function entry(e) {
      entries.push(e);
      stack.forEach(function (f) { if (!f.from) f.from = e.id; f.to = e.id; if (f.pendingElse) { f.else.push({at: e.id, label: f.pendingElse}); f.pendingElse = null; } });
    }
    L.forEach(function (ln) {
      var t = ln.text, line = ln.n, m;
      if ((m = /^title\s*:?\s*(.*)$/i.exec(t))) { M.title = m[1]; return; }
      if ((m = /^(participant|actor)\s+(.*)$/i.exec(t))) {
        var to = takeOpts(m[2], line), as = /^(\S+)\s+as\s+(.+)$/.exec(to.rest);
        var ref = as ? Object.assign({id: as[1]}, titled(as[2])) : scan(to.rest, line).groups[0][0];
        if (!ID.test(ref.id) || ID.exec(ref.id)[0] !== ref.id) throw Err(line, 'not a name: ' + ref.id);
        actor(ref, line, to.o);
        return;
      }
      if ((m = /^(group|box)\s+([^{]+?)\s*\{(.*)\}$/i.exec(t))) {
        var ids = scan(m[3], line, true).groups[0].map(function (r) { return actor(r, line).id; });
        groups.push({label: m[2], ids: ids, line: line});
        return;
      }
      if ((m = /^note\s+(over|left of|right of)\s+([^:]+):\s*(.*)$/i.exec(t))) {
        var nt = takeOpts(m[3], line), ns = splitBar(nt.rest);
        var over = m[2].split(/\s*,\s*/).map(function (id) {
          if (!A[id.trim()]) throw Err(line, 'a note over ' + id.trim() + ', who is not a participant yet');
          return id.trim();
        });
        entry({id: uniq(used, 'n' + (++nn)), type: 'note', o: Object.assign({over: over, text: ns[0]}, ns[1] != null ? {caption: ns[1]} : {}, nt.o), line: line});
        return;
      }
      if ((m = /^(alt|opt|loop|par|critical|break)\b\s*(.*)$/i.exec(t))) {
        var f = {id: uniq(used, 'f' + (++nf)), kind: m[1].toLowerCase(), label: m[2] || '', else: [], line: line};
        frames.push(f); stack.push(f);
        return;
      }
      if ((m = /^(else|and)\b\s*(.*)$/i.exec(t))) {
        var top = stack[stack.length - 1];
        if (!top) throw Err(line, m[1] + ' outside an alt or par frame');
        if (!top.from) throw Err(line, m[1] + ' comes before any message of its frame');
        top.pendingElse = m[2] || m[1]; top.elseLine = line;
        return;
      }
      if (/^end$/i.test(t)) {
        var fr = stack.pop();
        if (!fr) throw Err(line, '"end" closes no frame');
        if (!fr.from) throw Err(fr.line, 'frame ' + fr.kind + ' holds no message');
        if (fr.pendingElse) throw Err(fr.elseLine, 'an else needs a message after it');
        return;
      }
      var mo = takeOpts(t, line), mm = /^([^\s:]+?)\s*(-->>|->>|-->|->)\s*([^\s:]+?)\s*(?::\s*(.*))?$/.exec(mo.rest);
      if (!mm) {
        if (/->/.test(t)) throw Err(line, 'a message is "A -> B: label" (--> for a reply)');
        throw Err(line, 'not a sequence line: ' + t + ' (participant, A -> B: label, note over A: text, alt / else / end, loop)');
      }
      var lb = splitBar(mm[4] || ''), from = actor({id: mm[1]}, line), to2 = actor({id: mm[3]}, line);
      [mm[1], mm[3]].forEach(function (id) { if (ID.exec(id)[0] !== id) throw Err(line, 'not a name: ' + id); });
      var eo = Object.assign({label: lb[0]}, lb[1] != null ? {caption: lb[1]} : {}, mo.o);
      if (from === to2) entry({id: uniq(used, 'm' + (++nm)), type: 'self', o: Object.assign({at: from.id}, eo), line: line});
      else entry({id: uniq(used, 'm' + (++nm)), type: 'msg', o: Object.assign({from: from.id, to: to2.id}, /^--/.test(mm[2]) ? {reply: true} : {}, eo), line: line});
    });
    if (stack.length) throw Err(stack[stack.length - 1].line, stack[stack.length - 1].kind + ' frame is not closed with "end"');
    if (!actors.length) throw Err(M.headerLine, 'a sequence needs at least one participant');
    M.actors = actors; M.groups = groups; M.entries = entries; M.frames = frames;
  }

  function buildSequence(svg, M, o, at) {
    var vbv = svg.viewBox && svg.viewBox.baseVal;
    if (!(vbv && vbv.width)) svg.setAttribute('viewBox', '0 0 ' + Math.max(560, Math.min(1200, 190 * M.actors.length)) + ' 300');
    var q = global.EdgeSequence.create(svg, Object.assign({icons: o.icons || global.EDGE_ICONS, debug: o.debug}, M.opts));
    M.groups.forEach(function (g) { at(g.line); q.group(g.label, g.ids); });
    M.actors.forEach(function (a) { at(a.line); q.actor(a.id, a.o); });
    M.entries.forEach(function (e) { at(e.line); q[e.type === 'note' ? 'note' : e.type](e.id, e.o); });
    M.frames.forEach(function (f) { at(f.line); q.frame(f.id, {kind: f.kind, label: f.label, from: f.from, to: f.to, else: f.else}); });
    at(M.headerLine);
    return {figure: q, steps: function (opt) { return q.steps(null, Object.assign({caption0: M.title || ''}, opt)); }};
  }

  /* ---------- timeline ---------- */
  var TIME = '(\\d{4}(?:-\\d{2}(?:-\\d{2})?)?|\\d+(?:\\.\\d+)?)';
  function parseTimeline(L, M) {
    var bands = [], lanes = [], items = [], deps = [], used = {}, lane = null, band = null, byName = {};
    L.forEach(function (ln) {
      var t = ln.text, line = ln.n, m, to;
      if ((m = /^title\s*:?\s*(.*)$/i.exec(t))) { M.title = m[1]; return; }
      if ((m = new RegExp('^axis\\s+' + TIME + '\\s*\\.\\.\\s*' + TIME + '(?:\\s+(\\w+))?$').exec(t))) {
        M.axis = {start: m[1], end: m[2], unit: m[3], line: line};
        return;
      }
      if (/^axis\b/.test(t)) throw Err(line, 'an axis is "axis 2027-01 .. 2027-12 month" (day, week, month, quarter or year)');
      if ((m = new RegExp('^today\\s+' + TIME + '$').exec(t))) { M.opts.today = m[1]; return; }
      if ((m = /^band\s+(.+)$/i.exec(t))) { band = {id: uniq(used, 'band-' + slug(m[1])), title: m[1], line: line}; bands.push(band); return; }
      if ((m = /^lane\s+(.+)$/i.exec(t))) {
        to = takeOpts(m[1], line);
        var lb = /^([\w-]+)\[(.*)\]$/.exec(to.rest), o = lb ? titled(lb[2]) : {title: to.rest};
        lane = {id: uniq(used, lb ? lb[1] : 'lane-' + slug(to.rest)), o: Object.assign(o, band ? {band: band.id} : {}, to.o), line: line};
        lanes.push(lane);
        return;
      }
      if ((m = /^(bar|phase|milestone)\s+(.+)$/i.exec(t))) {
        var kind = m[1].toLowerCase();
        to = takeOpts(m[2], line);
        var cap = splitBar(to.rest), body = cap[0];
        var rx = kind === 'milestone' ? new RegExp('^(.+?)\\s+' + TIME + '$') : new RegExp('^(.+?)\\s+' + TIME + '\\s*\\.\\.\\s*' + TIME + '$');
        var p = rx.exec(body);
        if (!p) throw Err(line, kind === 'milestone' ? 'a milestone is "milestone Label 2027-07-20"' : 'a ' + kind + ' is "' + kind + ' Label 2027-01-15 .. 2027-03-10"');
        if (kind !== 'phase' && !lane) throw Err(line, 'a ' + kind + ' needs a "lane" line before it');
        var lbl = p[1].trim(), idm = /^([\w-]+)\[(.*)\]$/.exec(lbl);
        if (idm) lbl = idm[2].trim();
        var it = {id: uniq(used, idm ? idm[1] : slug(lbl)), kind: kind, line: line,
          o: Object.assign({label: lbl}, kind === 'milestone' ? {at: p[2]} : {start: p[2], end: p[3]}, kind !== 'phase' ? {lane: lane.id} : {}, cap[1] != null ? {caption: cap[1]} : {}, to.o)};
        items.push(it);
        byName[it.id] = it; if (!byName['@' + lbl.toLowerCase()]) byName['@' + lbl.toLowerCase()] = it;
        return;
      }
      if (/->/.test(t)) {   // dependencies: Schema -> Endpoints, Screens
        var parts = t.split(/\s*->\s*/);
        if (parts.length !== 2 || !parts[0] || !parts[1]) throw Err(line, 'a dependency is "A -> B" (or "A -> B, C")');
        var find = function (n) {
          n = n.trim();
          var x = byName[n] || byName['@' + n.toLowerCase()] || byName[slug(n)];
          if (!x || x.kind === 'phase') throw Err(line, 'no bar or milestone named ' + n + ' (define it before the arrow)');
          return x.id;
        };
        var a = find(parts[0]);
        parts[1].split(/\s*,\s*/).forEach(function (b) { deps.push({id: uniq(used, 'dep-' + a + '-' + find(b)), from: a, to: find(b), line: line}); });
        return;
      }
      throw Err(line, 'not a timeline line: ' + t + ' (axis, band, lane, bar, milestone, phase, A -> B)');
    });
    if (!M.axis) throw Err(M.headerLine, 'a timeline needs an axis line: "axis 2027-01 .. 2027-12 month"');
    if (!lanes.length) throw Err(M.headerLine, 'a timeline needs at least one lane');
    M.bands = bands; M.lanes = lanes; M.items = items; M.deps = deps;
  }

  function buildTimeline(svg, M, o, at) {
    var vbv = svg.viewBox && svg.viewBox.baseVal;
    if (!(vbv && vbv.width)) svg.setAttribute('viewBox', '0 0 1000 300');
    var co = Object.assign({}, M.opts), by = co.by; delete co.by;
    at(M.axis.line);
    var t = global.EdgeTimeline.create(svg, Object.assign({start: M.axis.start, end: M.axis.end, icons: o.icons || global.EDGE_ICONS, debug: o.debug},
      M.axis.unit ? {unit: M.axis.unit} : {}, co));
    M.bands.forEach(function (b) { at(b.line); t.band(b.id, {title: b.title}); });
    M.lanes.forEach(function (l) { at(l.line); t.lane(l.id, l.o); });
    M.items.forEach(function (it) { at(it.line); t[it.kind](it.id, it.o); });
    M.deps.forEach(function (dp) { at(dp.line); t.dep(dp.id, {from: dp.from, to: dp.to}); });
    at(M.headerLine);
    t.render();
    return {figure: t, steps: function (opt) { return t.steps(null, Object.assign({caption0: M.title || ''}, by ? {by: by} : {}, opt)); }};
  }

  /* ---------- matrix ---------- */
  function parseMatrix(L, M) {
    var cols = null, rows = [], groups = [], legend = [], used = {}, group = null;
    L.forEach(function (ln) {
      var t = ln.text, line = ln.n, m;
      if ((m = /^title\s*:?\s*(.*)$/i.exec(t))) { M.title = m[1]; return; }
      if ((m = /^state\s+(\S)\s+(.+)$/i.exec(t))) {   // state F Covered {tone: add, style: solid}
        var so = takeOpts(m[2], line);
        if (m[1] === '.') throw Err(line, '"." is an empty cell; pick another key');
        legend.push(Object.assign({id: slug(so.rest), key: m[1], label: so.rest}, so.o));
        return;
      }
      if ((m = /^group\s+(.+)$/i.exec(t))) {
        var gb = splitBar(m[1]);
        group = {id: uniq(used, 'g-' + slug(gb[0])), label: gb[0], caption: gb[1] || '', line: line};
        groups.push(group);
        return;
      }
      if (t.indexOf('|') < 0) throw Err(line, 'not a matrix line: ' + t + ' (a row is "Label | F P N", a group "group NAME")');
      var cells = t.replace(/^\|/, ' |').replace(/\|$/, '').split('|').map(function (c) { return c.trim(); });
      if (!cols) {   // the first row names the columns; its first cell is the corner
        M.corner = cells[0];
        cols = cells.slice(1).map(function (c, i) { if (!c) throw Err(line, 'column ' + (i + 1) + ' has no name'); return {id: 'c' + (i + 1), label: c}; });
        if (!cols.length) throw Err(line, 'the first row names the columns: "| Power cut | Disk full"');
        return;
      }
      var states = cells.slice(1);
      if (states.length === 1 && cols.length > 1) states = states[0].split(/\s+/);
      if (states.length !== cols.length) throw Err(line, 'row ' + cells[0] + ' has ' + states.length + ' cells for ' + cols.length + ' columns');
      var lab = cells[0], code = /^\[([^\]]+)\]\s*(.*)$/.exec(lab);
      rows.push({id: uniq(used, 'r' + (rows.length + 1)), label: code ? code[2] : lab, code: code ? code[1] : null, group: group && group.id, cells: states, line: line});
    });
    if (!cols) throw Err(M.headerLine, 'a matrix needs a row of columns: "| Power cut | Disk full"');
    if (!rows.length) throw Err(M.headerLine, 'a matrix needs at least one row');
    var keys = {};
    (legend.length ? legend : (global.EdgeMatrix && global.EdgeMatrix.legend) || [{key: 'F'}, {key: 'P'}, {key: 'N'}, {key: 'X'}]).forEach(function (s) { keys[s.key] = s.id || s.key; });
    rows.forEach(function (r) {
      r.cells = r.cells.map(function (c) {
        if (c === '.' || c === '-' || c === '') return null;
        var k = c.charAt(0);
        if (!keys[k]) throw Err(r.line, 'cell "' + c + '": ' + k + ' is no state (' + Object.keys(keys).join(' ') + ', or . for empty)');
        return c.length > 1 ? {state: keys[k], mark: c.slice(1)} : keys[k];
      });
    });
    M.cols = cols; M.rows = rows; M.groups = groups; M.legend = legend.length ? legend : null;
  }

  function buildMatrix(svg, M, o, at) {
    var co = Object.assign({icons: o.icons || global.EDGE_ICONS, debug: o.debug}, M.legend ? {legend: M.legend} : {}, M.corner ? {corner: M.corner} : {}, M.opts);
    at(M.headerLine);
    var m = global.EdgeMatrix.create(svg, co);
    M.groups.forEach(function (g) { at(g.line); m.rowGroup(g.id, {label: g.label, caption: g.caption}); });
    m.cols(M.cols.map(function (c) { return {id: c.id, label: c.label}; }));
    M.rows.forEach(function (r) {
      at(r.line);
      m.row(r.id, Object.assign({label: r.label}, r.code ? {code: r.code} : {}, r.group ? {group: r.group} : {}));
      r.cells.forEach(function (v, i) { if (v) m.cell(r.id, M.cols[i].id, v); });
    });
    at(M.headerLine);
    return {figure: m, steps: function (opt) { return m.steps(null, Object.assign({caption0: M.title || '', captionTotals: 'The totals per state.'}, opt)); }};
  }

  var PARSE = {flow: parseFlow, state: parseState, sequence: parseSequence, timeline: parseTimeline, matrix: parseMatrix};
  var BUILD = {flow: buildFlow, state: buildState, sequence: buildSequence, timeline: buildTimeline, matrix: buildMatrix};

  /* EdgeText.parse(source): the model, {kind, title, opts, ..., errors: [{line, message}]}. */
  function parse(source) {
    var L = lines(source), M = {kind: null, title: null, opts: {}, errors: []};
    try {
      if (!L.length) throw Err(1, 'the text is empty: start with flow LR, sequence, state, timeline or matrix');
      var h = L[0], to = takeOpts(h.text, h.n), m = /^(\S+)\s*(.*)$/.exec(to.rest), kind = KINDS[m[1].toLowerCase()];
      if (!kind) throw Err(h.n, 'the first line names the kind: flow LR, flow TB, sequence, state, timeline or matrix (not "' + m[1] + '")');
      M.kind = kind; M.header = m[2]; M.headerLine = h.n; M.opts = to.o;
      PARSE[kind](L.slice(1), M);
    } catch (e) {
      if (e.line == null) throw e;
      M.errors.push({line: e.line, message: e.message});
    }
    return M;
  }

  /* ---------- rendering ---------- */
  function svgOf(target) {
    var el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!el) throw new Error('EdgeText: no element ' + target);
    if (el.tagName.toLowerCase() !== 'svg') throw new Error('EdgeText: ' + target + ' is not an <svg>');
    return el;
  }
  function clear(svg) { while (svg.firstChild) svg.removeChild(svg.firstChild); }
  function showErrors(svg, errors, source) {
    injectCSS(); clear(svg);
    var src = String(source || '').replace(/\r\n?/g, '\n').split('\n');
    var W = 760, rows = [];
    errors.forEach(function (e) {
      rows.push({cls: '', text: 'Line ' + e.line + ': ' + e.message});
      var s = (src[e.line - 1] || '').trim();
      if (s) rows.push({cls: 'et-src', text: s.length > 96 ? s.slice(0, 95) + '…' : s});
    });
    var H = 64 + rows.length * 22;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    var g = document.createElementNS(NS, 'g');
    g.setAttribute('class', 'et-err');
    svg.appendChild(g);
    function add(tag, attrs, text) {
      var el = document.createElementNS(NS, tag);
      Object.keys(attrs).forEach(function (k) { el.setAttribute(k, attrs[k]); });
      if (text != null) el.textContent = text;
      g.appendChild(el); return el;
    }
    add('rect', {x: 1, y: 1, width: W - 2, height: H - 2, rx: 10});
    add('text', {x: 20, y: 32, 'class': 'et-h'}, 'This figure has ' + (errors.length > 1 ? errors.length + ' errors' : 'an error'));
    rows.forEach(function (r, i) { add('text', {x: r.cls ? 36 : 20, y: 62 + i * 22, 'class': r.cls}, r.text); });
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'Figure not drawn: ' + errors.map(function (e) { return 'line ' + e.line + ': ' + e.message; }).join('; '));
  }
  // errors go into the shared <pre id="ed-issues"> as well, so shot.sh --check fails on them
  function report(key, list) {
    var R = global.ED_ISSUES = global.ED_ISSUES || {};
    R[key] = list;
    var pre = document.getElementById('ed-issues');
    if (!pre) { pre = document.createElement('pre'); pre.id = 'ed-issues'; pre.hidden = true; document.body.appendChild(pre); }
    var keys = Object.keys(R);
    pre.textContent = keys.map(function (k) { return R[k].join('\n'); }).filter(Boolean).join('\n');
    pre.setAttribute('data-diagrams', keys.length);
    list.forEach(function (m) { if (global.console) console.warn('[EdgeText] ' + m); });
  }

  /* EdgeText.render(svg or selector, source, opts): parses and draws. opts: caption (an element or a
     selector that gets each step's caption), onStep(k, step, ctl), start (a step or 'end'), icons,
     debug, check (EdgeDiagram). Returns {kind, model, svg, figure, ctl, errors, check()}. */
  function render(target, source, opts) {
    opts = opts || {};
    var svg = svgOf(target), M = parse(source), self = ++UID;
    var res = {kind: M.kind, model: M, svg: svg, figure: null, ctl: null, errors: M.errors,
      check: function () { return res.figure && res.figure.check ? res.figure.check() : []; }};
    if (!M.errors.length) {
      var missing = (NEEDS[M.kind] || []).filter(function (g) { return !global[g]; });
      if (missing.length) M.errors.push({line: M.headerLine, message: M.kind + ' needs ' + missing.map(function (g) { return 'lib/' + FILES[g]; }).join(' and ') + ' on the page'});
    }
    var line = M.headerLine || 1;
    if (!M.errors.length) {
      try {
        clear(svg);
        if (!svg.getAttribute('viewBox') && (M.kind === 'flow' || M.kind === 'state')) svg.setAttribute('viewBox', '0 0 1000 560');
        svg.setAttribute('role', 'img');
        if (M.title && !svg.getAttribute('aria-label')) svg.setAttribute('aria-label', M.title);
        var B = BUILD[M.kind](svg, M, opts, function (n) { line = n; });
        res.figure = B.figure;
        var cap = typeof opts.caption === 'string' ? document.querySelector(opts.caption) : opts.caption;
        var so = {onStep: function (k, s, c) {
          if (cap) cap.textContent = (s && s.caption) || '';
          if (opts.onStep) opts.onStep(k, s, c || res.ctl);
        }};
        if (opts.start != null) so.start = opts.start === 'end' && B.list ? B.list.length - 1 : opts.start;   // EdgeDiagram takes a number
        var ms = opts.maxScale != null ? opts.maxScale : 1.15, vw = svg.viewBox && svg.viewBox.baseVal && svg.viewBox.baseVal.width;
        if (B.list && ms && vw) svg.style.maxWidth = Math.round(vw * ms) + 'px';   // a laid-out figure is not blown up past its size
        res.steps = B.list || null;   // flow and state: the steps given to EdgeDiagram
        res.ctl = B.steps(so);
      } catch (e) {
        M.errors.push({line: e.line || line, message: String(e.message || e).replace(/^Edge\w+: /, '')});
      }
    }
    if (M.errors.length) {
      res.figure = null; res.ctl = null;
      showErrors(svg, M.errors, source);
      report('text:' + self, M.errors.map(function (e) { return (svg.id ? '#' + svg.id + ' ' : '') + 'line ' + e.line + ': ' + e.message; }));
    }
    svg.trazo = res;
    return res;
  }

  /* script[type="text/trazo"] and pre.trazo blocks: each renders once, into data-target or an svg
     made in its place. Returns every result so far, in page order. */
  var results = [];
  function auto() {
    [].forEach.call(document.querySelectorAll('script[type="text/trazo"], pre.trazo'), function (el) {
      if (el.trazoDone) return;
      el.trazoDone = true;
      var sel = el.getAttribute('data-target'), svg = sel ? document.querySelector(sel) : null;
      if (sel && !svg) { if (global.console) console.warn('[EdgeText] no element ' + sel); return; }
      if (!svg) {
        svg = document.createElementNS(NS, 'svg');
        if (el.getAttribute('data-id')) svg.id = el.getAttribute('data-id');
        svg.setAttribute('class', 'trazo');
        el.parentNode.insertBefore(svg, el.nextSibling);
      }
      if (el.tagName === 'PRE') el.hidden = true;
      var start = el.getAttribute('data-start');
      results.push(render(svg, el.textContent, {caption: el.getAttribute('data-caption') || null,
        start: start == null ? undefined : /^\d+$/.test(start) ? +start : start}));
    });
    return results.slice();
  }
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', auto);
    else setTimeout(auto, 0);
  }

  global.EdgeText = {parse: parse, render: render, auto: auto, version: VERSION};
})(window);
