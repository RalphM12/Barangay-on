// Transaction History: documents whose database status is Released, latest first (admin / staff / captain).
// Read only: there is no button here that can release or change a document.
(function () {
  var app = $('#hisApp');
  var api = app.dataset.api;
  var detailApi = app.dataset.detail;
  var PER = PAGE_SIZE; // rows per page: set in Settings > General
  var state = { page: 1, q: $('#hisSearch').value.trim() };

  // "Oct 22, 2026 3:05 PM" in the user's chosen date / time format
  function when(s) {
    if (!s) return '-';
    var d = toDate(s);
    return fmtDateObj(d) + ' ' + fmtTimeObj(d);
  }

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ q: state.q, page: state.page, per_page: PER }));
      if (!d) return;
      $('#hisCount').textContent = d.total + ' released document' + (d.total === 1 ? '' : 's');
      $('#hisBody').innerHTML = d.rows.map(function (r) {
        return '<tr><td>' + esc(r.tracking_no) + '</td><td>' + esc(r.service) + '</td><td>' + esc(r.resident) + '</td>' +
               '<td>' + esc(CATEGORY_LABELS[r.category] || r.category) + '</td>' +
               '<td>' + badge(r.status) + '</td><td>' + esc(when(r.released_at)) + '</td>' +
               '<td>' + esc(r.released_by || '-') + '</td>' +
               '<td class="actions"><button type="button" class="btn-sm" data-view="' + Number(r.id) + '">View</button></td></tr>';
      }).join('') || '<tr><td colspan="8" class="muted">No released documents yet.</td></tr>';
      renderPager($('#hisPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load the transaction history. ' + err.message);
    }
  }

  async function openDetail(id) {
    try {
      var d = await getJson(detailApi + '?id=' + encodeURIComponent(id));
      if (!d) return;
      var t = d.item;
      openModal('Transaction Details',
        '<dl class="detail">' +
        '<dt>Reference No.</dt><dd>' + esc(t.tracking_no) + '</dd>' +
        '<dt>Document</dt><dd>' + esc(t.service) + ' <small class="muted">(' + esc(CATEGORY_LABELS[t.category] || t.category) + ')</small></dd>' +
        '<dt>Requester</dt><dd>' + esc(t.resident) + '</dd>' +
        '<dt>Address</dt><dd>' + esc(t.address || '-') + '</dd>' +
        '<dt>Contact</dt><dd>' + esc(t.contact_no || '-') + '</dd>' +
        '<dt>Status</dt><dd>' + badge(t.status) + '</dd>' +
        '<dt>Date filed</dt><dd>' + fmtDate(t.created_at) + '</dd>' +
        (t.approved_at ? '<dt>Approved on</dt><dd>' + esc(when(t.approved_at)) + (t.approved_by ? ' <small class="muted">by ' + esc(t.approved_by) + '</small>' : '') + '</dd>' : '') +
        (t.released_at ? '<dt>Released on</dt><dd>' + esc(when(t.released_at)) + '</dd>' : '') +
        ((t.released_by || t.signed_by) ? '<dt>Released by</dt><dd>' + esc(t.released_by || t.signed_by) + '</dd>' : '') +
        (t.signed_by ? '<dt>Signed by</dt><dd>' + esc(t.signed_by) + '</dd>' : '') +
        '<dt>Details</dt><dd class="pre">' + esc(t.details || 'No details provided.') + '</dd></dl>');
    } catch (err) {
      showToast(err.message, true);
    }
  }

  $('#hisBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (b) openDetail(b.dataset.view);
  });
  $('#hisSearch').addEventListener('input', debounce(function () { state.q = this.value.trim(); state.page = 1; load(); }, 300));

  load().then(function () {
    var id = new URLSearchParams(location.search).get('id');
    if (id) openDetail(id);
  });
})();
