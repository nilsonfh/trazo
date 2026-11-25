/* EdgeDeck v1.5.0 — a 1600x900 slide engine for single-file HTML decks.
 *
 *   EdgeDeck.run({builds: BUILDS, lib: {name: 1, ...}, icons: window.EDGE_ICONS, notes: {name: '...'}});
 *
 * The page provides a 1600x900 #stage inside #viewport, its slides as <section class="slide"
 * data-steps="N" data-build="name">, each with an optional <ol class="caps"> (one <li> per step),
 * <div class="stepdots"> and <aside class="notes"> (the speaker's notes, never shown on the slide), and a
 * control bar with #b-prev, #b-next, #b-full, #prog and #count (and #b-notes, optional).
 * builds[name](slide) returns a paused GSAP timeline whose labels s0..sN are the state after step N
 * (tl.onStep(k) is called on every step, with -1 when the slide is left), or null. Without GSAP the
 * builds named in lib still run once, to draw their final state. With icons, the sprite is injected
 * once as #ed-icons, which EdgeDiagram then reuses. Keys: right, down, PageDown, space, Enter, J
 * forward; left, up, PageUp, Backspace, Shift+space, P, K back; with Shift a whole slide; Home/End;
 * a number then Enter to go to that slide; F fullscreen; B, W or . blanks the screen (a clicker's
 * key); N opens the presenter view. A click (left 30% back), a swipe; a bare #n in the address opens
 * slide n. Changing slide releases any pinned tooltip. With window.ED_DEBUG every slide is built at
 * the start, so EdgeDiagram's check covers the whole deck.
 *
 * Presenter view: a second window on the same page (#presenter) with the current slide, the next one,
 * the notes and a timer. Every window of the deck follows the one that moved: BroadcastChannel, and
 * postMessage between the deck and the window it opened (which also works where file:// pages get no
 * channel). Where popups are blocked (an artifact's frame), the view takes the deck's own window.
 *
 * Print: the browser's print, and scripts/topdf.sh, give one 16:9 page per slide at its last step, in
 * the light theme (run({printTheme: 'dark' | 'page'}) to change it); with window.ED_PRINT = {steps: 1}
 * one page per step.
 *
 * Accessibility: slides are named groups, and a live region reads each new slide and step caption
 * (run({live: false}) leaves it out).
 */
(function (global) {
  'use strict';
  /* ?static or ?static=K in the address, or window.TRAZO_STATIC = true | K before the library loads:
     no motion, and the slide from #n shows at step K (default: the last). scripts/visual.py renders pages so. */
  var frozen = (function (v, m) { if (v == null && m) v = m[1] == null ? true : +m[1];
    return v == null || v === false ? null : v === true ? 'end' : +v; })(global.TRAZO_STATIC, /[?&]static(?:=(\d+))?(?:&|$)/.exec(global.location ? global.location.search : ''));
  var CSS = '.slide aside.notes{display:none!important}.ed-print{display:none}' +
    'html.ed-presenter #viewport{right:38%!important;bottom:calc(52px + 34vh)!important}' +
    '.ed-pv{display:none;font-family:var(--sans,system-ui,sans-serif);color:var(--ink,#1a1a1a)}' +
    'html.ed-presenter .ed-pv{display:block}' +
    '.ed-pv-side{position:fixed;top:12px;right:16px;width:calc(38% - 28px);bottom:64px;display:flex;flex-direction:column;gap:10px;min-height:0}' +
    '.ed-pv-notes{position:fixed;left:16px;right:38%;bottom:64px;height:calc(34vh - 20px);overflow:auto;background:var(--slide,#fff);border:1px solid var(--rule,#ccc);border-radius:10px;padding:12px 16px}' +
    '.ed-pv-h{font-family:var(--mono,monospace);font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#666)}' +
    '.ed-pv-cap{font-size:15px;line-height:1.4;color:var(--ink2,var(--ink,#333))}' +
    '.ed-pv-next{position:relative;width:100%;aspect-ratio:16/9;overflow:hidden;border:1px solid var(--rule,#ccc);border-radius:8px;background:var(--bg,#eee);flex:none}' +
    '.ed-pv-next-in{position:absolute;left:0;top:0;width:1600px;height:900px;transform-origin:0 0}' +
    '.ed-pv-next-in .slide{visibility:visible!important;opacity:1!important;transform:none!important}' +
    '.ed-pv-end{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--mono,monospace);font-size:64px;color:var(--muted,#666)}' +
    '.ed-pv-time{margin-top:auto;display:flex;align-items:baseline;gap:14px;font-family:var(--mono,monospace);color:var(--muted,#666)}' +
    '.ed-pv-time b{font-size:44px;font-weight:600;color:var(--ink,#1a1a1a);font-variant-numeric:tabular-nums}' +
    '.ed-pv-time button{font:inherit;font-size:13px;color:var(--ink,#1a1a1a);background:var(--slide,#fff);border:1px solid var(--rule,#ccc);border-radius:999px;padding:4px 12px;cursor:pointer}' +
    '.ed-pv-text{font-size:19px;line-height:1.5;margin-top:6px}.ed-pv-text p{margin:0 0 .6em}' +
    '.ed-pv-text ol,.ed-pv-text ul{margin:0;padding-left:1.4em}.ed-pv-text li{margin:0 0 .4em}' +
    '.ed-pv-text [data-step],.ed-pv-text ol li{color:var(--muted,#666)}' +
    '.ed-pv-text .cur,.ed-pv-text ol li.cur{color:var(--ink,#1a1a1a);font-weight:600}.ed-pv-text .cur::marker{color:var(--accent,#36c)}' +
    '.ed-pv-none{color:var(--muted,#666);font-style:italic}' +
    '@media print{@page{size:1600px 900px;margin:0}' +
    'html,body{height:auto!important;overflow:visible!important;margin:0!important;padding:0!important;background:var(--slide,#fff)!important;-webkit-print-color-adjust:exact;print-color-adjust:exact}' +
    '#viewport{position:absolute!important;left:0!important;top:0!important;right:auto!important;bottom:auto!important;width:0!important;height:0!important;overflow:hidden!important}' +
    '.ed-bar,.ed-pv{display:none!important}.ed-print{display:block!important}' +
    '.ed-print .slide{position:relative!important;inset:auto!important;width:1600px!important;height:900px!important;margin:0!important;' +
    'visibility:visible!important;opacity:1!important;transform:none!important;border-radius:0!important;break-inside:avoid;break-after:page}' +
    '.ed-print .slide:last-child{break-after:auto}}';

  function run(opt) {
    opt = opt || {};
    var BUILDS = opt.builds || {}, LIB = opt.lib || {}, NOTES = opt.notes || {};
    var stage = document.getElementById('stage'), vp = document.getElementById('viewport');
    var slides = [].slice.call(document.querySelectorAll('.slide'));
    var reduce = frozen != null || (global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);
    var G = global.gsap, root = document.documentElement;

    if (!document.getElementById('ed-deck-css')) {
      var st = document.createElement('style'); st.id = 'ed-deck-css'; st.textContent = CSS;
      document.head.appendChild(st);
    }
    if (opt.icons && !document.getElementById('ed-icons')) {
      var h = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      h.id = 'ed-icons'; h.setAttribute('aria-hidden', 'true');
      h.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      h.innerHTML = '<defs>' + opt.icons + '</defs>';
      document.body.insertBefore(h, document.body.firstChild);
    }
    document.getElementById('b-next').parentNode.classList.add('ed-bar');   // hidden in print

    var cur = 0, step = 0, tls = [], blanked = false, presenting = false, pv = null;
    /* a screen reader hears each change of slide and step: slides are named groups, and a live region
       reads the slide's name and the step's caption (run({live: false}) leaves it out) */
    var live = null, told = -1;
    if (opt.live !== false) {
      live = document.createElement('div'); live.className = 'ed-live'; live.setAttribute('aria-live', 'polite');
      live.style.cssText = 'position:absolute;width:1px;height:1px;margin:-1px;padding:0;border:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap';
      document.body.appendChild(live);
    }
    slides.forEach(function (s, i) {
      if (!s.getAttribute('role')) s.setAttribute('role', 'group');
      if (s.getAttribute('role') === 'group') s.setAttribute('aria-roledescription', 'slide');
      if (!s.getAttribute('aria-label') && !s.getAttribute('aria-labelledby')) {
        var hd = s.querySelector('h1, h2, h3'); s.setAttribute('aria-label', hd ? hd.textContent.replace(/\s+/g, ' ').trim() : 'Slide ' + (i + 1));
      }
    });
    function tell() {
      if (!live) return;
      if (quiet) { told = cur; return; }   // not the first slide shown, nor a move made in another window
      var s = slides[cur], li = s.querySelectorAll('.caps li')[step], cap = li ? li.textContent.replace(/\s+/g, ' ').trim() : '';
      var head = told !== cur ? 'Slide ' + (cur + 1) + ' of ' + slides.length + ': ' + (s.getAttribute('aria-label') || '') + '.'
        : cap ? '' : 'Step ' + (step + 1) + ' of ' + (steps(cur) + 1) + '.';
      live.textContent = (head + ' ' + cap).trim(); told = cur;
    }
    /* fit the 1600x900 stage into the viewport, and the next slide into its frame */
    function fit() {
      var s = Math.min((vp.clientWidth - 24) / 1600, (vp.clientHeight - 24) / 900);
      stage.style.transform = 'translate(-50%,-50%) scale(' + Math.max(s, .1) + ')';
      if (pv) pv.nextIn.style.transform = 'scale(' + (pv.next.clientWidth / 1600) + ')';
    }
    global.addEventListener('resize', fit);

    function steps(i) { return +slides[i].dataset.steps || 0; }
    function tlFor(i) {
      if (tls[i] !== undefined) return tls[i];
      var b = slides[i].dataset.build;
      if (!G) { if (b && LIB[b]) { try { BUILDS[b](slides[i]); } catch (e) {} } tls[i] = null; return null; }
      tls[i] = (b && BUILDS[b]) ? BUILDS[b](slides[i]) : null; return tls[i];
    }
    // the captions and dots of slide i at step k; el, a still copy of the slide, gets them without motion
    function paintStep(i, k, el) {
      var s = el || slides[i], caps = s.querySelectorAll('.caps li');
      caps.forEach(function (li, j) { li.classList.toggle('cur', j === k); if (j !== k || el) { if (G) G.killTweensOf(li); li.style.opacity = ''; li.style.transform = ''; } });
      if (G && caps[k] && !reduce && !el) G.fromTo(caps[k], {opacity: 0, y: 10}, {opacity: 1, y: 0, duration: .35, overwrite: true});
      var dots = s.querySelector('.stepdots');
      if (dots) {
        if (!dots.children.length) { for (var d = 0; d <= steps(i); d++) dots.appendChild(document.createElement('i')); }
        [].forEach.call(dots.children, function (e, j) { e.classList.toggle('on', j <= k); });
      }
    }
    function seekStep(i, k, animate) {
      var tl = tlFor(i); if (!tl) return;
      var lab = 's' + k;
      if (!animate || reduce) tl.pause().seek(lab, false); else tl.tweenTo(lab);
      if (tl.onStep) tl.onStep(k);
    }
    /* a still copy of slide i at step k, for the next-slide preview and the printed pages; its packets
       are stopped first, so none is frozen on a wire (show() starts them again) */
    function still(i, k) {
      seekStep(i, k, false);
      var tl = tls[i]; if (tl && tl.onStep) tl.onStep(-1);
      var c = slides[i].cloneNode(true);
      c.classList.add('on'); c.style.opacity = ''; c.style.transform = ''; c.style.visibility = '';
      c.removeAttribute('aria-label'); paintStep(i, k, c);
      // ids of its own, so its arrowheads and gradients are its own: the original's lie in a hidden slide
      var ids = {}, n = '-c' + (++stills);
      [].forEach.call(c.querySelectorAll('[id]'), function (e) { ids[e.id] = e.id + n; e.id += n; });
      [].forEach.call(c.querySelectorAll('*'), function (e) {
        [].forEach.call(e.attributes, function (a) {
          if (a.value.indexOf('#') < 0) return;
          var v = a.value.replace(/url\(\s*["']?#([^"')\s]+)["']?\s*\)/g, function (m, id) { return ids[id] ? 'url(#' + ids[id] + ')' : m; });
          if (/href$/.test(a.name) && v.charAt(0) === '#' && ids[v.slice(1)]) v = '#' + ids[v.slice(1)];
          if (v !== a.value) e.setAttribute(a.name, v);
        });
      });
      return c;
    }
    var stills = 0;
    function where() { return presenting && pwOwn ? '#presenter' : '#' + (cur + 1); }
    function hud() {
      document.getElementById('count').textContent = (cur + 1) + ' / ' + slides.length;
      var total = 0, done = 0; slides.forEach(function (s, i) { total += steps(i) + 1; if (i < cur) done += steps(i) + 1; }); done += step + 1;
      document.getElementById('prog').style.width = (100 * done / total) + '%';
      try { history.replaceState(null, '', where()); } catch (e) {}
      if (presenting) paintPresenter();
      tell(); post();
    }
    function show(i, k, dir) {
      var from = slides[cur], to = slides[i];
      if (global.EdgeDiagram && global.EdgeDiagram.clearAll) global.EdgeDiagram.clearAll();
      if (global.EdgeTimeline) global.EdgeTimeline.clearAll();
      if (from !== to) {
        var ftl = tls[cur]; if (ftl && ftl.onStep) ftl.onStep(-1);
        from.classList.remove('on'); to.classList.add('on');
        if (G && !reduce) G.fromTo(to, {opacity: 0, x: 40 * (dir || 1)}, {opacity: 1, x: 0, duration: .45, ease: 'power2.out', clearProps: 'transform'});
      }
      cur = i; step = k;
      seekStep(i, k, false); paintStep(i, k); hud();
    }
    function next() {
      if (step < steps(cur)) { step++; seekStep(cur, step, true); paintStep(cur, step); hud(); }
      else if (cur < slides.length - 1) show(cur + 1, 0, 1);
    }
    function prev() {
      if (step > 0) {
        step--; var tl = tlFor(cur);
        if (tl) { reduce ? tl.seek('s' + step, false) : tl.tweenTo('s' + step, {duration: .35}); if (tl.onStep) tl.onStep(step); }
        paintStep(cur, step); hud();
      } else if (cur > 0) show(cur - 1, steps(cur - 1), -1);
    }

    /* input */
    function nextSlide() { if (cur < slides.length - 1) show(cur + 1, 0, 1); else show(cur, steps(cur), 1); }
    function prevSlide() { if (step > 0) show(cur, 0, -1); else if (cur > 0) show(cur - 1, 0, -1); }
    function go(n) { show(Math.max(0, Math.min(slides.length - 1, n - 1)), 0, n - 1 < cur ? -1 : 1); }
    function full() {
      var d = document, el = d.documentElement;
      var p = d.fullscreenElement ? d.exitFullscreen && d.exitFullscreen() : el.requestFullscreen && el.requestFullscreen();
      if (p && p.catch) p.catch(function () {});
    }
    // the presenter view keeps its slide in sight, dimmed, while the room's screen is blank
    function blank(on) {
      blanked = on == null ? !blanked : !!on;
      stage.style.visibility = blanked && !presenting ? 'hidden' : '';
      stage.style.opacity = blanked && presenting ? '.3' : '';
      post();
    }

    /* keys: a keyboard's and a presenter's clicker's. Enter and space on a focused button, link or diagram
       item are left to it, so one press never acts twice; keys with Ctrl, Alt or Cmd are the browser's. */
    var FWD = {ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1, j: 1, J: 1};
    var BACK = {ArrowLeft: 1, ArrowUp: 1, PageUp: 1, Backspace: 1, p: 1, P: 1, k: 1, K: 1};
    var typed = '', typedT = 0;
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, k = e.key;
      if (t.closest && t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')) return;
      if ((k === 'Enter' || k === ' ') && t.closest && t.closest('button,a[href],[role=button],.ed-node[tabindex],.ed-link[tabindex]')) return;
      if (/^[0-9]$/.test(k)) { typed = (typed + k).slice(-3); clearTimeout(typedT); typedT = setTimeout(function () { typed = ''; }, 2000); return; }
      if (k === 'Enter' && typed) { e.preventDefault(); go(+typed); typed = ''; return; }   // a number, then Enter: that slide
      if (blanked && (FWD[k] || BACK[k] || k === 'Escape')) { e.preventDefault(); blank(false); return; }
      if (FWD[k] || BACK[k]) {
        e.preventDefault();
        if (e.shiftKey && k === ' ') prev();
        else if (e.shiftKey) (FWD[k] ? nextSlide : prevSlide)();   // Shift: a whole slide, past its steps
        else (FWD[k] ? next : prev)();
      }
      else if (k === 'Home') { e.preventDefault(); show(0, 0, -1); }
      else if (k === 'End') { e.preventDefault(); show(slides.length - 1, steps(slides.length - 1), 1); }
      else if (k === 'f' || k === 'F') full();
      else if (k === 'n' || k === 'N') { e.preventDefault(); presenter(); }
      else if (k === 'b' || k === 'B' || k === '.' || k === 'w' || k === 'W') blank();   // a clicker's blank-screen key
    });
    // a click on a diagram node pins its detail; anywhere else it turns the page, except the click that
    // only brings the page into focus (an embedded deck, an artifact): that one just lets the keys work
    var focusing = false;
    vp.addEventListener('pointerdown', function () { focusing = !document.hasFocus(); }, true);
    vp.addEventListener('click', function (e) {
      if (focusing) { focusing = false; return; }
      if (e.target.closest('a,button,.ed-node[tabindex],.ed-link[tabindex]')) return;
      var r = vp.getBoundingClientRect(); (e.clientX - r.left < r.width * 0.3) ? prev() : next();
    });
    var tx = null;
    vp.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, {passive: true});
    vp.addEventListener('touchend', function (e) { if (tx === null) return; var dx = e.changedTouches[0].clientX - tx; if (Math.abs(dx) > 40) { dx < 0 ? next() : prev(); } tx = null; });
    document.getElementById('b-next').addEventListener('click', next);
    document.getElementById('b-prev').addEventListener('click', prev);
    document.getElementById('b-full').addEventListener('click', full);
    var bn = document.getElementById('b-notes'); if (bn) bn.addEventListener('click', function () { presenter(); });
    try { global.focus(); } catch (e) {}

    /* sync: every window of this deck follows the one that moved. A message carries its sender and a
       count, so the copy that arrives the other way (channel and postMessage) is dropped. */
    var me = Math.random().toString(36).slice(2), seq = 0, seen = {}, quiet = true, pwin = null, bc = null;
    var key = 'edgedeck:' + location.pathname;
    function send(m) {
      m.ed = key; m.from = me; m.seq = ++seq;
      if (bc) { try { bc.postMessage(m); } catch (e) {} }
      [pwin, global.opener].forEach(function (w) { if (w && w !== global && !w.closed) { try { w.postMessage(m, '*'); } catch (e) {} } });
    }
    function state() { return {type: 'state', slide: cur, step: step, blank: blanked}; }
    function post() { if (!quiet) send(state()); }
    function recv(m) {
      if (!m || m.ed !== key || m.from === me || seen[m.from] >= m.seq) return;
      seen[m.from] = m.seq;
      if (m.type === 'hello') { send(state()); return; }   // a new window asks where the deck is
      if (m.type !== 'state' || !slides[m.slide]) return;
      quiet = true;
      try {
        if (m.slide === cur && m.step === step + 1) next();
        else if (m.slide === cur && m.step === step - 1) prev();
        else if (m.slide !== cur || m.step !== step) show(m.slide, Math.max(0, Math.min(steps(m.slide), m.step)), m.slide < cur ? -1 : 1);
        if (!!m.blank !== blanked) blank(m.blank);
      } finally { quiet = false; }
    }
    try { bc = new BroadcastChannel(key); bc.onmessage = function (e) { recv(e.data); }; } catch (e) { bc = null; }
    global.addEventListener('message', function (e) { if (e.source && (e.source === pwin || e.source === global.opener)) recv(e.data); });

    /* the presenter view: in a window of its own (#presenter), else in this one */
    var pwOwn = false, t0 = 0, tick = 0, pvSlide = -1;
    function presenter(on) {
      if (on != null) return setPresenting(on);
      if (presenting) return setPresenting(false);
      if (pwin && !pwin.closed) { try { pwin.focus(); } catch (e) {} return true; }
      var w = null;
      try { w = global.open(location.href.split('#')[0] + '#presenter', 'edgedeck-presenter', 'popup,width=1280,height=760'); } catch (e) {}
      if (w) { pwin = w; return true; }
      return setPresenting(true);   // popups blocked (an artifact's frame): the view takes this window
    }
    function setPresenting(on) {
      presenting = !!on; root.classList.toggle('ed-presenter', presenting);
      if (presenting && !pv) {
        var d = document.createElement('div'); d.className = 'ed-pv'; d.setAttribute('aria-label', 'Presenter view');
        d.innerHTML = '<div class="ed-pv-side"><div class="ed-pv-h">Next</div><div class="ed-pv-cap"></div>' +
          '<div class="ed-pv-next" aria-hidden="true"><div class="ed-pv-next-in"></div></div>' +
          '<div class="ed-pv-time"><b>0:00</b><span></span><button type="button">Reset</button></div></div>' +
          '<div class="ed-pv-notes"><div class="ed-pv-h"></div><div class="ed-pv-text"></div></div>';
        document.body.appendChild(d);
        pv = {el: d, cap: d.querySelector('.ed-pv-cap'), next: d.querySelector('.ed-pv-next'), nextIn: d.querySelector('.ed-pv-next-in'),
          where: d.querySelector('.ed-pv-notes .ed-pv-h'), text: d.querySelector('.ed-pv-text'),
          time: d.querySelector('.ed-pv-time b'), clock: d.querySelector('.ed-pv-time span')};
        d.querySelector('.ed-pv-time button').addEventListener('click', function () { t0 = Date.now(); clock(); });
      }
      clearInterval(tick);
      if (presenting) { t0 = Date.now(); tick = setInterval(clock, 1000); clock(); pvSlide = -1; paintPresenter(); }
      var q = quiet; quiet = true; blank(blanked); quiet = q;
      fit();
      try { history.replaceState(null, '', where()); } catch (e) {}
      return presenting;
    }
    function clock() {
      var s = Math.floor((Date.now() - t0) / 1000), m = Math.floor(s / 60), p2 = function (n) { return (n < 10 ? '0' : '') + n; };
      pv.time.textContent = (m >= 60 ? Math.floor(m / 60) + ':' + p2(m % 60) : m) + ':' + p2(s % 60);
      var now = new Date(); pv.clock.textContent = p2(now.getHours()) + ':' + p2(now.getMinutes());
    }
    // a slide's notes: its <aside class="notes"> (an element with data-step="k" is marked at step k), else
    // opt.notes[slide number or build name], or the build's own .notes; a list there is one item per step
    function notesHTML(i, k) {
      var s = slides[i], b = s.dataset.build, a = s.querySelector('aside.notes');
      if (a) {
        var c = a.cloneNode(true);
        [].forEach.call(c.querySelectorAll('[data-step]'), function (e) { e.classList.toggle('cur', +e.dataset.step === k); });
        return c.innerHTML.trim();
      }
      var n = NOTES[i + 1] || (b && NOTES[b]) || (b && BUILDS[b] && BUILDS[b].notes);
      if (n && n.join) return '<ol>' + n.map(function (t, j) { return '<li' + (j === k ? ' class="cur"' : '') + '>' + t + '</li>'; }).join('') + '</ol>';
      return n ? '<p>' + n + '</p>' : '';
    }
    function paintPresenter() {
      pv.where.textContent = 'Notes · slide ' + (cur + 1) + ' / ' + slides.length + (steps(cur) ? ' · step ' + (step + 1) + ' / ' + (steps(cur) + 1) : '');
      pv.text.innerHTML = notesHTML(cur, step) || '<p class="ed-pv-none">No notes for this slide.</p>';
      var caps = slides[cur].querySelectorAll('.caps li');
      pv.cap.textContent = step < steps(cur) ? 'Next step: ' + (caps[step + 1] ? caps[step + 1].textContent : (step + 2) + ' / ' + (steps(cur) + 1))
        : cur < slides.length - 1 ? 'Slide ' + (cur + 2) + ' / ' + slides.length : 'The last slide';
      if (pvSlide !== cur) {
        pvSlide = cur; pv.nextIn.innerHTML = '';
        if (cur < slides.length - 1) pv.nextIn.appendChild(still(cur + 1, 0));
        else pv.nextIn.innerHTML = '<div class="ed-pv-end">End</div>';
        fit();
      }
    }

    /* print: a still copy of every slide at its last step (o.steps: at every step), in o.theme;
       printPages(false) takes them away and puts the deck back where it was */
    var printed = null;
    function printPages(o) {
      var box = document.getElementById('ed-print');
      if (box) box.parentNode.removeChild(box);
      if (printed) {
        if (printed.theme === null) root.removeAttribute('data-theme'); else if (printed.theme !== undefined) root.setAttribute('data-theme', printed.theme);
        printed = null;
        var q = quiet; quiet = true; show(cur, step, 1); quiet = q;
      }
      if (o === false) return 0;
      o = o || {}; printed = {};
      if (o.theme && o.theme !== 'page') { printed.theme = root.getAttribute('data-theme'); root.setAttribute('data-theme', o.theme); }
      box = document.createElement('div'); box.id = 'ed-print'; box.className = 'ed-print'; box.setAttribute('aria-hidden', 'true');
      slides.forEach(function (s, i) {
        for (var k = o.steps ? 0 : steps(i); k <= steps(i); k++) box.appendChild(still(i, k));
      });
      document.body.appendChild(box);
      return box.children.length;
    }
    var autoPrint = false;
    global.addEventListener('beforeprint', function () { if (!printed) { autoPrint = true; printPages({theme: opt.printTheme || 'light'}); } });
    global.addEventListener('afterprint', function () { if (autoPrint) { autoPrint = false; printPages(false); } });

    if (global.ED_DEBUG) slides.forEach(function (s, i) { tlFor(i); });

    /* start: the slide from a bare #n anchor, else the title. #presenter is a presenter window; every
       new window asks the others where the deck is */
    var hash = location.hash || '', start = parseInt(hash.replace('#', ''), 10);
    slides[0].classList.add('on');
    start = isNaN(start) ? 0 : Math.max(0, Math.min(slides.length - 1, start - 1));
    show(start, frozen == null ? 0 : frozen === 'end' ? steps(start) : Math.min(frozen, steps(start)), 1);
    fit();
    if (/^#presenter/.test(hash)) { pwOwn = true; setPresenting(true); }
    quiet = false;
    send({type: 'hello'});
    if (global.ED_PRINT) {
      var ready = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
      ready.then(function () { printPages({steps: global.ED_PRINT.steps, theme: global.ED_PRINT.theme || opt.printTheme || 'light'}); });
    }
    return {next: next, prev: prev, show: show, go: go, nextSlide: nextSlide, prevSlide: prevSlide,
      presenter: presenter, printPages: printPages,
      notes: function (i, k) { i = i == null ? cur : i; return notesHTML(i, k == null ? (i === cur ? step : 0) : k); },
      state: function () { return {slide: cur, step: step, blank: blanked, presenter: presenting}; }};
  }
  global.EdgeDeck = {run: run, version: '1.5.0'};
})(window);
