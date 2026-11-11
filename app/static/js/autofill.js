// Staff autofill: "New document request" on the Document Requests page.
// Staff searches a registered resident -> the details are read from the database (/api/resident_lookup)
// and filled in. Nothing is invented: a field that is empty in the record stays empty and is flagged.
// A person who is NOT a registered resident can also be typed in: nothing is autofilled for them, staff types every detail.
// Staff reviews everything, types the purpose, and confirms before anything is saved (/api/transactions create_document).
(function () {
  var btn = $('#afNew');
  if (!btn) return;
  var lookupApi = btn.dataset.lookup;
  var txApi = btn.dataset.tx;
  var staffName = btn.dataset.staff;
  var services = null;

  async function loadServices() {
    if (services) return services;
    var d = await getJson(txApi + '?category=document&per_page=1');
    services = (d && d.services) || [];
    return services;
  }

  function resNo(id) { return 'RES-' + String(id).padStart(5, '0'); }

  // one read-only autofilled field; empty values stay empty and show "Not on record"
  function field(id, label, wide) {
    return '<label class="' + (wide ? 'wide' : '') + '">' + esc(label) + '<span class="af-tag auto" hidden data-tag="' + id + '">Autofilled</span>' +
      '<input type="text" id="' + id + '" readonly placeholder="Select a resident first"></label>';
  }

  async function open() {
    var list;
    try { list = await loadServices(); } catch (err) { return showToast('Could not load the certificate types. ' + err.message, true); }

    var html = '<form class="form" id="afForm" autocomplete="off">' +
      '<div class="af-search"><label>Search resident (name or contact number) - or type any name' +
      '<input type="search" id="afQ" role="combobox" aria-expanded="false" aria-controls="afList" aria-autocomplete="list" placeholder="Type at least 2 letters..."></label>' +
      '<ul class="af-list" id="afList" role="listbox" hidden></ul></div>' +
      '<label>Certificate type<select id="afSvc" required><option value="">Choose...</option>' +
      list.map(function (s) { return '<option value="' + Number(s.id) + '">' + esc(s.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="af-grid">' + field('afNo', 'Resident ID') + field('afStatus', 'Record status') + '</div>' +
      // the application form: the same fields, in the same order, as the form residents fill in (doc_forms.js)
      '<section class="af-docbox" id="afDoc" hidden><h4 id="afDocTitle"></h4><p class="af-hint">Same application form the resident fills in. Details found in the resident record are filled in for you; check them and complete the rest.</p>' +
      '<div class="document-grid af-doc" id="afFields"></div></section>' +
      '<div class="af-grid">' +
      '<label>Date of request<span class="af-tag auto">Autofilled</span><input type="text" id="afDate" readonly class="autofilled"></label>' +
      '<label>Processed by (your account)<span class="af-tag auto">Autofilled</span><input type="text" id="afStaff" readonly class="autofilled"></label></div>' +
      '<div class="set-note" id="afMsg">Search for a resident, choose the certificate type, then complete the form.</div>' +
      '<div class="form-actions"><button type="submit" class="btn-primary" id="afSave" disabled>Review &amp; save request</button>' +
      '<button type="button" class="btn-light" id="afCancel">Cancel</button></div></form>';

    var body = openModal('New Document Request', html);
    var q = body.querySelector('#afQ'), ul = body.querySelector('#afList'), svc = body.querySelector('#afSvc');
    var save = body.querySelector('#afSave'), msg = body.querySelector('#afMsg');
    var fields = body.querySelector('#afFields'), docBox = body.querySelector('#afDoc');
    var chosen = null, walkin = false, hits = [], active = -1, seq = 0;
    var known = {};          // what is known about the person: name, address, contact, birth, civil

    // the date comes from the server (the same clock that stamps the saved request), not from the browser
    var ds = /^(\d{4})-(\d{2})-(\d{2})$/.exec(btn.dataset.date || '');
    body.querySelector('#afDate').value = ds ? fmtDateObj(new Date(+ds[1], +ds[2] - 1, +ds[3])) : '';
    body.querySelector('#afStaff').value = staffName;
    body.querySelector('#afCancel').addEventListener('click', closeModal);

    function note(text, bad) { msg.textContent = text; msg.style.color = bad ? '#b42318' : ''; }

    // a resident who is not Registered, or has no address on record, cannot be saved (the server enforces the same rules)
    function eligible() {
      if (walkin) return true;                                                      // non-registered: the form itself asks for the details
      return !!(chosen && chosen.status === 'Registered' && String(chosen.address || '').trim());
    }
    function refresh() { save.disabled = !(eligible() && svc.value); }

    // show the resident's application form for the chosen certificate type, filled with what is known
    function renderForm() {
      if (!svc.value) { docBox.hidden = true; fields.innerHTML = ''; return refresh(); }
      var name = svc.options[svc.selectedIndex].text;
      body.querySelector('#afDocTitle').textContent = name + ' - application form';
      window.DocForms.render(fields, name, known, btn.dataset.date || '');
      docBox.hidden = false;
      refresh();
    }
    function applyKnown() { if (!docBox.hidden) window.DocForms.setPrefill(fields, known); }

    function todayParts() {
      var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(btn.dataset.date || '');
      var d = new Date();
      return m ? { y: +m[1], m: +m[2], d: +m[3] } : { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate() };
    }

    function setField(id, value) {
      var el = body.querySelector('#' + id), tag = body.querySelector('[data-tag="' + id + '"]');
      el.value = value || '';
      el.placeholder = chosen ? 'Not on record' : 'Select a resident first';
      el.classList.toggle('autofilled', !!value);
      if (tag) tag.hidden = !value;
    }

    function startWalkin() {
      var typed = q.value.trim();
      chosen = null;
      walkin = true;
      known = { name: typed, address: '', contact: '', birth: '', civil: '' };
      body.querySelector('#afNo').value = 'Not registered';
      body.querySelector('#afStatus').value = 'Not registered';
      ['afNo', 'afStatus'].forEach(function (id) { body.querySelector('#' + id).classList.remove('autofilled'); });
      applyKnown();
      note('Not a registered resident - nothing is autofilled. Type every detail in the form, then save.');
      refresh();
    }

    function fillResident(r) {
      chosen = r;
      walkin = false;
      setField('afNo', r.resident_no);
      setField('afStatus', r.status === 'Pending' ? 'Waiting for Verification' : r.status);
      known = {
        name: (r.first_name + ' ' + r.last_name).trim(), address: r.address || '', contact: r.contact_no || '',
        birth: /^\d{4}-\d{2}-\d{2}$/.test(r.birthdate || '') ? r.birthdate : '', civil: r.civil_status || ''
      };
      applyKnown();
      var problems = [];
      if (!r.address) problems.push('This resident has no address on record - add it on the Residents page first.');
      if (r.status !== 'Registered') problems.push('This resident is ' + (r.status === 'Pending' ? 'Waiting for Verification' : r.status) + ', not Registered yet. Register the resident on the Residents page first.');
      note(problems.length ? problems.join(' ') : 'Details from the resident record are filled in. Check them, complete the rest of the form, then save.', problems.length > 0);
      refresh();
    }

    function clearResident() {
      chosen = null;
      walkin = false;
      known = {};
      ['afNo', 'afStatus'].forEach(function (id) { setField(id, ''); });
      applyKnown();
      refresh();
    }

    function closeList() { ul.hidden = true; q.setAttribute('aria-expanded', 'false'); active = -1; }

    function showList(rows, text) {
      var typed = q.value.trim();
      hits = rows.concat([{ walkin: true }]);                 // last choice: use the typed name for a non-registered person
      var walkLi = '<li role="option" data-i="' + rows.length + '" aria-selected="false" class="walkin">Use &ldquo;' + esc(typed) +
        '&rdquo; as a non-registered person<small>Nothing is autofilled - you type the details</small></li>';
      if (!rows.length) {
        ul.innerHTML = '<li class="none">' + esc(text) + '</li>' + walkLi;
      } else {
        ul.innerHTML = rows.map(function (r, i) {
          return '<li role="option" data-i="' + i + '" aria-selected="false">' + esc(r.first_name + ' ' + r.last_name) +
            (r.status !== 'Registered' ? ' <small>(' + esc(r.status === 'Pending' ? 'Waiting for Verification' : r.status) + ')</small>' : '') +
            (r.same_name ? ' <small>(same name as another resident - check the address)</small>' : '') +
            '<small>' + esc(r.address || 'No address on record') + ' &middot; ' + esc(r.contact_no || 'No contact on record') + '</small></li>';
        }).join('') + walkLi;
      }
      ul.hidden = false;
      q.setAttribute('aria-expanded', 'true');
      active = -1;
    }

    async function search() {
      var text = q.value.trim();
      if (text.length < 2) return closeList();
      var mine = ++seq;
      try {
        var d = await getJson(lookupApi + '?' + qs({ q: text }));
        if (!d || mine !== seq) return;                       // an older answer arrived late
        showList(d.rows, 'No registered resident matches "' + text + '".');
      } catch (err) {
        showList([], 'Could not search right now. ' + err.message);
      }
    }

    // choose a suggestion: always re-read the record from the database before filling
    async function pick(i) {
      var h = hits[i];
      if (!h) return;
      closeList();
      if (h.walkin) return startWalkin();
      try {
        var d = await getJson(lookupApi + '?id=' + Number(h.id));
        if (!d) return;
        q.value = d.resident.first_name + ' ' + d.resident.last_name;
        fillResident(d.resident);
      } catch (err) {
        clearResident();
        note(err.message, true);
      }
    }

    q.addEventListener('input', function () {
      if (chosen || walkin) clearResident();                  // typing again means "pick someone else"
      debouncedSearch();
    });
    var debouncedSearch = debounce(search, 250);
    q.addEventListener('keydown', function (e) {
      var items = ul.querySelectorAll('li[data-i]');
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!items.length) return;
        e.preventDefault();
        active = (active + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
        items.forEach(function (li, n) { li.setAttribute('aria-selected', n === active ? 'true' : 'false'); });
        items[active].scrollIntoView({ block: 'nearest' });
      } else if (e.key === 'Enter' && !ul.hidden) {
        e.preventDefault();
        if (active > -1) pick(active);
      } else if (e.key === 'Escape' && !ul.hidden) {
        e.stopPropagation();
        closeList();
      }
    });
    ul.addEventListener('mousedown', function (e) {
      var li = e.target.closest('li[data-i]');
      if (li) { e.preventDefault(); pick(Number(li.dataset.i)); }
    });
    svc.addEventListener('change', renderForm);

    body.querySelector('#afForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (!chosen && !walkin) return note('Search for a registered resident, or choose "Use ... as a non-registered person".', true);
      if (!walkin && !eligible()) return note('This resident cannot be used until the record is Registered and has an address.', true);
      if (!svc.value) return note('Choose the certificate type.', true);
      if (!this.reportValidity()) return;                     // the browser points at the first field that is missing

      var data = new FormData(this);                          // only the application form fields carry a name
      var name = String(data.get('full_name') || data.get('owner_name') || '').trim();
      var addr = String(data.get('complete_address') || data.get('business_address') || '').trim();
      var purpose = String(data.get('purpose_other') || data.get('purpose') || '').trim();
      var svcName = svc.options[svc.selectedIndex].text;
      if (!confirm('Save this request?\n\n' + svcName + '\nName: ' + name + (walkin ? ' (NOT a registered resident)' : '') +
                   '\nAddress: ' + (addr || '-') + (purpose ? '\nPurpose: ' + purpose : ''))) return;

      async function send(extra) {
        var form = new FormData(body.querySelector('#afForm'));
        form.append('action', 'create_document');
        if (!form.get('full_name')) form.set('full_name', name);            // business permits have an owner, not a full name
        if (walkin) {
          form.append('walkin', '1');
          form.append('address', addr);
          form.append('contact_no', String(data.get('contact_number') || '').trim());
        } else {
          form.append('resident_id', chosen.id);
        }
        form.append('service_id', svc.value);
        if (extra) form.append('confirm_duplicate', '1');
        return postForm(txApi, form);
      }
      save.disabled = true;
      try {
        var res;
        try {
          res = await send(false);
        } catch (err) {
          if (/already has a pending/.test(err.message) && confirm(err.message + '\n\nCreate another request anyway?')) res = await send(true);
          else throw err;
        }
        showToast('Request ' + res.tracking_no + ' was saved.');
        closeModal();
        document.dispatchEvent(new Event('tx:reload'));
      } catch (err2) {
        note(err2.message, true);
        refresh();
      }
    });

    q.focus();
  }

  btn.addEventListener('click', open);
})();
