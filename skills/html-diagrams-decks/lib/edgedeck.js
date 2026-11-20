/* EdgeDeck v1.2.0 — a 1600x900 slide engine for single-file HTML decks.
 *
 *   EdgeDeck.run({builds: BUILDS, lib: {name: 1, ...}, icons: window.EDGE_ICONS});
 *
 * The page provides a 1600x900 #stage inside #viewport, its slides as <section class="slide"
 * data-steps="N" data-build="name">, each with an optional <ol class="caps"> (one <li> per step)
 * and <div class="stepdots">, and a control bar with #b-prev, #b-next, #b-full, #prog and #count.
 * builds[name](slide) returns a paused GSAP timeline whose labels s0..sN are the state after step N
 * (tl.onStep(k) is called on every step, with -1 when the slide is left), or null. Without GSAP the
 * builds named in lib still run once, to draw their final state. With icons, the sprite is injected
 * once as #ed-icons, which EdgeDiagram then reuses. Keys: right, down, PageDown, space, Enter, N, J
 * forward; left, up, PageUp, Backspace, Shift+space, P, K back; with Shift a whole slide; Home/End;
 * a number then Enter to go to that slide; F fullscreen; B, W or . blanks the screen (a clicker's
 * key). A click (left 30% back), a swipe; a bare #n in the address opens slide n. Changing slide releases
 * any pinned tooltip. With window.ED_DEBUG every slide is built at the start, so EdgeDiagram's
 * check covers the whole deck.
 */
(function (global) {
  'use strict';
  function run(opt) {
    opt = opt || {};
    var BUILDS = opt.builds || {}, LIB = opt.lib || {};
    var stage = document.getElementById('stage'), vp = document.getElementById('viewport');
    var slides = [].slice.call(document.querySelectorAll('.slide'));
    var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var G = global.gsap;

    if (opt.icons && !document.getElementById('ed-icons')) {
      var h = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      h.id = 'ed-icons'; h.setAttribute('aria-hidden', 'true');
      h.setAttribute('style', 'position:absolute;width:0;height:0;overflow:hidden');
      h.innerHTML = '<defs>' + opt.icons + '</defs>';
      document.body.insertBefore(h, document.body.firstChild);
    }

    /* fit the 1600x900 stage into the viewport */
    function fit() { var s = Math.min((vp.clientWidth - 24) / 1600, (vp.clientHeight - 24) / 900); stage.style.transform = 'translate(-50%,-50%) scale(' + Math.max(s, .1) + ')'; }
    global.addEventListener('resize', fit); fit();

    var cur = 0, step = 0, tls = [];
    function steps(i) { return +slides[i].dataset.steps || 0; }
    function tlFor(i) {
      if (tls[i] !== undefined) return tls[i];
      var b = slides[i].dataset.build;
      if (!G) { if (b && LIB[b]) { try { BUILDS[b](slides[i]); } catch (e) {} } tls[i] = null; return null; }
      tls[i] = (b && BUILDS[b]) ? BUILDS[b](slides[i]) : null; return tls[i];
    }
    function paintStep(i, k) {
      var caps = slides[i].querySelectorAll('.caps li');
      caps.forEach(function (li, j) { li.classList.toggle('cur', j === k); if (j !== k) { if (G) G.killTweensOf(li); li.style.opacity = ''; li.style.transform = ''; } });
      if (G && caps[k] && !reduce) G.fromTo(caps[k], {opacity: 0, y: 10}, {opacity: 1, y: 0, duration: .35, overwrite: true});
      var dots = slides[i].querySelector('.stepdots');
      if (dots) {
        if (!dots.children.length) { for (var d = 0; d <= steps(i); d++) dots.appendChild(document.createElement('i')); }
        [].forEach.call(dots.children, function (el, j) { el.classList.toggle('on', j <= k); });
      }
    }
    function seekStep(i, k, animate) {
      var tl = tlFor(i); if (!tl) return;
      var lab = 's' + k;
      if (!animate || reduce) tl.pause().seek(lab, false); else tl.tweenTo(lab);
      if (tl.onStep) tl.onStep(k);
    }
    function hud() {
      document.getElementById('count').textContent = (cur + 1) + ' / ' + slides.length;
      var total = 0, done = 0; slides.forEach(function (s, i) { total += steps(i) + 1; if (i < cur) done += steps(i) + 1; }); done += step + 1;
      document.getElementById('prog').style.width = (100 * done / total) + '%';
      try { history.replaceState(null, '', '#' + (cur + 1)); } catch (e) {}
    }
    function show(i, k, dir) {
      var from = slides[cur], to = slides[i];
      if (global.EdgeDiagram && global.EdgeDiagram.clearAll) global.EdgeDiagram.clearAll();
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
    function blank(on) { stage.style.visibility = (on == null ? stage.style.visibility !== 'hidden' : on) ? 'hidden' : ''; }

    /* keys: a keyboard's and a presenter's clicker's. Enter and space on a focused button, link or diagram
       item are left to it, so one press never acts twice; keys with Ctrl, Alt or Cmd are the browser's. */
    var FWD = {ArrowRight: 1, ArrowDown: 1, PageDown: 1, ' ': 1, Enter: 1, n: 1, N: 1, j: 1, J: 1};
    var BACK = {ArrowLeft: 1, ArrowUp: 1, PageUp: 1, Backspace: 1, p: 1, P: 1, k: 1, K: 1};
    var typed = '', typedT = 0;
    document.addEventListener('keydown', function (e) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
      var t = e.target, k = e.key;
      if (t.closest && t.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')) return;
      if ((k === 'Enter' || k === ' ') && t.closest && t.closest('button,a[href],[role=button],.ed-node[tabindex],.ed-link[tabindex]')) return;
      if (/^[0-9]$/.test(k)) { typed = (typed + k).slice(-3); clearTimeout(typedT); typedT = setTimeout(function () { typed = ''; }, 2000); return; }
      if (k === 'Enter' && typed) { e.preventDefault(); go(+typed); typed = ''; return; }   // a number, then Enter: that slide
      if (stage.style.visibility === 'hidden' && (FWD[k] || BACK[k] || k === 'Escape')) { e.preventDefault(); blank(false); return; }
      if (FWD[k] || BACK[k]) {
        e.preventDefault();
        if (e.shiftKey && k === ' ') prev();
        else if (e.shiftKey) (FWD[k] ? nextSlide : prevSlide)();   // Shift: a whole slide, past its steps
        else (FWD[k] ? next : prev)();
      }
      else if (k === 'Home') { e.preventDefault(); show(0, 0, -1); }
      else if (k === 'End') { e.preventDefault(); show(slides.length - 1, steps(slides.length - 1), 1); }
      else if (k === 'f' || k === 'F') full();
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
    try { global.focus(); } catch (e) {}

    if (global.ED_DEBUG) slides.forEach(function (s, i) { tlFor(i); });

    /* start: the slide from a bare #n anchor, else the title */
    var start = parseInt((location.hash || '').replace('#', ''), 10);
    slides[0].classList.add('on');
    show(isNaN(start) ? 0 : Math.max(0, Math.min(slides.length - 1, start - 1)), 0, 1);
    return {next: next, prev: prev, show: show, go: go, nextSlide: nextSlide, prevSlide: prevSlide,
      state: function () { return {slide: cur, step: step, blank: stage.style.visibility === 'hidden'}; }};
  }
  global.EdgeDeck = {run: run, version: '1.2.0'};
})(window);
