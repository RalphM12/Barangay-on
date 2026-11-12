// Resident pages: Documents, Complaints, Reports. File a new request and see your own list.
(function () {
  var app = $('#myApp');
  var api = app.dataset.api;
  var category = app.dataset.category;
  var rows = [];
  var meta = {};   // resident profile + today's date (documents form)

  // A resident who is not Registered yet cannot file anything: show why and lock the form (the server blocks it too)
  function applyVerification(status) {
    var form = $('#newForm'), box = $('#verifyBanner');
    if (!form) return;
    var blocked = status && status !== 'Registered';
    if (blocked && !box) {
      box = document.createElement('div');
      box.id = 'verifyBanner'; box.className = 'verify-banner'; box.setAttribute('role', 'status');
      form.parentNode.insertBefore(box, form);
    }
    if (box) {
      box.hidden = !blocked;
      box.innerHTML = status === 'Pending'
        ? '<b>Waiting for Verification.</b> The barangay office has not registered you yet. You can request documents, file complaints and send community reports once you are registered.'
        : '<b>Your resident record is not active.</b> Please contact the barangay office.';
    }
    if (blocked) form.setAttribute('inert', ''); else form.removeAttribute('inert');
    form.classList.toggle('is-locked', !!blocked);
  }

  async function load() {
    try {
      var d = await getJson(api + '?' + qs({ category: category }));
      if (!d) return;
      rows = d.rows;
      meta = d;
      applyVerification(d.profile && d.profile.status);
      window.docServices = d.services;

      var sel = $('#svc');
      if (sel && sel.options.length <= 1) {
        sel.innerHTML = '<option value="">Select the document you want to request</option>' + d.services.map(function (s) {
          return '<option value="' + Number(s.id) + '">' + esc(s.name) + '</option>';
        }).join('') + (category !== 'document' ? '<option value="other">Others (please specify)</option>' : '');
      }

      $('#myBody').innerHTML = d.rows.map(function (r) {
        return '<tr><td>' + esc(r.tracking_no) + '</td><td>' + esc(r.service) + '</td><td>' + badge(r.status) + '</td>' +
               '<td>' + fmtDate(r.created_at) + '</td>' +
               '<td><button type="button" class="btn-sm" data-view="' + Number(r.id) + '">View</button></td></tr>';
      }).join('') || '<tr><td colspan="5" class="muted">You have nothing here yet.</td></tr>';
    } catch (err) {
      showError(err.message);
    }
  }

  // Document-specific fill-up forms: each service has its own fields.
  var dfFields = $('#dfFields');
  if (dfFields) {
    var dynamicFields = $('#dfDynamicFields');
    function syncDoc() {
      var sel=$('#svc'), on=!!sel.value; dfFields.hidden=!on;
      if (!on) return;
      var name=sel.options[sel.selectedIndex].text; $('#documentTitle').textContent=name;
      var p = meta.profile || {};
      window.DocForms.render(dynamicFields, name, { name: p.name, address: p.address, contact: p.contact_no, birth: p.birthdate, civil: p.civil_status }, meta.today);
    }
    $('#svc').addEventListener('change',syncDoc);
    $('#newForm').addEventListener('reset',function(){setTimeout(syncDoc,0);});
    $('#newForm').addEventListener('submit',function(e){
      var sel=$('#svc'); if(!confirm('Submit this request?\n\n'+sel.options[sel.selectedIndex].text+'\nPlease check that all details are correct.')) { e.preventDefault(); e.stopImmediatePropagation(); }
    });
  }

  function documentSnapshot(details, service) {
    var pairs = [], has = {};
    String(details || '').split(/\r?\n/).forEach(function (line) {
      var i=line.indexOf(':'); if (i > 0) { var k=line.slice(0,i).trim(); pairs.push([k,line.slice(i+1).trim()]); has[k.toLowerCase()] = true; }
    });
    // Older or staff-entered requests were saved as plain text (no "Label: value" lines): still show them.
    var p = meta.profile || {};
    if (!pairs.length && String(details || '').trim()) pairs.push(['Purpose of Request', String(details).trim()]);
    var lead = [];
    if (!has['full name'] && !has["owner's name"] && p.name) lead.push(['Full Name', p.name]);
    if (!has['complete address'] && !has['business address'] && p.address) lead.push(['Complete Address', p.address]);
    if (!has['contact number'] && p.contact_no) pairs.push(['Contact Number', p.contact_no]);
    pairs = lead.concat(pairs).filter(function (f) { return !/^document type$/i.test(f[0]); });
    return '<div class="document-snapshot"><div class="document-heading"><div><span class="eyebrow">REQUEST DOCUMENTS</span><h2>' + esc(service || 'Barangay Document') + '</h2><p>Resident-submitted information</p></div></div>' +
      '<section class="document-section"><h3>Request Information</h3>' + (pairs.length ? '<div class="document-grid">' + pairs.map(function (f) {
        return '<div class="snapshot-field' + (/address|purpose|business name|nature of business|remarks/i.test(f[0]) ? ' wide' : '') + '"><span>' + esc(f[0]) + '</span><div>' + esc(f[1] || '—') + '</div></div>';
      }).join('') + '</div>' : '<p class="muted">No details were recorded for this request.</p>') + '</section></div>';
  }

  // Complaints / Reports: choosing "Others" shows a textbox to specify the type
  var otherWrap = $('#otherWrap');
  var otherText = $('#otherText');
  function syncOther() {
    if (!otherWrap) return;
    var on = $('#svc').value === 'other';
    otherWrap.hidden = !on;
    otherText.required = on;
    if (on) otherText.focus(); else otherText.value = '';
  }
  if ($('#svc')) $('#svc').addEventListener('change', syncOther);
  if ($('#newForm')) $('#newForm').addEventListener('reset', function () { setTimeout(syncOther, 0); });

  function shownStatus(r) { return r.status; }

  if ($('#newForm')) $('#newForm').addEventListener('submit', async function (e) {
    e.preventDefault();
    var form = new FormData(this);
    form.append('action', 'create');
    form.append('category', category);
    var btn = this.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      var res = await postForm(api, form);
      showToast('Submitted! Your tracking number is ' + res.tracking_no + '.');
      this.reset();
      load();
    } catch (err) {
      showToast(err.message, true);
    }
    btn.disabled = false;
  });

  $('#myBody').addEventListener('click', function (e) {
    var b = e.target.closest('[data-view]');
    if (!b) return;
    var r = rows.filter(function (x) { return Number(x.id) === Number(b.dataset.view); })[0];
    if (!r) return;
    openModal('Request Details',
      '<div class="request-meta"><span><b>Tracking No.:</b> ' + esc(r.tracking_no) + '</span><span><b>Status:</b> ' + badge(shownStatus(r)) + '</span><span><b>Date filed:</b> ' + fmtDate(r.created_at) + '</span></div>' +
      (category === 'document' ? documentSnapshot(r.details, r.service) : '<dl class="detail"><dt>Service</dt><dd>' + esc(r.service) + '</dd><dt>Status</dt><dd>' + badge(shownStatus(r)) + '</dd><dt>Date filed</dt><dd>' + fmtDate(r.created_at) + '</dd><dt>Last updated</dt><dd>' + fmtDate(r.updated_at) + '</dd><dt>Details</dt><dd class="pre">' + esc(r.details || 'No details provided.') + '</dd></dl>'));
  });

  // Coming from the dashboard "Online Services" cards: jump to the form
  var wantsNew = new URLSearchParams(location.search).get('new');
  load().then(function () {
    if (wantsNew && $('#svc')) $('#svc').focus();
  });
})();
