// Resident Accounts (administrator): list resident usernames, set a new password
(function () {
  var app = $('#raApp');
  var api = app.dataset.api;
  var PER = PAGE_SIZE;
  var state = { page: 1, q: '' };
  var rowsCache = [];

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ q: state.q, page: state.page, per_page: PER }));
      if (!d) return;
      rowsCache = d.rows;
      $('#raCount').textContent = d.total + ' account' + (d.total === 1 ? '' : 's');
      $('#raBody').innerHTML = d.rows.map(function (u) {
        return '<tr><td>' + esc(u.full_name) + '</td><td>' + esc(u.username) + '</td>' +
          '<td><span class="muted" title="Passwords are stored encrypted and cannot be viewed">&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull; (hidden)</span></td>' +
          '<td>' + fmtDate(u.created_at) + '</td>' +
          '<td class="actions"><button type="button" class="btn-sm" data-reset="' + Number(u.id) + '">Set new password</button></td></tr>';
      }).join('') || '<tr><td colspan="5" class="muted">No resident accounts found.</td></tr>';
      renderPager($('#raPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load resident accounts. ' + err.message);
    }
  }

  function openReset(u) {
    var body = openModal('Set new password: ' + u.full_name,
      '<form class="form" id="raForm"><p class="muted">Username: <strong>' + esc(u.username) + '</strong><br>' +
      'The current password is encrypted and cannot be shown. Enter a new one and give it to the resident.</p>' +
      '<label>New password (8+ characters)<input type="text" name="password" minlength="8" required autocomplete="off"></label>' +
      '<button type="submit" class="btn-primary">Save new password</button></form>');
    body.querySelector('#raForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form = new FormData(this);
      form.append('action', 'reset_password');
      form.append('id', u.id);
      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await postForm(api, form);
        showToast('Password updated.');
        closeModal();
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  $('#raSearch').addEventListener('input', debounce(function () { state.q = this.value.trim(); state.page = 1; load(); }, 300));
  $('#raBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-reset]');
    if (!b) return;
    var u = rowsCache.filter(function (x) { return Number(x.id) === Number(b.dataset.reset); })[0];
    if (u) openReset(u);
  });

  load();
})();
