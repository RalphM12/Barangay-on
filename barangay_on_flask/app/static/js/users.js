// User & Role Management (administrator / captain; resident accounts are not listed): create admins / staff, assign permissions
(function () {
  var app = $('#usrApp');
  var api = app.dataset.api;
  var PER = PAGE_SIZE; // rows per page: set in Settings > General
  var state = { page: 1, q: '', role: '' };
  var rowsCache = [];
  var PERMS = {};
  var ROLE_LABELS = { admin: 'Administrator', staff: 'Staff', captain: 'Barangay Captain' };

  // Captain accounts: show whether this captain is serving now or when the term ended
  function termNote(u) {
    if (u.role !== 'captain') return '';
    if (Number(u.serving)) return '<br><small class="muted">Current captain' + (u.term_start ? ' since ' + fmtDate(u.term_start) : '') + '</small>';
    return '<br><small class="muted">Term ended ' + (u.term_ended_at ? fmtDate(u.term_ended_at) : '') + '</small>';
  }

  function permSummary(u) {
    if (u.role === 'admin') return '<span class="muted">Monitors everything (view only) + manages users</span>';
    if (u.role === 'captain') return '<span class="muted">' + (Number(u.serving) ? 'Signs documents approved by staff' : 'No longer serving (account kept for the records)') + '</span>';
    if (!u.permissions.length) return '<span class="muted">None assigned</span>';
    return u.permissions.map(function (p) { return '<span class="tag">' + esc(shortLabel(p)) + '</span>'; }).join(' ');
  }
  function shortLabel(p) { return (PERMS[p] || p).split(' (')[0]; }

  function checkboxes(selected) {
    return Object.keys(PERMS).map(function (p) {
      return '<label class="check"><input type="checkbox" name="permissions[]" value="' + esc(p) + '"' +
             (selected.indexOf(p) !== -1 ? ' checked' : '') + '> ' + esc(PERMS[p]) + '</label>';
    }).join('');
  }

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ q: state.q, role: state.role, page: state.page, per_page: PER }));
      if (!d) return;
      PERMS = d.permissions;
      rowsCache = d.rows;
      $('#usrCount').textContent = d.total + ' user' + (d.total === 1 ? '' : 's');
      $('#usrBody').innerHTML = d.rows.map(function (u) {
        return '<tr><td>' + esc(u.full_name) + '<br><small class="muted">' + esc(u.position) + '</small></td><td>' + esc(u.username) + '</td>' +
               '<td>' + esc(ROLE_LABELS[u.role] || u.role) + termNote(u) + '</td><td>' + permSummary(u) + '</td>' +
               '<td class="actions">' + (u.role === 'staff' ? '<button type="button" class="btn-sm" data-perm="' + Number(u.id) + '">Permissions</button>' : '') +
               (u.role === 'captain' && Number(u.serving) ? '<button type="button" class="btn-sm bad" data-end="' + Number(u.id) + '">End term</button>' : '') + '</td></tr>';
      }).join('') || '<tr><td colspan="5" class="muted">No users found.</td></tr>';
      renderPager($('#usrPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load users. ' + err.message);
    }
  }

  function openPermissions(u) {
    var body = openModal('Permissions: ' + u.full_name,
      '<form class="form" id="permForm"><p class="muted">Choose what this staff member can do.</p>' + checkboxes(u.permissions) +
      '<button type="submit" class="btn-primary">Save permissions</button></form>');
    body.querySelector('#permForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form = new FormData(this);
      form.append('action', 'permissions');
      form.append('id', u.id);
      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await postForm(api, form);
        showToast('Permissions saved.');
        closeModal();
        load();
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  function openCreate() {
    var body = openModal('Create Admin / Staff',
      '<form class="form" id="newUserForm">' +
      '<label>Role<select name="role" id="nuRole"><option value="staff">Staff (permissions chosen below)</option><option value="admin">Administrator (monitoring + user management)</option></select></label>' +
      '<div class="row2"><label>Full name<input type="text" name="full_name" maxlength="100" required></label>' +
      '<label>Position<input type="text" name="position" maxlength="80" placeholder="Barangay Staff"></label></div>' +
      '<div class="row2"><label>Username<input type="text" name="username" maxlength="50" required autocomplete="off"></label>' +
      '<label>Password (8+ characters)<input type="password" name="password" minlength="8" required autocomplete="new-password"></label></div>' +
      '<div id="nuPerms"><strong>Permissions</strong>' + checkboxes([]) + '</div>' +
      '<button type="submit" class="btn-primary">Create account</button></form>');
    var role = body.querySelector('#nuRole');
    role.addEventListener('change', function () { body.querySelector('#nuPerms').hidden = this.value === 'admin'; });
    body.querySelector('#newUserForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form = new FormData(this);
      form.append('action', 'create');
      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await postForm(api, form);
        showToast('Account created.');
        closeModal();
        load();
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  // The next Barangay Captain takes over: the serving captain's term ends and the new captain's own signature is used on documents from now on.
  function openNewCaptain() {
    var body = openModal('New Barangay Captain',
      '<form class="form" id="newCaptainForm">' +
      '<div class="set-note">Creating the new captain <strong>ends the term of the current captain</strong>. The old account can no longer sign in or sign documents, ' +
      'but documents already signed keep the signature of the captain who signed them. The new captain can draw or upload a signature in Account &amp; Security; until then an automatic one is used.</div>' +
      '<label>Full name<input type="text" name="full_name" maxlength="100" required placeholder="e.g. Juan Dela Cruz"></label>' +
      '<div class="row2"><label>Username<input type="text" name="username" maxlength="50" required autocomplete="off"></label>' +
      '<label>Password (8+ characters)<input type="password" name="password" minlength="8" required autocomplete="new-password"></label></div>' +
      '<label>Term starts<input type="date" name="term_start" value="' + new Date().toISOString().slice(0, 10) + '"></label>' +
      '<button type="submit" class="btn-primary">Start new captain\'s term</button></form>');
    body.querySelector('#newCaptainForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!confirm('End the current captain\'s term and make this person the Barangay Captain?')) return;
      var form = new FormData(this);
      form.append('action', 'new_captain');
      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await postForm(api, form);
        showToast('The new captain is now in office.');
        closeModal();
        load();
      } catch (err) {
        showToast(err.message, true);
        btn.disabled = false;
      }
    });
  }

  async function endTerm(id) {
    if (!confirm('End this captain\'s term? The account can no longer sign in or sign documents until a new captain is added.')) return;
    var form = new FormData();
    form.append('action', 'end_term');
    form.append('id', id);
    try {
      await postForm(api, form);
      showToast('The captain\'s term has ended.');
      load();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  $('#usrSearch').addEventListener('input', debounce(function () { state.q = this.value.trim(); state.page = 1; load(); }, 300));
  $('#usrRole').addEventListener('change', function () { state.role = this.value; state.page = 1; load(); });
  $('#usrAdd').addEventListener('click', openCreate);
  $('#usrNewCaptain').addEventListener('click', openNewCaptain);
  $('#usrBody').addEventListener('click', function (e) {
    var en = e.target.closest('[data-end]');
    if (en) return endTerm(Number(en.dataset.end));
    var b = e.target.closest('[data-perm]');
    if (!b) return;
    var u = rowsCache.filter(function (x) { return Number(x.id) === Number(b.dataset.perm); })[0];
    if (u) openPermissions(u);
  });

  load();
})();
