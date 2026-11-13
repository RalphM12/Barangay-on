// Residents: full CRUD (add, edit, delete) for admin, staff and captain
(function () {
  var app = $('#resApp');
  var api = app.dataset.api;
  var manage = app.dataset.manage === '1';
  var canDelete = app.dataset.delete === '1';   // only the administrator can delete a resident
  var PER = PAGE_SIZE; // rows per page: set in Settings > General
  var state = { page: 1, q: '', status: '' };
  var rowsCache = [];
  var STATUSES = ['Registered', 'Pending', 'Inactive'];

  var RES_BADGE = { Registered: 'released', Pending: 'processing', Inactive: 'rejected' };

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ q: state.q, status: state.status, page: state.page, per_page: PER }));
      if (!d) return;
      rowsCache = d.rows;

      $('#resCount').textContent = d.total + ' resident' + (d.total === 1 ? '' : 's');
      $('#resBody').innerHTML = d.rows.map(function (r) {
        return '<tr><td>' + esc(fullName(r)) + '</td><td>' + esc(r.address || '-') + '</td>' +
          '<td>' + esc(r.contact_no || '-') + '</td>' +
          '<td><span class="badge ' + (RES_BADGE[r.status] || '') + '">' + esc(resLabel(r.status)) + '</span></td>' +
          '<td>' + (Number(r.has_account) ? 'Yes' : 'No') + '</td><td>' + fmtDate(r.created_at) + '</td>' +
          '<td class="actions">' + (manage ? '<button type="button" class="btn-sm" data-edit="' + Number(r.id) + '">Edit</button>' : '') +
          (canDelete ? '<button type="button" class="btn-sm bad" data-del="' + Number(r.id) + '">Delete</button>' : '') + '</td>' +
          '</tr>';
      }).join('') || '<tr><td colspan="7" class="muted">No residents found.</td></tr>';

      renderPager($('#resPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load residents. ' + err.message);
    }
  }

  var CIVIL = ['Single', 'Married', 'Widowed', 'Separated'];

  function initials(r) { return ((r.first_name || '?').charAt(0) + (r.last_name || '').charAt(0)).toUpperCase(); }

  function ageOf(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    if (!m) return '';
    var t = new Date(), a = t.getFullYear() - +m[1];
    if (t.getMonth() + 1 < +m[2] || (t.getMonth() + 1 === +m[2] && t.getDate() < +m[3])) a--;
    return a >= 0 && a < 130 ? a : '';
  }

  // Profile summary shown at the top of "Edit Resident": photo, name, status and activity
  function profileCard(r) {
    if (!r.id) return '';
    var photo = r.avatar ? '<img src="' + esc(r.avatar) + '" alt="Profile photo of ' + esc(r.first_name) + '">' : '<span>' + esc(initials(r)) + '</span>';
    var age = ageOf(r.birthdate);
    return '<div class="rp-card"><div class="rp-photo">' + photo + '</div><div class="rp-info">' +
      '<strong>' + esc(fullName(r)) + '</strong>' +
      '<div class="rp-sub"><span class="badge ' + (RES_BADGE[r.status] || '') + '">' + esc(resLabel(r.status)) + '</span> ' +
      '<small class="muted">RES-' + String(r.id).padStart(5, '0') + (age !== '' ? ' &middot; ' + age + ' yrs old' : '') + '</small></div>' +
      '<div class="rp-meta"><span>Registered <b>' + fmtDate(r.created_at) + '</b></span>' +
      '<span>Online account <b>' + (Number(r.has_account) ? 'Yes' : 'No') + '</b></span>' +
      '<span>Documents <b>' + Number(r.doc_count || 0) + '</b></span>' +
      '<span>Complaints <b>' + Number(r.complaint_count || 0) + '</b></span>' +
      '<span>Reports <b>' + Number(r.report_count || 0) + '</b></span></div></div></div>';
  }

  // Administrator only (the API sends the username only to the admin): change the username, set a new password.
  // Passwords are stored encrypted (hashed), so the current one can never be displayed - the admin types a new one
  // (Show / Generate / Copy help) and the resident uses it to log in.
  function accountFields(r) {
    if (canDelete && (!r.id || !Number(r.has_account))) {           // admin only: create a login for this resident
      return '<div class="rp-section">Create login account <small class="muted">optional</small></div>' +
        '<div class="row2"><label>Username<input type="text" name="username" minlength="4" maxlength="30" autocomplete="off" autocapitalize="none" placeholder="4-30 letters, numbers, . or _"></label>' +
        '<label>Password<input type="password" name="new_password" id="resNewPass" minlength="8" maxlength="72" autocomplete="new-password" placeholder="At least 8 characters"></label></div>' +
        '<div class="rp-passtools"><button type="button" class="btn-light btn-sm" id="resPassShow">Show</button>' +
        '<button type="button" class="btn-light btn-sm" id="resPassGen">Generate</button>' +
        '<button type="button" class="btn-light btn-sm" id="resPassCopy">Copy</button></div>' +
        '<small class="muted">Fill in both to give this resident an account they can log in with. Leave both blank for no account.</small>';
    }
    if (!r.id || !Number(r.has_account) || r.username === undefined) return '';
    return '<div class="rp-section">Login account' + (r.account_created ? ' <small class="muted">created ' + fmtDate(r.account_created) + '</small>' : '') + '</div>' +
      '<div class="row2"><label>Username<input type="text" name="username" minlength="4" maxlength="30" autocomplete="off" autocapitalize="none" required value="' + esc(r.username) + '"></label>' +
      '<label>Password<input type="password" name="new_password" id="resNewPass" minlength="8" maxlength="72" autocomplete="new-password" placeholder="Hidden - type to set a new one"></label></div>' +
      '<div class="rp-passtools"><button type="button" class="btn-light btn-sm" id="resPassShow">Show</button>' +
      '<button type="button" class="btn-light btn-sm" id="resPassGen">Generate</button>' +
      '<button type="button" class="btn-light btn-sm" id="resPassCopy">Copy</button></div>' +
      '<small class="muted">The current password is encrypted and cannot be viewed. Leave blank to keep it, or type / generate a new one (8+ characters) and give it to the resident.</small>';
  }

  function randomPassword() {
    var chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', out = '';
    var buf = new Uint32Array(10);
    (window.crypto || window.msCrypto).getRandomValues(buf);
    for (var i = 0; i < buf.length; i++) out += chars.charAt(buf[i] % chars.length);
    return out;
  }

  function openForm(r) {
    r = r || { id: 0, first_name: '', middle_name: '', last_name: '', address: '', contact_no: '', status: 'Registered', birthdate: '', civil_status: '', sex: '' };
    var html = profileCard(r) + '<form class="form" id="resForm">' +
      '<div class="rp-section">Personal information</div>' +
      '<div class="row2"><label>First name<input type="text" name="first_name" maxlength="60" required value="' + esc(r.first_name) + '"></label>' +
      '<label>Middle name<input type="text" name="middle_name" maxlength="60" value="' + esc(r.middle_name || '') + '"></label></div>' +
      '<div class="row2"><label>Last name<input type="text" name="last_name" maxlength="60" required value="' + esc(r.last_name) + '"></label><span></span></div>' +
      '<div class="row2"><label>Date of birth<input type="date" name="birthdate" max="' + new Date().toISOString().slice(0, 10) + '" value="' + esc((r.birthdate || '').slice(0, 10)) + '"></label>' +
      '<label>Sex<select name="sex"><option value="">-</option>' + ['Male', 'Female'].map(function (c) {
        return '<option' + (c === r.sex ? ' selected' : '') + '>' + c + '</option>';
      }).join('') + '</select></label></div>' +
      '<label>Civil status<select name="civil_status"><option value="">-</option>' + CIVIL.map(function (c) {
        return '<option' + (c === r.civil_status ? ' selected' : '') + '>' + c + '</option>';
      }).join('') + '</select></label>' +
      '<label>Address<input type="text" name="address" maxlength="150" list="addrList" autocomplete="off" value="' + esc(r.address) + '"><datalist id="addrList"></datalist></label>' +
      '<label>Contact number<input type="text" name="contact_no" inputmode="numeric" maxlength="11" value="' + esc(r.contact_no) + '"></label>' +
      (r.id ? '<div class="rp-section">Registration details</div><div class="reg-extra"><div><b>Suffix:</b> ' + esc(r.suffix || 'None') + '</div><div><b>Occupation:</b> ' + esc(r.occupation || '-') + '</div>' +
        '<div><b>ID / proof of billing:</b> ' + (r.id_proof ? '<a href="' + esc(r.id_proof) + '" target="_blank" rel="noopener">View uploaded file</a>' : 'None uploaded') + '</div></div>' : '') +
      '' + accountFields(r) +
      (r.id && manage && r.status === 'Pending' ? '<input type="hidden" name="register" value="0" id="resRegFlag">' +
        '<p class="verify-note">This resident is <b>Waiting for Verification</b> and cannot yet request documents, file complaints or send reports. Check the details above, then click <b>Verify This Resident</b>.</p>' : '') +
      '<div class="form-actions"><button type="submit" class="btn-primary">Save</button>' +
      (r.id && manage && r.status === 'Pending' ? '<button type="button" class="btn-ok" id="resRegister">Verify This Resident</button>' : '') +
      (r.id && canDelete ? '<button type="button" class="btn-danger push" id="resDelete">Delete resident</button>' : '') + '</div></form>';

    var body = openModal(r.id ? 'Edit Resident' : 'Add Resident', html);

    // standard address spellings already used in the records (suggestions only - nothing is filled in for you)
    var addr = body.querySelector('input[name="address"]');
    var addrList = body.querySelector('#addrList');
    var suggest = debounce(async function () {
      try {
        var d = await getJson(api.replace('/residents', '/resident_lookup') + '?' + qs({ addresses: 1, q: addr.value.trim() }));
        if (d) addrList.innerHTML = d.addresses.map(function (a) { return '<option value="' + esc(a) + '">'; }).join('');
      } catch (e) { /* suggestions are optional */ }
    }, 250);
    addr.addEventListener('input', suggest);
    // password helpers (admin): show / hide, generate a random one, copy it to give to the resident
    var pw = body.querySelector('#resNewPass');
    if (pw) {
      var showBtn = body.querySelector('#resPassShow');
      showBtn.addEventListener('click', function () {
        var hidden = pw.type === 'password';
        pw.type = hidden ? 'text' : 'password';
        showBtn.textContent = hidden ? 'Hide' : 'Show';
      });
      body.querySelector('#resPassGen').addEventListener('click', function () {
        pw.value = randomPassword();
        pw.type = 'text'; showBtn.textContent = 'Hide';
      });
      body.querySelector('#resPassCopy').addEventListener('click', function () {
        if (!pw.value) return showToast('Type or generate a password first.', true);
        var done = function () { showToast('Password copied.'); };
        if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pw.value).then(done, function () { pw.select(); document.execCommand('copy'); done(); });
        else { pw.select(); document.execCommand('copy'); done(); }
      });
    }
    var regBtn = body.querySelector('#resRegister');
    if (regBtn) regBtn.addEventListener('click', function () {
      if (!confirm('Verify ' + fullName(r) + '?\n\nThey will be registered and able to request documents, file complaints and send community reports.')) return;
      body.querySelector('#resRegFlag').value = '1';
      var f = body.querySelector('#resForm');
      if (f.requestSubmit) f.requestSubmit(); else f.dispatchEvent(new Event('submit', { cancelable: true }));
      if (!f.checkValidity()) body.querySelector('#resRegFlag').value = '0';   // the browser stopped it: a field needs fixing
    });
    var del = body.querySelector('#resDelete');
    if (del) del.addEventListener('click', function () { removeResident(r); });
    body.querySelector('#resForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form = new FormData(this);
      form.append('action', 'save');
      form.append('id', r.id);
      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await postForm(api, form);
        showToast(form.get('register') === '1' ? 'Resident verified and registered.' : 'Resident saved.');
        closeModal();
        load();
      } catch (err) {
        showToast(err.message, true);
        var flag = this.querySelector('#resRegFlag'); if (flag) flag.value = '0';
        btn.disabled = false;
      }
    });
  }

  async function removeResident(r) {
    var name = fullName(r);
    if (!confirm('Delete ' + name + ' from the residents list?' + (Number(r.has_account) ? '\n\nTheir login account will be removed.' : '') +
                 '\n\nTheir document requests, complaints and transactions are NOT deleted - the records remain.')) return;
    var form = new FormData();
    form.append('action', 'delete');
    form.append('id', r.id);
    try {
      await postForm(api, form);
      showToast('Resident deleted.');
      closeModal();
      load();
    } catch (err) {
      showToast(err.message, true);
    }
  }

  $('#resSearch').addEventListener('input', debounce(function () { state.q = this.value.trim(); state.page = 1; load(); }, 300));
  $('#resStatus').addEventListener('change', function () { state.status = this.value; state.page = 1; load(); });

  if (manage && $('#resAdd')) $('#resAdd').addEventListener('click', function () { openForm(null); });

  $('#resBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-edit],[data-del]');
    if (!b) return;
    var r = rowsCache.filter(function (x) { return Number(x.id) === Number(b.dataset.edit || b.dataset.del); })[0];
    if (!r) return;
    if (b.hasAttribute('data-del')) { if (canDelete) removeResident(r); } else openForm(r);
  });

  load();
})();
