// Printable documents, filled in automatically from a resident's document request.
// Used by tx.js: the staff "Print" button calls openCertificate(id, api) and sees the barangay's form
// (Barangay Clearance, Certificate of Indigency, Certificate of Residency, Barangay Business Permit)
// already populated with what the resident submitted. It is only a preview until staff press "Print".
(function () {
  // ---- Edit these to match your barangay ---------------------------------------------------------------
  var CONFIG = {
    province: 'Bulacan',
    municipality: 'Baliuag',
    barangay: 'Barangay Sto Niño',     // shown as BARANGAY STO NIÑO on the header
    // Sample signature of the Punong Barangay. It is placed on the document AUTOMATICALLY once the Captain presses
    // "Sign" (the request then has a signed_at date). To use the real signature, replace this value with the URL
    // or data URI of a transparent PNG / SVG of the Captain's signature.
    signature: "data:image/svg+xml;utf8,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 240 90%22%3E%3Cg fill=%22none%22 stroke=%22%231b3a8f%22 stroke-width=%223%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22%3E%3Cpath d=%22M14 62C26 30 40 14 48 16C56 18 40 54 34 68C30 76 40 70 52 52C58 42 64 40 62 48C60 56 62 60 70 52C76 46 80 44 80 50C80 56 86 56 94 46%22/%3E%3Cpath d=%22M98 52C104 40 108 36 108 44C108 52 114 54 122 42C128 34 132 36 130 46C128 56 138 56 150 40%22/%3E%3Cpath d=%22M152 44C164 30 176 26 176 34C176 44 160 56 164 62C168 68 190 50 206 36%22/%3E%3Cpath d=%22M20 74C70 66 140 70 224 62%22 stroke-width=%222%22/%3E%3C/g%3E%3C/svg%3E",
    demo: true,                          // true = "SAMPLE - DEMO ONLY" watermark and footer; set false for real use
    clearanceMonths: 6,                  // Barangay Clearance validity
    indigencyMonths: 3,                  // Certificate of Indigency validity
    residencyMonths: 6,                  // Certificate of Residency validity
    // Barangay Business Permit: assessment of fees (edit the names / amounts to match your barangay ordinance)
    businessFees: [
      ['Barangay Business Clearance Fee', 500],
      ['Barangay Permit Fee', 300],
      ['Garbage Collection Fee', 200],
      ['Community / Peace & Order Fee', 150],
      ['Documentary Stamp', 30]
    ]
  };
  // The Punong Barangay is NOT set here: it comes from the Captain account in the system.
  // ------------------------------------------------------------------------------------------------------

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // "Full Name: Juan\nPurpose of Request: Medical" -> { 'full name': 'Juan', 'purpose of request': 'Medical' }
  function parseDetails(text) {
    var values = {};
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var i = line.indexOf(':');
      if (i > -1) values[line.slice(0, i).trim().toLowerCase()] = line.slice(i + 1).trim();
    });
    return values;
  }

  function pick(values, keys) {
    for (var i = 0; i < keys.length; i++) if (values[keys[i]]) return values[keys[i]];
    return '';
  }

  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  function parseDate(str) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
    if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
    var d = str ? new Date(str) : null;
    return d && !isNaN(d) ? d : null;
  }

  function longDate(d) { return d ? MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() : ''; }

  function addMonths(d, n) {
    var r = new Date(d.getFullYear(), d.getMonth() + n, 1);
    r.setDate(Math.min(d.getDate(), new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
    return r;
  }

  function ageOf(birth) {
    if (!birth) return '';
    var t = new Date(), a = t.getFullYear() - birth.getFullYear();
    if (t.getMonth() < birth.getMonth() || (t.getMonth() === birth.getMonth() && t.getDate() < birth.getDate())) a--;
    return a >= 0 && a < 130 ? a : '';
  }

  // "Purpose" as it reads on the form: EMPLOYMENT PURPOSES / FINANCIAL ASSISTANCE
  function purposeText(p, withPurposes) {
    var up = String(p || '').toUpperCase();
    if (!up) return '';
    return withPurposes && /^(EMPLOYMENT|TRAVEL|IDENTIFICATION|SCHOOL ENROLLMENT)$/.test(up) ? up + ' PURPOSES' : up;
  }

  // A value on the form, or an underlined blank when the request does not have it
  function val(v) { return v ? esc(v) : '<span class="blank">&nbsp;</span>'; }

  function logo() { return '<div class="clogo"><div>LOGO</div></div>'; }
  function seal() { return '<div class="cseal"><div>DRY SEAL</div></div>'; }

  function header(lines, big) {
    return '<div class="chead">' + logo() + '<div class="ctitle">' + lines.map(function (l) { return '<div>' + esc(l) + '</div>'; }).join('') +
      big + '</div>' + logo() + '</div>';
  }

  function barangayHeader() {
    return header(['Republic of the Philippines', 'Province of ' + CONFIG.province, 'Municipality of ' + CONFIG.municipality],
      '<b>' + esc(CONFIG.barangay.toUpperCase()) + '</b>') +
      '<div class="coffice"><strong>OFFICE OF THE PUNONG BARANGAY</strong></div>';
  }

  function footer(note) {
    return '<div class="cfoot"><em>' + esc(note) + '</em></div>' +
      (CONFIG.demo ? '<div class="cdemo">SAMPLE for academic / demo purposes only. No legal effect.</div>' : '');
  }

  // Information used by every document, taken from what the resident typed (api: transactions.php?id=)
  function collect(t) {
    var v = parseDetails(t.details);
    var now = new Date();
    var plain = !Object.keys(v).length ? String(t.details || '').trim() : '';
    var app = pick(v, ['application type']);
    var birth = parseDate(pick(v, ['date of birth']) || t.birthdate);
    var civil = pick(v, ['civil status']) || t.civil_status || '';
    return {
      now: now,
      name: (pick(v, ['full name', 'name', "owner's name", 'owner name']) || t.resident || '').toUpperCase(),
      address: pick(v, ['complete address', 'complete residential address', 'business address', 'address']) || t.address || '',
      purpose: pick(v, ['purpose of request', 'purpose', 'remarks']) || plain || (app ? 'Business permit (' + app + ')' : ''),
      since: pick(v, ['year or date you started residing in the barangay', 'residency start', 'residing since']),
      birth: birth,
      age: ageOf(birth),
      civil: civil,
      businessName: pick(v, ['business name']),
      nature: pick(v, ['nature of business']),
      ownership: pick(v, ['business type']),
      control: t.tracking_no || '',
      permitNo: 'BBP-' + now.getFullYear() + '-' + String(t.id || '').padStart(6, '0'),
      day: ordinal(now.getDate()), month: MONTHS[now.getMonth()], year: now.getFullYear(),
      captain: (t.signed_by || t.captain_name || '').toUpperCase(),
      signed: !!t.signed_at,
      signature: t.signature || '',
      signedOn: t.signed_at ? parseDate(t.signed_at) : null,
      preparedBy: t.approved_by || '',
      preparedPos: t.approved_by_position || ''
    };
  }

  function whoLine(c) {
    // JUAN M. DELA CRUZ, 21 years old, single, Filipino citizen,
    return '<b>' + (c.name ? esc(c.name) : '<span class="blank wide">&nbsp;</span>') + '</b>' +
      (c.age !== '' ? ', ' + c.age + ' years old' : '') + (c.civil ? ', ' + esc(c.civil.toLowerCase()) : '') + ', Filipino citizen';
  }

  function meta(c, valid) {
    return '<div class="cmeta"><div><b>Control No.:</b> <span>' + val(c.control) + '</span></div>' +
      '<div><b>Date Issued:</b> <span>' + longDate(c.now) + '</span></div>' +
      '<div><b>Valid Until:</b> <span>' + longDate(valid) + '</span></div></div>';
  }

  function issued(c) {
    return '<p class="ind">Issued this <b>' + esc(c.day) + ' day of ' + esc(c.month) + ', ' + c.year + '</b> at ' + esc(CONFIG.barangay) + ', ' +
      esc(CONFIG.municipality) + ', ' + esc(CONFIG.province) + ', Philippines.</p>';
  }

  // The Captain's signature line: once the Captain has signed, the signature image is placed on the line automatically
  function captainLine(c) {
    var inner = c.signed
      ? '<img class="csigimg" src="' + (c.signature || CONFIG.signature) + '" alt="Signature of the Punong Barangay" title="Signed' +
        (c.signedOn ? ' on ' + longDate(c.signedOn) : '') + '">'
      : '<span class="csig-pending">Signature will appear here once the Captain signs</span>';
    return '<div class="cline">' + inner + '</div>';
  }

  // Punong Barangay (the Captain account) + who prepared the document
  function certifiedBy(c) {
    return '<div class="ccert"><em>Certified by:</em>' + captainLine(c) +
      '<div class="cname2">HON. ' + (c.captain ? esc(c.captain) : '&nbsp;') + '</div><div class="crole">Punong Barangay</div>' +
      '<div class="cprep"><em>Prepared by:</em><b>' + (c.preparedBy ? esc(c.preparedBy) : '&nbsp;') + '</b><span>' +
      (c.preparedBy ? esc(c.preparedPos || 'Barangay Staff') : '&nbsp;') + '</span></div></div>';
  }

  function detailsTable(rows) {
    // rows: [[label, value, label, value], ...]
    return '<div class="ctab"><div class="cth">RESIDENT DETAILS</div>' + rows.map(function (r) {
      return '<div class="ctr"><div class="ch"><b>' + r[0] + '</b><span>' + val(r[1]) + '</span></div>' +
        '<div class="ch">' + (r[2] ? '<b>' + r[2] + '</b><span>' + val(r[3]) + '</span>' : '') + '</div></div>';
    }).join('') + '</div>';
  }

  /* ---------- Barangay Clearance ---------- */
  function clearance(c) {
    var valid = addMonths(c.now, CONFIG.clearanceMonths);
    return barangayHeader() + '<h2 class="cname">BARANGAY CLEARANCE</h2>' +
      '<div class="ctop">' + '<div>' + meta(c, valid) + '<div class="cwhom">TO WHOM IT MAY CONCERN:</div></div>' +
      '<div class="cphoto"><span>1x1 / 2x2 PHOTO</span></div></div>' +
      '<div class="cbody">' +
        '<p class="ind">This is to certify that ' + whoLine(c) + ', and a bonafide resident of <b>' + val(c.address) + '</b>, has been found to have <b>no derogatory record</b> on file in this barangay as of this date.</p>' +
        '<p class="ind">This clearance is issued upon the request of the above-named person for <b>' + val(purposeText(c.purpose, true)) + '</b>.</p>' +
        issued(c) +
        detailsTable([
          ['Full Name', c.name ? toTitle(c.name) : '', 'Purpose', c.purpose],
          ['Date of Birth', longDate(c.birth), 'CTC No.', ''],
          ['Place of Birth', '', 'OR No.', ''],
          ['Civil Status', c.civil, 'Amount Paid', ''],
          ['Citizenship', 'Filipino', '', '']
        ]) +
      '</div>' +
      '<div class="csign"><div class="cres"><div class="cline"></div><em>Resident\'s Signature</em><div class="cthumb"><span>R. Thumb</span></div></div>' +
        seal() + certifiedBy(c) + '</div>' + footer('(Not valid without official dry seal)');
  }

  /* ---------- Certificate of Indigency ---------- */
  function indigency(c) {
    var valid = addMonths(c.now, CONFIG.indigencyMonths);
    return barangayHeader() + '<h2 class="cname">CERTIFICATE OF INDIGENCY</h2>' + meta(c, valid) +
      '<div class="cbody"><div class="cwhom">TO WHOM IT MAY CONCERN:</div>' +
        '<p class="ind">This is to certify that ' + whoLine(c) + ', and a bonafide resident of <b>' + val(c.address) + '</b>, belongs to the <b>indigent families</b> of this barangay.</p>' +
        '<p class="ind">Based on the records and personal knowledge of this office, the above-named person has no regular source of income and is unable to meet the basic needs of the family.</p>' +
        '<p class="ind">This certification is issued upon the request of the above-named person for <b>' + val(purposeText(c.purpose, false)) + '</b> and for whatever legal purpose it may serve.</p>' +
        issued(c) + '</div>' +
      '<div class="csign"><div class="cres"><div class="cline"></div><em>Signature of Requesting Party</em>' +
        '<div class="cnos"><div>CTC No.: <span class="blank">&nbsp;</span></div><div>OR No.: <span class="blank">&nbsp;</span></div></div></div>' +
        seal() + certifiedBy(c) + '</div>' + footer('(Not valid without official dry seal)');
  }

  /* ---------- Certificate of Residency (same style as the two above) ---------- */
  function residency(c) {
    var valid = addMonths(c.now, CONFIG.residencyMonths);
    return barangayHeader() + '<h2 class="cname">CERTIFICATE OF RESIDENCY</h2>' + meta(c, valid) +
      '<div class="cbody"><div class="cwhom">TO WHOM IT MAY CONCERN:</div>' +
        '<p class="ind">This is to certify that ' + whoLine(c) + ', is a bonafide resident of <b>' + val(c.address) + '</b>' +
          (c.since ? ', and has been residing in this barangay since <b>' + esc(c.since) + '</b>' : '') + '.</p>' +
        '<p class="ind">This certification is issued upon the request of the above-named person for <b>' + val(purposeText(c.purpose, true)) + '</b> and for whatever legal purpose it may serve.</p>' +
        issued(c) + '</div>' +
      '<div class="csign"><div class="cres"><div class="cline"></div><em>Signature of Requesting Party</em>' +
        '<div class="cnos"><div>CTC No.: <span class="blank">&nbsp;</span></div><div>OR No.: <span class="blank">&nbsp;</span></div></div></div>' +
        seal() + certifiedBy(c) + '</div>' + footer('(Not valid without official dry seal)');
  }

  /* ---------- Barangay Business Permit (own layout: business information, assessment of fees, prepared / approved by) ---------- */
  function money(n) { return Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  function businessPermit(c) {
    var end = new Date(c.now.getFullYear(), 11, 31);
    var info = [
      ['Business Name', c.businessName],
      ['Owner / Proprietor', c.name ? toTitle(c.name) : ''],
      ['Business Address', c.address],
      ['Nature of Business', c.nature],
      ['Form of Ownership', c.ownership],
      ['DTI Reg. No.', ''],
      ['Brgy. Clearance No.', ''],
      ['TIN', '']
    ];
    var total = CONFIG.businessFees.reduce(function (a, f) { return a + f[1]; }, 0);
    return header(['Republic of the Philippines', 'Province of ' + CONFIG.province, 'Municipality of ' + CONFIG.municipality],
        '<b>' + esc(CONFIG.barangay.toUpperCase()) + '</b>') +
      '<div class="coffice"><strong>OFFICE OF THE PUNONG BARANGAY</strong><small>Barangay Business Permit Section</small></div>' +
      '<h2 class="cname cname-sm">BARANGAY BUSINESS PERMIT</h2><div class="csub">(Barangay Business Clearance)</div>' +
      '<div class="ctop ctop-permit"><div class="cmeta"><div><b>Permit No.:</b> <span>' + esc(c.permitNo) + '</span></div>' +
        '<div><b>Date Issued:</b> <span>' + longDate(c.now) + '</span></div>' +
        '<div><b>Valid Until:</b> <span>' + longDate(end) + '</span></div></div>' +
      '<div class="cphoto"><span>QR CODE / PHOTO</span></div></div>' +
      '<div class="cbody cbody-permit">' +
        '<p class="ind">Pursuant to the Local Government Code and existing barangay ordinances, permission is hereby granted to <b>' + val(c.name) + '</b> to operate and engage in the business described below:</p>' +
        '<div class="cbt"><div class="cth">BUSINESS INFORMATION</div>' + info.map(function (r) {
          return '<div class="cbr"><b>' + r[0] + '</b><span>' + val(r[1]) + '</span></div>';
        }).join('') + '</div>' +
        '<div class="cbt cfees"><div class="cth"><span>ASSESSMENT OF FEES</span><span>AMOUNT (PHP)</span></div>' + CONFIG.businessFees.map(function (f) {
          return '<div class="cfr"><span>' + esc(f[0]) + '</span><span>' + money(f[1]) + '</span></div>';
        }).join('') + '<div class="cfr ctotal"><span>TOTAL</span><span>' + money(total) + '</span></div></div>' +
        '<div class="cor">O.R. No.: <span class="blank">&nbsp;</span> &nbsp; Date Paid: <span class="blank">&nbsp;</span></div>' +
        '<p class="ind">This barangay permit must be posted in a conspicuous place within the business establishment and is <b>not transferable</b>. It does not take the place of the Mayor\'s Permit and may be revoked for violation of any barangay ordinance.</p>' +
      '</div>' +
      '<div class="csign csign-permit">' +
        '<div class="cres"><em>Prepared by:</em><div class="cline"></div><div class="cname2">' + (c.preparedBy ? esc(c.preparedBy.toUpperCase()) : '&nbsp;') + '</div>' +
          '<div class="crole">' + (c.preparedBy ? esc(c.preparedPos || 'Barangay Staff') : '&nbsp;') + '</div></div>' +
        seal() +
        '<div class="ccert"><em>Approved by:</em>' + captainLine(c) + '<div class="cname2">HON. ' + (c.captain ? esc(c.captain) : '&nbsp;') + '</div><div class="crole">Punong Barangay</div></div>' +
      '</div>' + footer('(Not valid without official barangay dry seal and official receipt)');
  }

  function toTitle(s) {
    return String(s || '').toLowerCase().replace(/(^|[\s.\-'])([a-zñ])/g, function (m, a, b) { return a + b.toUpperCase(); });
  }

  function certificateHtml(t) {
    var c = collect(t), body;
    switch (t.service) {
      case 'Certificate of Residency': body = residency(c); break;
      case 'Certificate of Indigency': body = indigency(c); break;
      case 'Business Permit': case 'Business Permit Request': body = businessPermit(c); break;
      default: body = clearance(c);       // Barangay Clearance and any other document
    }
    return '<div class="cert" id="certSheet"><div class="cframe">' + (CONFIG.demo ? '<div class="cwm" aria-hidden="true">SAMPLE - DEMO ONLY</div>' : '') + body + '</div></div>';
  }

  // Print only the certificate: it is copied into #printRoot (the rest of the page is hidden by pages.css)
  // onPrinted (optional) runs once the print dialog closes, e.g. tx.js uses it to release the document automatically
  function printCertificate(onPrinted) {
    var sheet = document.getElementById('certSheet');
    if (!sheet) return;
    ['printRoot', 'printPage'].forEach(function (id) { var o = document.getElementById(id); if (o) o.remove(); });
    var root = document.createElement('div');
    root.id = 'printRoot';
    root.innerHTML = sheet.outerHTML;
    var style = document.createElement('style');
    style.id = 'printPage';
    style.textContent = '@page { size: A4 portrait; margin: 8mm; }';
    document.body.appendChild(style);
    document.body.appendChild(root);
    var cleanup = function () {
      root.remove(); style.remove(); window.removeEventListener('afterprint', cleanup);
      if (typeof onPrinted === 'function') onPrinted();
    };
    window.addEventListener('afterprint', cleanup);
    window.print();
  }

  window.certificateHtml = certificateHtml;   // used for previews/tests

  // id = transaction id, api = /api/transactions.php
  window.openCertificate = async function (id, api, onPrinted) {
    try {
      var d = await getJson(api + '?id=' + encodeURIComponent(id));
      if (!d) return;
      var t = d.item;
      if (t.category !== 'document') return showToast('Only document requests can be printed.', true);
      if (onPrinted && !t.signed_at) return showToast('The Barangay Captain must sign this document before it can be printed.', true);
      var body = openModal('Print ' + t.service,
        '<div class="cert-note">Request <b>' + esc(t.tracking_no) + '</b> &middot; ' + (onPrinted ? 'signed by the Captain. Printing this document releases it automatically.' : 'the form is filled in from the resident\'s request. Check it, then print.') + '</div>' +
        certificateHtml(t) +
        '<div class="modal-actions cert-actions"><button type="button" class="btn-primary" id="certPrint">' + (onPrinted ? 'Print &amp; release' : 'Print this certificate') + '</button>' +
        '<button type="button" class="btn-light" id="certClose">Close</button></div>');
      body.querySelector('#certPrint').addEventListener('click', function () { printCertificate(onPrinted ? function () { onPrinted(t.id); } : null); });
      body.querySelector('#certClose').addEventListener('click', closeModal);
    } catch (err) {
      showToast(err.message, true);
    }
  };
})();
