// Helpers shared by the three dashboards ------------------------------------

function $(selector, root) { return (root || document).querySelector(selector); }

// Escape text before putting it into innerHTML
function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

// GET JSON from the PHP API. Sends the user back to login if the session expired.
async function getJson(url) {
  var res = await fetch(url, { credentials: 'same-origin' });
  if (res.status === 401) { location.href = document.body.dataset.login; return null; }
  if (!res.ok) {
    var err = await res.json().catch(function () { return {}; });
    throw new Error(err.error || 'Request failed (' + res.status + ')');
  }
  return res.json();
}

// POST form data to the PHP API (the security token is added automatically)
async function postForm(url, data) {
  if (data instanceof FormData && !data.has('csrf')) {
    var meta = document.querySelector('meta[name="csrf"]');
    if (meta) data.append('csrf', meta.content);
  }
  var res = await fetch(url, { method: 'POST', body: data, credentials: 'same-origin' });
  var json = await res.json().catch(function () { return {}; });
  if (!res.ok) throw new Error(json.error || 'Request failed');
  return json;
}

function slug(text) { return String(text).toLowerCase().replace(/\s+/g, '-'); }

// MySQL "2026-10-10 12:30:00" -> Date
function toDate(s) { return new Date(String(s).replace(' ', 'T')); }

// Date / time / table size follow the user's Settings (saved in user_settings, set on <html> by the server)
var PREFS = document.documentElement.dataset;
var PAGE_SIZE = [10, 25, 50].indexOf(Number(PREFS.pagesize)) > -1 ? Number(PREFS.pagesize) : 10;
var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function pad2(n) { return (n < 10 ? '0' : '') + n; }

// Date object -> text, using the chosen date format (mdy: Oct 22, 2026 | dmy: 22 Oct 2026 | iso: 2026-10-22)
function fmtDateObj(d) {
  if (isNaN(d.getTime())) return '';
  var f = PREFS.datefmt || 'mdy';
  if (f === 'iso') return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  if (f === 'dmy') return pad2(d.getDate()) + ' ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  return MONTHS[d.getMonth()] + ' ' + pad2(d.getDate()) + ', ' + d.getFullYear();
}

// Date object -> time text, 12-hour or 24-hour
function fmtTimeObj(d) {
  if (isNaN(d.getTime())) return '';
  if (PREFS.timefmt === '24h') return pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  var h = d.getHours() % 12 || 12;
  return pad2(h) + ':' + pad2(d.getMinutes()) + ' ' + (d.getHours() < 12 ? 'AM' : 'PM');
}

function fmtDate(s) {
  return fmtDateObj(toDate(s));
}

function timeAgo(s) {
  var secs = Math.max(0, (Date.now() - toDate(s).getTime()) / 1000);
  if (secs < 60) return 'just now';
  var mins = Math.floor(secs / 60);
  if (mins < 60) return mins + ' minute' + (mins > 1 ? 's' : '') + ' ago';
  var hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + ' hour' + (hrs > 1 ? 's' : '') + ' ago';
  var days = Math.floor(hrs / 24);
  return days + ' day' + (days > 1 ? 's' : '') + ' ago';
}

function greeting() {
  var h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}

// An approved document is a released document (the captain signed it)
var RES_LABELS = { Pending: 'Waiting for Verification' };   // resident status shown to people
function resLabel(status) { return RES_LABELS[status] || status; }

function badge(status) {
  return '<span class="badge ' + slug(status) + '">' + esc(status) + '</span>';
}

function showError(message) {
  var box = document.getElementById('errorBox');
  if (box) { box.textContent = message; box.hidden = false; }
}

// Show the unread count on the bell and the sidebar link
function setUnread(count) {
  document.querySelectorAll('[data-unread]').forEach(function (el) {
    el.textContent = count;
    el.hidden = !count;
  });
}

var NOTIF_ICONS = { success: '✔', info: 'i', warning: '!', alert: '🔔' };

// ---- extra helpers used by the sidebar pages --------------------------------

// Build "a=1&b=2" from an object, skipping empty values
function qs(obj) {
  var p = new URLSearchParams();
  Object.keys(obj).forEach(function (k) {
    if (obj[k] !== '' && obj[k] != null) p.append(k, obj[k]);
  });
  return p.toString();
}

// Small message in the top-right corner
function showToast(message, bad) {
  var el = document.createElement('div');
  el.className = 'flash' + (bad ? ' bad' : '');
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 3500);
}

// Pop-up window. `html` must already be escaped by the caller. Returns the body element.
function openModal(title, html) {
  closeModal();
  var back = document.createElement('div');
  back.className = 'modal-back';
  back.id = 'modalBack';
  back.innerHTML = '<div class="modal" role="dialog" aria-modal="true"><div class="modal-head"><h3>' + esc(title) +
    '</h3><button type="button" class="modal-x" aria-label="Close">&times;</button></div><div class="modal-body">' + html + '</div></div>';
  back.addEventListener('click', function (e) {
    if (e.target === back || e.target.closest('.modal-x')) closeModal();
  });
  document.body.appendChild(back);
  return back.querySelector('.modal-body');
}
function closeModal() {
  var b = document.getElementById('modalBack');
  if (b) b.remove();
}
document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeModal(); });

// "Previous / Next" paging controls
function renderPager(el, page, perPage, total, onPage) {
  var pages = Math.max(1, Math.ceil(total / perPage));
  el.innerHTML = '<button type="button" data-p="-1"' + (page <= 1 ? ' disabled' : '') + '>Previous</button>' +
    '<span>Page ' + page + ' of ' + pages + '</span>' +
    '<button type="button" data-p="1"' + (page >= pages ? ' disabled' : '') + '>Next</button>';
  el.onclick = function (e) {
    var b = e.target.closest('button[data-p]');
    if (b && !b.disabled) onPage(page + Number(b.dataset.p));
  };
}

function debounce(fn, ms) {
  var t;
  return function () {
    var args = arguments, self = this;
    clearTimeout(t);
    t = setTimeout(function () { fn.apply(self, args); }, ms);
  };
}

var CATEGORY_LABELS = { document: 'Document Request', complaint: 'Complaint', report: 'Community Report' };

// Bell + sidebar badges on every inner page
(async function () {
  var url = document.body.dataset.badges;
  if (!url) return;
  try {
    var d = await getJson(url);
    if (!d) return;
    setUnread(d.unread);
    var nav = document.getElementById('navApprovals');
    if (nav && d.pending_approvals != null) {
      nav.textContent = d.pending_approvals;
      nav.hidden = !d.pending_approvals;
    }
  } catch (e) { /* badges are optional */ }
})();

// Date and time in the admin top bar of inner pages
(function () {
  var el = document.getElementById('clock');
  if (!el || document.body.dataset.inner === undefined) return;
  function tick() {
    var now = new Date();
    el.textContent = fmtDateObj(now) + '\n' + fmtTimeObj(now);
  }
  tick();
  setInterval(tick, 30000);
})();

// Contact number fields (contact_no / contact_number): digits only, never more than 11.
// Works for fields built later by JS too, and for pasted text.
(function () {
  function isContact(el) { return el && el.tagName === 'INPUT' && (el.name === 'contact_no' || el.name === 'contact_number'); }
  document.addEventListener('focusin', function (e) {
    if (!isContact(e.target)) return;
    e.target.maxLength = 11; e.target.inputMode = 'numeric';
  });
  document.addEventListener('input', function (e) {
    if (!isContact(e.target)) return;
    var clean = e.target.value.replace(/\D+/g, '').slice(0, 11);
    if (e.target.value !== clean) e.target.value = clean;
  });
})();
