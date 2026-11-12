/* ============================================================================
   BARANGAY-ON · LIQUID GLASS behaviour for the public pages (home, login, register)
   Progressive enhancement only - everything works without it.
     1. sliding lens behind the active / hovered top-bar link
     2. pointer-following specular light on glass panels
     3. scroll reveal of sections (home)
     4. ripple on buttons, spinner on submit
     5. top bar gains depth once the page scrolls
   ============================================================================ */
(function () {
  'use strict';
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var raf = window.requestAnimationFrame.bind(window);

  /* ---------------------------------------------------------------- 1. nav lens */
  function initLens() {
    var nav = document.querySelector('.topbar-nav');
    if (!nav) return;
    var act = document.createElement('span'); act.className = 'tn-lens';
    var hov = document.createElement('span'); hov.className = 'tn-lens hover';
    nav.insertBefore(hov, nav.firstChild); nav.insertBefore(act, nav.firstChild);
    nav.classList.add('has-lens');

    function box(a) {
      var n = nav.getBoundingClientRect(), r = a.getBoundingClientRect();
      return { x: r.left - n.left + nav.scrollLeft, y: r.top - n.top, w: r.width, h: r.height };
    }
    function put(l, b, instant) {
      if (instant) l.style.transition = 'none';
      l.style.width = b.w + 'px'; l.style.height = b.h + 'px';
      l.style.transform = 'translate(' + b.x + 'px,' + b.y + 'px)';
      if (instant) { void l.offsetWidth; l.style.transition = ''; }
    }
    function current() { return nav.querySelector('a.active'); }
    function place(instant) {
      var a = current();
      if (!a) { act.classList.remove('on'); return; }
      put(act, box(a), !!instant); if (!act.classList.contains('on')) act.classList.add('on');
    }

    // glide in from where the previous page's lens was (login <-> register <-> home)
    var prev = null;
    try { prev = JSON.parse(sessionStorage.getItem('gp-lens') || 'null'); } catch (e) { /* private mode */ }
    if (current() && prev && !reduce && typeof prev.x === 'number') {
      put(act, prev, true); act.classList.add('on');
      raf(function () { raf(function () { place(false); }); });
    } else { place(true); }
    function save() { var a = current(); if (!a) return; try { sessionStorage.setItem('gp-lens', JSON.stringify(box(a))); } catch (e) { /* ignore */ } }
    window.addEventListener('pagehide', save);

    nav.addEventListener('pointerover', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (!a || a === current()) { hov.classList.remove('on'); return; }
      var first = !hov.classList.contains('on');
      put(hov, box(a), first); hov.classList.add('on');
    });
    nav.addEventListener('pointerleave', function () { hov.classList.remove('on'); });
    nav.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a');
      if (a && a.getAttribute('href') && a.getAttribute('href').charAt(0) !== '#') save();
    }, true);

    // home.js moves the "active" class as you scroll: follow it
    // (only real links: the lens spans live in the same nav, and touching them must not re-trigger this)
    new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) if (muts[i].target.tagName === 'A') { place(false); return; }
    }).observe(nav, { attributes: true, attributeFilter: ['class'], subtree: true });
    window.addEventListener('resize', function () { place(true); });
    window.addEventListener('load', function () { place(true); });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { place(true); });
  }

  /* ---------------------------------------------------------------- 3. scroll reveal */
  function initReveal() {
    if (reduce || !('IntersectionObserver' in window)) return;
    var groups = [
      '.band .two-col > *', '.svc-grid .svc', '.band h2', '.section-sub', '.link-cta',
      '.ann-list article', '.hot-list', '.gallery img', '.gallery + *'
    ];
    var items = [];
    groups.forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (n) {
        if (n.closest('.hero') || n.classList.contains('rv')) return;
        n.classList.add('rv'); items.push(n);
      });
    });
    // stagger siblings that enter together
    items.forEach(function (n) {
      var sibs = n.parentElement ? Array.prototype.filter.call(n.parentElement.children, function (c) { return c.classList.contains('rv'); }) : [n];
      n.style.setProperty('--i', Math.min(sibs.indexOf(n), 8));
    });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        var n = en.target; io.unobserve(n);
        n.classList.add('rv-in');
        // once settled, hand control back to the element's own hover transitions
        setTimeout(function () { n.classList.remove('rv', 'rv-in'); n.style.removeProperty('--i'); }, 1700);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    items.forEach(function (n) { io.observe(n); });
  }

  /* ---------------------------------------------------------------- 4. ripple + submit spinner */
  document.addEventListener('pointerdown', function (e) {
    if (reduce || e.button > 0) return;
    var b = e.target.closest ? e.target.closest('.btn, .link-cta') : null;
    if (!b) return;
    var r = b.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2, s = document.createElement('span');
    s.className = 'g-ripple';
    s.style.cssText = 'width:' + d + 'px;height:' + d + 'px;left:' + (e.clientX - r.left - d / 2) + 'px;top:' + (e.clientY - r.top - d / 2) + 'px';
    b.appendChild(s); setTimeout(function () { s.remove(); }, 750);
  }, { passive: true });
  document.addEventListener('submit', function (e) {
    var b = e.target.querySelector && e.target.querySelector('button[type="submit"].btn');
    if (b) setTimeout(function () { b.classList.add('loading'); }, 0);
  });
  window.addEventListener('pageshow', function (e) {   // back button restores the page from cache
    if (e.persisted) document.querySelectorAll('.btn.loading').forEach(function (b) { b.classList.remove('loading'); });
  });

  /* ---------------------------------------------------------------- 5. top bar depth */
  function onScroll() { var t = document.querySelector('.topbar'); if (t) t.classList.toggle('scrolled', window.scrollY > 6); }
  window.addEventListener('scroll', onScroll, { passive: true });

  function boot() { initLens(); initReveal(); onScroll(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();


/* ============================================================================
   LIGHT / DARK SWITCH  (home, login, register)
   Follows the device until the visitor presses the switch; the choice is then
   remembered in localStorage and shared by all three pages.
   ============================================================================ */
(function () {
  'use strict';
  var root = document.documentElement, KEY = 'bo-theme';
  var mq = window.matchMedia('(prefers-color-scheme: dark)');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var btn = document.getElementById('themeToggle');

  function effective() { var t = root.dataset.theme; return t === 'dark' || t === 'light' ? t : (mq.matches ? 'dark' : 'light'); }
  function sync() {
    var s = effective();
    root.dataset.scheme = s;
    if (btn) {
      btn.setAttribute('aria-label', s === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
      btn.setAttribute('title', s === 'dark' ? 'Light mode' : 'Dark mode');
      btn.setAttribute('aria-pressed', s === 'dark' ? 'true' : 'false');
    }
  }
  function apply(theme) {
    root.dataset.theme = theme;
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode */ }
    sync();
  }
  sync();
  if (mq.addEventListener) mq.addEventListener('change', sync);
  if (!btn) return;

  btn.addEventListener('click', function () {
    var next = effective() === 'dark' ? 'light' : 'dark';
    if (reduce) { apply(next); return; }
    if (document.startViewTransition) { document.startViewTransition(function () { apply(next); }); return; }
    root.classList.add('gp-theme-anim');
    apply(next);
    setTimeout(function () { root.classList.remove('gp-theme-anim'); }, 650);
  });
  // another tab changed it
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && (e.newValue === 'light' || e.newValue === 'dark')) { root.dataset.theme = e.newValue; sync(); }
  });
})();
