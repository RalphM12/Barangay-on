/* ============================================================================
   BARANGAY-ON · LIQUID GLASS behaviour  (dashboards + inner pages)
   Pure progressive enhancement: with this file missing everything still works,
   the page just loses the motion. Companion of assets/css/glass.css.

     1. pointer-following specular light on glass cards
     2. click ripple on buttons
     3. staggered entrance of cards / tiles / rows (also for rows the page renders later)
     4. sliding "lens" behind the active + hovered sidebar item
     5. segmented controls with a sliding thumb (Settings > Appearance ...)
     6. count-up on the big numbers
     7. cross-fade when the theme changes
     8. topbar gets a deeper shadow once the page is scrolled
   ============================================================================ */
(function () {
  'use strict';
  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame.bind(window);

  /* ------------------------------------------------------------------ 2. ripple */
  var BTN = '.btn-primary, .btn-light, .btn-danger, .btn-ok, .btn-sm, .btn-xs, .pager button, .view-btn';
  document.addEventListener('pointerdown', function (e) {
    if (reduce || e.button > 0) return;
    var b = e.target.closest ? e.target.closest(BTN) : null;
    if (!b || b.disabled) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    var s = document.createElement('span');
    s.className = 'g-ripple';
    s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    if (getComputedStyle(b).position === 'static') b.style.position = 'relative';
    b.appendChild(s);
    setTimeout(function () { s.remove(); }, 750);
  }, { passive: true });

  /* ------------------------------------------------------------------ 3. entrances */
  var BLOCKS = '.page-head, .banner, .stat, .q, .svc, .card, .mini-stats .m, .notif-card, .set-panel, .acc-card';
  var ROWS = 'tbody tr, .notif-list li, .ann-list li, .notifs li, .acc-activity li';
  function enter(el, i, cap) {
    if (reduce || el.__g) return;
    el.__g = 1;
    el.style.setProperty('--i', Math.min(i, cap));
    el.classList.add('g-in');
    var done = function (ev) {
      if (ev && ev.target !== el) return;
      el.classList.remove('g-in'); el.style.removeProperty('--i');
      el.removeEventListener('animationend', done);
    };
    el.addEventListener('animationend', done);
    setTimeout(done, 1800);              // safety net
  }
  function tagBlocks(scope) {
    var list = scope.querySelectorAll(BLOCKS), k = 0;
    for (var n = 0; n < list.length; n++) {
      // nested blocks (a .card inside a .card) ride along with their parent
      if (list[n].parentElement.closest(BLOCKS)) { list[n].__g = 1; continue; }
      enter(list[n], k++, 12);
    }
  }
  function tagRows(scope) {
    var groups = scope.querySelectorAll('tbody, ul, ol'), n, rows, j;
    for (n = 0; n < groups.length; n++) {
      rows = groups[n].querySelectorAll(':scope > tr, :scope > li');
      for (j = 0; j < rows.length; j++) if (rows[j].matches(ROWS)) enter(rows[j], j, 14);
    }
  }

  /* ------------------------------------------------------------------ 4. sidebar lens */
  function initLens() {
    var sb = document.querySelector('.sidebar'), nav = sb && sb.querySelector('nav');
    if (!nav) return;
    var act = document.createElement('span'); act.className = 'lens';
    var hov = document.createElement('span'); hov.className = 'lens hover';
    nav.insertBefore(hov, nav.firstChild); nav.insertBefore(act, nav.firstChild);
    sb.classList.add('has-lens');

    function box(a) {
      var n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
      return { x: r.left - n.left, y: r.top - n.top + nav.scrollTop, w: r.width, h: r.height };
    }
    function put(l, b, instant) {
      if (instant) l.style.transition = 'none';
      l.style.width = b.w + 'px'; l.style.height = b.h + 'px';
      l.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
      if (instant) { void l.offsetWidth; l.style.transition = ''; }
    }
    function current() { return nav.querySelector('.nav-sub a.active') || nav.querySelector(':scope > a.active'); }
    function place(instant) {
      var a = current();
      if (!a || !a.offsetParent) { act.classList.remove('on'); return; }
      put(act, box(a), instant); if (!act.classList.contains('on')) act.classList.add('on');
    }

    // start where the previous page's lens ended, then glide to the new item
    var prev = null;
    try { prev = JSON.parse(sessionStorage.getItem('g-lens') || 'null'); } catch (e) { /* private mode */ }
    var a0 = current();
    if (a0 && prev && !reduce && typeof prev.y === 'number') {
      put(act, { x: prev.x, y: prev.y, w: prev.w, h: prev.h }, true); act.classList.add('on');
      raf(function () { raf(function () { place(false); }); });
    } else {
      place(true);
    }
    function save() {
      var a = current();
      if (!a) return;
      try { sessionStorage.setItem('g-lens', JSON.stringify(box(a))); } catch (e) { /* ignore */ }
    }
    window.addEventListener('pagehide', save);
    document.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('.sidebar a')) save(); }, true);

    // hover lens
    nav.addEventListener('pointerover', function (e) {
      var a = e.target.closest && e.target.closest('a, .nav-parent');
      if (!a || !nav.contains(a) || a === current()) { hov.classList.remove('on'); return; }
      var first = !hov.classList.contains('on');
      put(hov, box(a), first); hov.classList.add('on');
    });
    nav.addEventListener('pointerleave', function () { hov.classList.remove('on'); });

    // the Settings group expands / collapses: re-seat the lens while it animates
    nav.addEventListener('transitionend', function (e) { if (/grid-template-rows|height/.test(e.propertyName)) place(false); });
    nav.addEventListener('click', function (e) {
      if (!(e.target.closest && e.target.closest('.nav-parent'))) return;
      var t0 = performance.now();
      (function tick(t) { place(true); if (t - t0 < 520) raf(tick); })(t0);
    });
    window.addEventListener('resize', function () { place(true); });
    // sidebar slides in from the left when opened: seat again once it has settled
    new MutationObserver(function () { setTimeout(function () { place(true); }, 650); })
      .observe(root, { attributes: true, attributeFilter: ['data-sidebar'] });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(true); });
    window.addEventListener('load', function () { place(true); });
  }

  /* ------------------------------------------------------------------ 5. segmented control */
  var segs = [];
  function initSeg(seg) {
    if (seg.__thumb) return;
    var thumb = document.createElement('i'); thumb.className = 'seg-thumb';
    seg.insertBefore(thumb, seg.firstChild);
    seg.classList.add('has-thumb', 'no-anim');
    seg.__thumb = thumb; seg.__at = null; segs.push(seg);
    seg.addEventListener('change', function () { syncSeg(seg, true); });
    syncSeg(seg, false);
    raf(function () { seg.classList.remove('no-anim'); });
  }
  function syncSeg(seg, animate) {
    var on = seg.querySelector('input:checked'), label = on && on.closest('label');
    if (!label || !label.offsetWidth) { seg.__thumb.style.width = '0'; return; }
    var key = label.offsetLeft + ':' + label.offsetWidth;
    if (key === seg.__at) return;
    seg.__at = key;
    if (!animate) seg.classList.add('no-anim');
    seg.__thumb.style.width = label.offsetWidth + 'px';
    seg.__thumb.style.transform = 'translateX(' + label.offsetLeft + 'px)';
    if (!animate) { void seg.offsetWidth; raf(function () { seg.classList.remove('no-anim'); }); }
  }
  // settings.js ticks the saved value in after it has fetched it (no change event): keep thumbs in step
  setInterval(function () { for (var i = 0; i < segs.length; i++) syncSeg(segs[i], true); }, 300);
  window.addEventListener('resize', function () { segs.forEach(function (s) { s.__at = null; syncSeg(s, false); }); });

  /* ------------------------------------------------------------------ 6. count-up */
  var NUM = '.stat strong, .mini-stats .m strong';
  function countUp(el) {
    var txt = el.textContent;
    if (txt === el.__last || !/^\s*[\d,]+\s*$/.test(txt)) return;      // our own write, or not a plain number
    var to = parseInt(txt.replace(/,/g, ''), 10);
    if (!(to > 1) || to > 9999999) return;
    var t0 = performance.now(), dur = 900, fmt = /,/.test(txt), id = (el.__run = (el.__run || 0) + 1);
    function step(t) {
      if (el.__run !== id) return;                                    // a newer value took over
      var p = Math.min(1, (t - t0) / dur), v = Math.round(to * (1 - Math.pow(1 - p, 4)));
      el.__last = fmt ? v.toLocaleString('en-US') : String(v);
      el.textContent = el.__last;
      if (p < 1) raf(step);
    }
    raf(step);
  }

  /* ------------------------------------------------------------------ 7. theme cross-fade */
  var schemeSeen = false;
  new MutationObserver(function () {
    if (!schemeSeen) { schemeSeen = true; return; }
    root.classList.add('g-theme-anim');
    setTimeout(function () { root.classList.remove('g-theme-anim'); }, 600);
  }).observe(root, { attributes: true, attributeFilter: ['data-scheme'] });
  schemeSeen = true;   // the pre-paint script already set it once

  /* ------------------------------------------------------------------ 8. topbar depth */
  function onScroll() {
    var tb = document.querySelector('.topbar');
    if (tb) tb.classList.toggle('scrolled', window.scrollY > 6);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  /* ------------------------------------------------------------------ boot */
  function boot() {
    tagBlocks(document); tagRows(document); initLens();
    document.querySelectorAll('.seg').forEach(initSeg);
    onScroll();

    // content that scripts add after load: table rows, list items, seg controls, numbers
    new MutationObserver(function (muts) {
      var rows = false;
      muts.forEach(function (m) {
        if (m.type === 'characterData') {
          var p = m.target.parentElement;
          if (p && p.matches && p.matches(NUM) && !reduce) countUp(p);
          return;
        }
        if (m.target.matches && m.target.matches(NUM)) { if (!reduce) countUp(m.target); return; }
        m.addedNodes.forEach(function (n) {
          if (n.nodeType !== 1) return;
          if (n.matches && n.matches(ROWS)) rows = true;
          else if (n.querySelector && n.querySelector(ROWS)) rows = true;
          if (n.matches && n.matches('.seg')) initSeg(n);
          if (n.querySelectorAll) n.querySelectorAll('.seg').forEach(initSeg);
          if (n.matches && n.matches(NUM) && !reduce) countUp(n);
        });
      });
      if (rows) tagRows(document);
    }).observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
