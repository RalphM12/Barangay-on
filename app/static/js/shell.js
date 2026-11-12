// Shared by every dashboard and inner page (admin, staff, captain, resident):
//  - the hamburger button that opens / closes the sidebar (smooth CSS transition)
//  - "follow device theme"
//  - BarangayShell.apply(): lets the Settings page preview appearance changes immediately
(function () {
  var root = document.documentElement;
  var btn = document.getElementById('menuBtn');
  var backdrop = document.getElementById('sbBackdrop');
  var phone = window.matchMedia('(max-width: 900px)');
  var dark = window.matchMedia('(prefers-color-scheme: dark)');
  var saveTimer;

  function isOpen() { return root.dataset.sidebar === 'open'; }

  // Remember the desktop choice per user (Settings > Appearance > sidebar). Phones always start closed.
  function remember(open) {
    if (phone.matches) return;
    root.dataset.sbpref = open ? 'expanded' : 'collapsed';
    var meta = document.querySelector('meta[name="csrf"]');
    if (!meta) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      var data = new FormData();
      data.append('csrf', meta.content);
      data.append('action', 'save');
      data.append('sidebar_collapsed', open ? '0' : '1');
      var base = document.body.dataset.settingsApi;
      if (!base) return;
      fetch(base, { method: 'POST', body: data, credentials: 'same-origin' }).catch(function () { /* cosmetic */ });
    }, 400);
  }

  function setOpen(open, save) {
    root.dataset.sidebar = open ? 'open' : 'closed';
    if (btn) {
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      btn.setAttribute('aria-label', open ? 'Close sidebar' : 'Open sidebar');
    }
    if (save) remember(open);
  }

  if (btn) {
    setOpen(isOpen(), false);
    btn.addEventListener('click', function () { setOpen(!isOpen(), true); });
  }
  if (backdrop) backdrop.addEventListener('click', function () { setOpen(false, false); });

  // Escape closes the sidebar on phones; choosing a link closes it too
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && phone.matches && isOpen()) { setOpen(false, false); if (btn) btn.focus(); }
  });
  var sb = document.getElementById('sidebar');
  if (sb) sb.addEventListener('click', function (e) {
    if (phone.matches && e.target.closest('a')) setOpen(false, false);
  });

  // Tooltips: when only the icons show, hovering an item tells you what it is
  document.querySelectorAll('.sidebar nav a, .sidebar .nav-parent, .sidebar .logout').forEach(function (el) {
    var label = el.querySelector('span');
    if (label && !el.title) el.title = label.textContent.trim();
  });

  // Expandable sidebar groups (Settings): click toggles, chevron + aria-expanded follow, Escape closes the open group
  document.querySelectorAll('[data-nav-group]').forEach(function (group) {
    var parent = group.querySelector('.nav-parent');
    if (!parent) return;
    parent.addEventListener('click', function () {
      // collapsed (icons only): the first click expands the sidebar and shows the Settings list
      if (!phone.matches && !isOpen()) {
        setOpen(true, true);
        group.classList.add('open'); parent.setAttribute('aria-expanded', 'true');
        return;
      }
      var open = !group.classList.contains('open');
      group.classList.toggle('open', open);
      parent.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    group.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && group.classList.contains('open') && !group.querySelector('a.active')) {
        group.classList.remove('open');
        parent.setAttribute('aria-expanded', 'false');
        parent.focus();
      }
    });
  });

  // Crossing the phone breakpoint: phones start closed, desktops use the saved choice
  function onResize() { setOpen(phone.matches ? false : root.dataset.sbpref !== 'collapsed', false); }
  if (phone.addEventListener) phone.addEventListener('change', onResize); else phone.addListener(onResize);

  // Theme: light | dark | auto (auto follows the device and keeps following it)
  function scheme() {
    var t = root.dataset.theme || 'light';
    root.dataset.scheme = (t === 'dark' || (t === 'auto' && dark.matches)) ? 'dark' : 'light';
  }
  if (dark.addEventListener) dark.addEventListener('change', scheme); else dark.addListener(scheme);

  // Profile photo in the top bar (url comes from <html data-avatar>; Account & Security updates it live)
  function setAvatar(url) {
    document.querySelectorAll('.topbar .avatar').forEach(function (el) {
      if (!el.dataset.fallback) el.dataset.fallback = el.innerHTML;
      if (url) { el.textContent = ''; var img = document.createElement('img'); img.alt = ''; img.src = url; el.appendChild(img); el.classList.add('has-img'); }
      else { el.innerHTML = el.dataset.fallback; el.classList.remove('has-img'); }
    });
  }
  setAvatar(root.dataset.avatar || '');

  window.BarangayShell = {
    setAvatar: setAvatar,
    // p: any of { theme, font_size, density, date_format, time_format, page_size } -> applied right away
    apply: function (p) {
      if (p.theme) { root.dataset.theme = p.theme; scheme(); }
      if (p.font_size) root.dataset.font = p.font_size;
      if (p.density) root.dataset.density = p.density;
      if (p.date_format) root.dataset.datefmt = p.date_format;
      if (p.time_format) root.dataset.timefmt = p.time_format;
      if (p.page_size) root.dataset.pagesize = p.page_size;
      if (p.sidebar_collapsed !== undefined) {
        root.dataset.sbpref = Number(p.sidebar_collapsed) ? 'collapsed' : 'expanded';
        if (!phone.matches) setOpen(!Number(p.sidebar_collapsed), false);
      }
    }
  };
})();
