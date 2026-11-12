// Notifications page (same for admin, resident and captain)
(function () {
  var app = $('#notifApp');
  var api = app.dataset.api;
  var PER = PAGE_SIZE; // rows per page: set in Settings > General
  var state = { page: 1, unread: '' };

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ unread: state.unread, page: state.page, per_page: PER }));
      if (!d) return;

      $('#notifCount').textContent = d.total + ' notification' + (d.total === 1 ? '' : 's');
      setUnread(d.unread);

      $('#notifList').innerHTML = d.rows.map(function (n) {
        var unread = !Number(n.is_read);
        return '<li class="' + (unread ? 'unread' : '') + '">' +
          '<span class="n-ico ' + esc(n.type) + '">' + (NOTIF_ICONS[n.type] || 'i') + '</span>' +
          '<div class="body"><strong>' + esc(n.title) + '</strong><p>' + esc(n.message) + '</p><small>' + timeAgo(n.created_at) + '</small></div>' +
          '<div class="row-actions">' +
          (unread ? '<button type="button" class="btn-sm light" data-read="' + Number(n.id) + '">Mark read</button>' : '') +
          '<button type="button" class="btn-sm light" data-del="' + Number(n.id) + '">Delete</button></div></li>';
      }).join('') || '<li class="muted">You have no notifications.</li>';

      renderPager($('#notifPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load notifications. ' + err.message);
    }
  }

  async function send(action, id) {
    var form = new FormData();
    form.append('action', action);
    if (id) form.append('id', id);
    try {
      await postForm(api, form);
      load();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  $('#notifList').addEventListener('click', function (e) {
    var r = e.target.closest('[data-read]');
    if (r) return send('read', r.dataset.read);
    var d = e.target.closest('[data-del]');
    if (d) send('delete', d.dataset.del);
  });
  $('#notifReadAll').addEventListener('click', function () { send('read_all'); });
  $('#notifFilter').addEventListener('change', function () { state.unread = this.value; state.page = 1; load(); });

  load();
})();
