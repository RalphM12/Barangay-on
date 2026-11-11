// Captain dashboard: sign documents (the captain also has all permissions on the other pages).
// Loads /api/captain_dashboard, sends signatures to /api/captain_action
(function () {
  var body = document.body;
  var csrf = document.querySelector('meta[name="csrf"]').content;
  var toastTimer;

  function toast(message, bad) {
    var el = $('#toast');
    el.textContent = message;
    el.className = 'toast' + (bad ? ' bad' : '');
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { el.hidden = true; }, 4000);
  }

  function picked() {
    return Array.prototype.map.call(document.querySelectorAll('#approvalBody input[data-pick]:checked'), function (b) { return b.dataset.pick; });
  }
  function updateBulk() {
    var n = picked().length;
    var btn = $('#signSelected');
    btn.disabled = !n;
    btn.textContent = 'Sign selected' + (n ? ' (' + n + ')' : '');
    var boxes = document.querySelectorAll('#approvalBody input[data-pick]');
    $('#pickAll').checked = boxes.length > 0 && picked().length === boxes.length;
  }

  function renderPending(rows) {
    $('#approvalBody').innerHTML = rows.map(function (r) {
      return '<tr><td><input type="checkbox" data-pick="' + Number(r.id) + '"></td>' +
        '<td>' + esc(r.tracking_no) + '</td><td>' + esc(r.service) + '</td><td>' + esc(r.resident) + '</td>' +
        '<td>' + fmtDate(r.created_at) + '</td>' +
        '<td><button class="act approve" data-id="' + Number(r.id) + '">Sign</button></td></tr>';
    }).join('') || '<tr><td colspan="6" class="muted">Nothing is waiting for your signature.</td></tr>';
    updateBulk();
  }

  async function load() {
    try {
      var d = await getJson(body.dataset.api);
      if (!d) return;

      $('#greeting').textContent = greeting() + ', Captain ' + d.user.name.split(' ').slice(-1)[0] + '!';
      $('#userName').textContent = d.user.name;
      $('#userRole').textContent = d.user.position;

      $('#stToSign').textContent = d.stats.to_sign;
      $('#stMonth').textContent  = d.stats.signed_month;
      $('#stTotal').textContent  = d.stats.signed_total;

      var nav = $('#navApprovals');
      nav.textContent = d.stats.to_sign;
      nav.hidden = !d.stats.to_sign;

      renderPending(d.pending);
      setUnread(d.unread);
    } catch (err) {
      showError('Could not load the dashboard. ' + err.message);
    }
  }

  async function sign(ids) {
    if (!confirm('Sign ' + (ids.length > 1 ? ids.length + ' documents' : 'this document') + '? Signed documents go back to staff for release.')) return;
    var form = new FormData();
    form.append('csrf', csrf);
    form.append('action', ids.length > 1 ? 'sign_bulk' : 'sign');
    if (ids.length > 1) ids.forEach(function (i) { form.append('ids[]', i); }); else form.append('id', ids[0]);
    try {
      var res = await postForm(body.dataset.action, form);
      toast(res.signed + ' document' + (res.signed === 1 ? '' : 's') + ' signed.');
    } catch (err) {
      toast(err.message, true);
    }
    load();
  }

  $('#approvalBody').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button[data-id]');
    if (btn) sign([btn.dataset.id]);
  });
  $('#approvalBody').addEventListener('change', updateBulk);
  $('#pickAll').addEventListener('change', function () {
    var on = this.checked;
    document.querySelectorAll('#approvalBody input[data-pick]').forEach(function (b) { b.checked = on; });
    updateBulk();
  });
  $('#signSelected').addEventListener('click', function () { var ids = picked(); if (ids.length) sign(ids); });

  $('#today').textContent = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  load();
})();
