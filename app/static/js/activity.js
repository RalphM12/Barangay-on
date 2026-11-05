// Activity Log (Settings, administrator only)
(function () {
  var app = $('#actApp');
  if (!app) return;
  var api = app.dataset.api;
  var state = { page: 1, q: '' };

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ q: state.q, page: state.page, per_page: PAGE_SIZE }));
      if (!d) return;
      $('#actCount').textContent = d.total + ' entr' + (d.total === 1 ? 'y' : 'ies');
      $('#actBody').innerHTML = d.rows.map(function (r) {
        var t = toDate(r.created_at);
        return '<tr><td>' + esc(fmtDateObj(t) + ' ' + fmtTimeObj(t)) + '</td><td>' + esc(r.username || '—') + '</td>' +
               '<td>' + esc(r.action) + '</td><td>' + esc(r.detail) + '</td></tr>';
      }).join('') || '<tr><td colspan="4" class="muted">No activity recorded yet.</td></tr>';
      renderPager($('#actPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load the activity log. ' + err.message);
    }
  }
  $('#actSearch').addEventListener('input', debounce(function () { state.q = this.value.trim(); state.page = 1; load(); }, 300));
  load();
})();
