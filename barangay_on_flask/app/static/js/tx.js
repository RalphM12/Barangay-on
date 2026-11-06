// Transactions table used by: admin documents / complaints / community reports / transactions,
// and captain approvals / complaints / community reports.
// data-mode: manage (staff work the request) | view (read only: admin monitors) | sign (captain signs documents)
// Has a service filter (#txService) when the table is for one category, e.g. Document Requests
// data-bulk="1": check boxes + "Approve selected" (staff, pending documents) / "Sign selected" (captain, approved documents)
// Flow: staff Approve a pending document -> it goes to the captain automatically -> the captain signs it ->
//       it comes back to staff, who Release it -> it is Released and leaves this list (Transaction History page)
(function () {
  var app = $('#txApp');
  var api = app.dataset.api;
  var mode = app.dataset.mode;
  var actionApi = app.dataset.action;
  var PER = PAGE_SIZE; // rows per page: set in Settings > General
  var bulk = app.dataset.bulk === '1';
  var COLS = bulk ? 7 : 6;
  var selected = {};
  // Print is for staff only. Admin and captain get no Print button: when they open (View) a document request
  // they see the finished document as a read-only preview (certificate.js), and can still approve / sign as before.
  var staffPage = /\/staff\//.test(location.pathname);
  var canPrint = staffPage && mode === 'manage' && typeof window.openCertificate === 'function';
  var previewDocs = !staffPage && typeof window.certificateHtml === 'function';

  var params = new URLSearchParams(location.search);
  var state = {
    page: 1,
    q: $('#txSearch').value,
    status: params.get('status') || app.dataset.status || '',
    category: app.dataset.category || '',
    service: '',
    endorsed: mode === 'sign' ? '1' : ''   // the captain only sees documents staff approved that still wait for the captain's signature
  };
  var statusesReady = false;
  var servicesReady = false;

  function fillServices(list) {
    var sel = $('#txService');
    if (!sel) return;
    sel.innerHTML = '<option value="">All services</option>' + (list || []).map(function (s) {
      return '<option value="' + Number(s.id) + '">' + esc(s.name) + '</option>';
    }).join('');
    sel.value = state.service;
    servicesReady = true;
  }

  function fillStatuses(list) {
    var sel = $('#txStatus');
    sel.innerHTML = '<option value="">All statuses</option>' + list.map(function (s) {
      return '<option>' + esc(s) + '</option>';
    }).join('');
    sel.value = state.status;
    statusesReady = true;
  }

  function actionButtons(r) {
    var html = '<button type="button" class="btn-sm" data-view="' + Number(r.id) + '">View</button>';
    // Staff (documents): Pending -> only "Approve". Approved and waiting for the Captain -> no action yet.
    // Once the Captain has signed -> "Print": printing the signed document releases it automatically.
    if (mode === 'manage' && bulk && r.category === 'document' && r.status === 'Pending' && !r.endorsed_at) {
      html += '<button type="button" class="btn-sm ok" data-decide="approve" data-id="' + Number(r.id) + '">Approve</button>';
    }
    if (canPrint && r.category === 'document' && r.status === 'Approved' && r.signed_at) {
      html += '<button type="button" class="btn-sm ok" data-print="' + Number(r.id) + '">Print</button>';
    }
    if (mode === 'sign' && r.status === 'Approved' && !r.signed_at) {
      html += '<button type="button" class="btn-sm ok" data-decide="sign" data-id="' + Number(r.id) + '">Sign</button>';
    }
    return html;
  }

  // Documents: Pending -> Approved (sent to the captain automatically: "Waiting for the Captain's signature")
  //            -> signed by the captain ("Signed - ready to print &amp; release") -> Released
  function statusCell(r) {
    if (r.category !== 'document') return badge(r.status);
    if (r.status === 'Approved') {
      return badge('Approved') + (r.signed_at
        ? ' <small class="muted">Signed - ready to print &amp; release</small>'
        : ' <small class="muted">Waiting for the Captain\'s signature</small>');
    }
    if (r.status === 'Released') return badge('Released');
    return badge('Pending');
  }

  function selectedIds() { return Object.keys(selected); }

  function updateBulk() {
    var n = selectedIds().length;
    var btn = $('#txBulk');
    if (btn) {
      btn.disabled = !n;
      btn.textContent = (mode === 'sign' ? 'Sign selected' : 'Approve selected') + (n ? ' (' + n + ')' : '');
    }
    var all = $('#txAll');
    if (all) {
      var boxes = document.querySelectorAll('#txBody input[data-pick]');
      all.checked = boxes.length > 0 && Array.prototype.every.call(boxes, function (b) { return b.checked; });
      all.disabled = boxes.length === 0;
    }
  }

  async function load() {
    selected = {};
    try {
      var d = await getJson(api + '?' + qs({ q: state.q, status: state.status, category: state.category, service_id: state.service, endorsed: state.endorsed, page: state.page, per_page: PER }));
      if (!d) return;
      if (!statusesReady) fillStatuses(d.statuses);
      if (!servicesReady) fillServices(d.services);

      $('#txCount').textContent = d.total + ' record' + (d.total === 1 ? '' : 's');
      $('#txBody').innerHTML = d.rows.map(function (r) {
        var pick = '';
        if (bulk) {
          pick = '<td class="chk">' + (r.category === 'document' && (mode === 'sign' ? (r.status === 'Approved' && !r.signed_at) : (r.status === 'Pending' && !r.endorsed_at))
            ? '<input type="checkbox" data-pick="' + Number(r.id) + '" aria-label="Select ' + esc(r.tracking_no) + '">' : '') + '</td>';
        }
        return '<tr>' + pick + '<td>' + esc(r.tracking_no) + '</td><td>' + esc(r.service) + '</td><td>' + esc(r.resident) + '</td>' +
               '<td>' + statusCell(r) + '</td><td>' + fmtDate(r.created_at) + '</td>' +
               '<td class="actions">' + actionButtons(r) + '</td></tr>';
      }).join('') || '<tr><td colspan="' + COLS + '" class="muted">No records found.</td></tr>';
      updateBulk();

      renderPager($('#txPager'), d.page, d.per_page, d.total, function (p) { state.page = p; load(); });
    } catch (err) {
      showError('Could not load the list. ' + err.message);
    }
  }

  // Captain: sign one document, or several at once (ids = array)
  async function sign(ids) {
    var many = ids.length > 1;
    if (!confirm('Sign ' + (many ? ids.length + ' documents' : 'this document') + '? Signed documents go back to staff to print and release.')) return false;
    var form = new FormData();
    form.append('action', many ? 'sign_bulk' : 'sign');
    if (many) ids.forEach(function (i) { form.append('ids[]', i); }); else form.append('id', ids[0]);
    try {
      var res = await postForm(actionApi, form);
      showToast((res.signed || 1) + ' document' + ((res.signed || 1) === 1 ? '' : 's') + ' signed and sent back to staff to print and release.');
      closeModal();
      load();
      return true;
    } catch (err) {
      showToast(err.message, true);
      load();
      return false;
    }
  }

  // Staff with permission: approve one or several pending documents (Pending -> Approved)
  async function approve(ids) {
    var many = ids.length > 1;
    if (!confirm('Approve ' + (many ? ids.length + ' documents' : 'this document') + '? ' + (many ? 'They' : 'It') + ' will be sent to the Barangay Captain for signing, then back to you to print and release.')) return false;
    var form = new FormData();
    form.append('action', many ? 'bulk_approve' : 'approve');
    if (many) ids.forEach(function (i) { form.append('ids[]', i); }); else form.append('id', ids[0]);
    try {
      var res = await postForm(api, form);
      showToast(res.count + ' document' + (res.count === 1 ? '' : 's') + ' approved and sent to the Captain for signing.' + (res.skipped ? ' ' + res.skipped + ' skipped (already processed).' : ''));
      closeModal();
      load();
      return true;
    } catch (err) {
      showToast(err.message, true);
      load();                                         // the list may be out of date: refresh it
      return false;
    }
  }

  // Called by certificate.js right after the signed document has been printed: release it automatically.
  async function releaseAfterPrint(id) {
    var form = new FormData();
    form.append('action', 'release');
    form.append('id', id);
    try {
      var res = await postForm(api, form);
      showToast((res.tracking_no || 'The document') + ' was printed and released. It moved to Transaction History.');
      closeModal();
      load();
    } catch (err) {
      showToast(err.message, true);
      load();
    }
  }

  // The resident's request shown read-only, laid out like the form the resident filled in
  function requestForm(t) {
    var pairs = [], has = {};
    String(t.details || '').split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':'); if (i < 1) return;
      var k = line.slice(0, i).trim(), v = line.slice(i + 1).trim();
      pairs.push([k, v]); has[k.toLowerCase()] = true;
    });
    // requests filed by staff or older requests: fill the basics from the resident record
    var lead = [];
    if (!has['full name'] && !has['name'] && !has["owner's name"]) lead.push(['Full Name', t.resident]);
    if (!has['complete address'] && !has['complete residential address'] && !has['business address']) lead.push(['Complete Address', t.address]);
    if (!pairs.length && t.details) pairs.push(['Purpose', t.details]);
    if (!has['contact number'] && t.contact_no) pairs.push(['Contact Number', t.contact_no]);
    pairs = lead.concat(pairs);
    var half = /^(full name|date of birth|age|civil status|number of household members|contact number)$/i;
    var cells = pairs.filter(function (f) { return !/^document type$/i.test(f[0]); }).map(function (f) {
      var v = f[1];
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) v = v.slice(8) + '/' + v.slice(5, 7) + '/' + v.slice(0, 4);   // dd/mm/yyyy like the form
      return '<div class="vf-item' + (half.test(f[0]) ? '' : ' wide') + '"><span>' + esc(f[0]) + '</span><div>' + esc(v || '—') + '</div></div>';
    }).join('');
    return '<div class="view-form"><div class="vf-head"><span class="vf-eyebrow">Barangay Document Services</span><h2>' + esc(t.service) + '</h2><p>Information submitted by the resident.</p></div>' +
      '<section class="vf-card"><h3>Request Information</h3><div class="vf-grid">' + cells + '</div></section></div>';
  }

  async function openDetail(id) {
    try {
      var d = await getJson(api + '?id=' + encodeURIComponent(id));
      if (!d) return;
      var t = d.item;

      var html;
      if (t.category === 'document') {
        html = '<div class="request-meta"><span><b>Tracking No.:</b> ' + esc(t.tracking_no) + '</span><span><b>Status:</b> ' + statusCell(t) + '</span><span><b>Date filed:</b> ' + fmtDate(t.created_at) + '</span></div>' +
          (previewDocs
            // admin / captain: the request information and the printable document side by side (read-only)
            ? '<div class="view-split"><div class="vs-info">' + requestForm(t) + '</div>' +
              '<div class="vs-doc"><div class="vs-title">Print Preview</div>' + window.certificateHtml(t) + '</div></div>'
            : requestForm(t));
      } else {
      html = '<dl class="detail">' +
        '<dt>Request ID</dt><dd>' + esc(t.tracking_no) + '</dd>' +
        '<dt>Service</dt><dd>' + esc(t.service) + ' <small class="muted">(' + esc(CATEGORY_LABELS[t.category] || t.category) + ')</small></dd>' +
        '<dt>Resident</dt><dd>' + esc(t.resident) + ' <small class="muted">(RES-' + String(t.resident_id).padStart(5, '0') + ')</small></dd>' +
        '<dt>Address</dt><dd>' + esc(t.address || '-') + '</dd>' +
        '<dt>Contact</dt><dd>' + esc(t.contact_no || '-') + '</dd>' +
        '<dt>Status</dt><dd>' + (t.category === 'document' ? statusCell(t) : badge(t.status)) + '</dd>' +
        '<dt>Date filed</dt><dd>' + fmtDate(t.created_at) + '</dd>' +
        '<dt>Last updated</dt><dd>' + fmtDate(t.updated_at) + '</dd>' +
        (t.approved_at ? '<dt>Approved on</dt><dd>' + fmtDate(t.approved_at) + (t.approved_by ? ' <small class="muted">by ' + esc(t.approved_by) + '</small>' : '') + '</dd>' : '') +
        (t.released_at ? '<dt>Released on</dt><dd>' + fmtDate(t.released_at) + ' ' + fmtTimeObj(toDate(t.released_at)) + '</dd>' : '') +
        (t.released_by ? '<dt>Released by</dt><dd>' + esc(t.released_by) + '</dd>' : '') +
        (t.signed_by ? '<dt>Signed by</dt><dd>' + esc(t.signed_by) + (t.signed_at ? ' <small class="muted">on ' + fmtDate(t.signed_at) + '</small>' : '') + '</dd>' : '') +
        '<dt>Details</dt><dd class="pre">' + esc(t.details || 'No details provided.') + '</dd></dl>';
      }

      if (mode === 'manage' && d.can_approve) {
        html += '<div class="modal-actions"><button type="button" class="btn-ok" id="mdApprove">Approve</button></div>';
      }
      if (mode === 'manage' && d.can_edit && t.category !== 'document') {
        html += '<div class="status-edit"><select id="mdStatus">' + d.allowed_statuses.map(function (s) {
          return '<option' + (s === t.status ? ' selected' : '') + '>' + esc(s) + '</option>';
        }).join('') + '</select><button type="button" class="btn-primary" id="mdSave">Update status</button></div>' +
        '';
      }
      if (canPrint && t.category === 'document' && d.can_release) {   // signed by the Captain: print = release
        html += '<div class="modal-actions"><button type="button" class="btn-ok" id="mdPrint">Print</button></div>';
      }
      if (mode === 'sign' && d.can_sign) {
        html += '<div class="modal-actions"><button type="button" class="btn-ok" id="mdSign">Sign document</button></div>';
      }

      var body = openModal('Transaction Details', html);

      var save = body.querySelector('#mdSave');
      if (save) save.addEventListener('click', async function () {
        save.disabled = true;
        var form = new FormData();
        form.append('action', 'update_status');
        form.append('id', t.id);
        var newStatus = body.querySelector('#mdStatus').value;
        form.append('status', newStatus);
        try {
          await postForm(api, form);
          showToast('Status updated.');
          closeModal();
          load();
        } catch (err) {
          showToast(err.message, true);
          save.disabled = false;
        }
      });
      var pr = body.querySelector('#mdPrint');
      if (pr) pr.addEventListener('click', function () { window.openCertificate(t.id, api, releaseAfterPrint); });
      var ap = body.querySelector('#mdApprove');
      if (ap) ap.addEventListener('click', function () { approve([t.id]); });
      var sg = body.querySelector('#mdSign');
      if (sg) sg.addEventListener('click', function () { sign([t.id]); });
    } catch (err) {
      showToast(err.message, true);
    }
  }

  $('#txBody').addEventListener('click', function (e) {
    var v = e.target.closest('[data-view]');
    if (v) return openDetail(v.dataset.view);
    var pr = e.target.closest('[data-print]');
    if (pr) return window.openCertificate(pr.dataset.print, api, releaseAfterPrint);
    var d = e.target.closest('[data-decide]');
    if (!d) return;
    if (d.dataset.decide === 'approve') approve([d.dataset.id]);
    else sign([d.dataset.id]);
  });

  if (bulk) {
    $('#txBody').addEventListener('change', function (e) {
      var b = e.target.closest('input[data-pick]');
      if (!b) return;
      if (b.checked) selected[b.dataset.pick] = true; else delete selected[b.dataset.pick];
      updateBulk();
    });
    $('#txAll').addEventListener('change', function () {
      var on = this.checked;
      selected = {};
      document.querySelectorAll('#txBody input[data-pick]').forEach(function (b) {
        b.checked = on;
        if (on) selected[b.dataset.pick] = true;
      });
      updateBulk();
    });
    $('#txBulk').addEventListener('click', function () {
      var ids = selectedIds();
      if (!ids.length) return;
      if (mode === 'sign') sign(ids); else approve(ids);
    });
  }

  $('#txSearch').addEventListener('input', debounce(function () {
    state.q = this.value.trim();
    state.page = 1;
    load();
  }, 300));
  $('#txStatus').addEventListener('change', function () { state.status = this.value; state.page = 1; load(); });
  var svc = $('#txService');
  if (svc) svc.addEventListener('change', function () { state.service = this.value; state.page = 1; load(); });
  var cat = $('#txCategory');
  if (cat) {
    cat.value = state.category;
    cat.addEventListener('change', function () { state.category = this.value; state.page = 1; load(); });
  }

  document.addEventListener('tx:reload', load);   // after the staff autofill form saves a new request

  load().then(function () {
    if (params.get('id')) openDetail(params.get('id'));
  });
})();
