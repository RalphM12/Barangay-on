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
    signature: '/static/img/cert/signature.png',
    demo: false,                         // true = "SAMPLE - DEMO ONLY" watermark and footer; false = real forms
    assets: '/static/img/cert/',         // header banner, QR codes, icons taken from the barangay's Word templates
    email: 'stoninobaliwagcity@gmail.com',
    facebook: 'Barangay Sto.Niño',
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
    var full = (pick(v, ['full name', 'name', "owner's name", 'owner name']) || t.resident || '').trim();
    var parts = full.split(/\s+/);
    var typed = pick(v, ['first name']);                  // the application form asks for the three parts
    var first = typed || t.first_name || parts.slice(0, Math.max(1, parts.length - 1)).join(' ');
    var last = (typed && pick(v, ['last name'])) || t.last_name || (parts.length > 1 ? parts[parts.length - 1] : '');
    var middle = typed ? pick(v, ['middle name']) : (t.middle_name || '');
    if (/^none$/i.test(middle)) middle = '';
    return {
      first: first.toUpperCase(), middle: middle.toUpperCase(), last: last.toUpperCase(),
      captainName: t.signed_by || t.captain_name || '',
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

  /* ---------- the barangay's own Word templates (Clearance, Indigency, Residency) ---------- */
  function asset(f) { return CONFIG.assets + f; }

  function head2() {
    return '<div class="h2"><img class="h2-banner" src="' + asset('banner.png') + '" alt="">' +
      '<div class="h2-text"><b>Republic of the Philippines</b><b>Province of ' + esc(CONFIG.province) + '</b><b>City of Baliwag</b><b>Barangay Sto.Niño</b></div>' +
      '<div class="h2-office">Office of the Punong Barangay</div></div>';
  }

  function foot2() {
    return '<div class="f2"><span><img src="' + asset('gmail.png') + '" alt=""><u>' + esc(CONFIG.email) + '</u></span>' +
      '<span><img src="' + asset('facebook.png') + '" alt="">' + esc(CONFIG.facebook) + '</span></div>';
  }

  // "LABEL: value" with the value on a line, like the blanks of the Word form
  function f2(label, value, wide) { return '<div class="f2row"><b>' + label + ':</b> <span class="f2v' + (wide ? ' f2w' : '') + '">' + (value ? esc(value) : '&nbsp;') + '</span></div>'; }

  function address2(c, suffix) {
    var a = String(c.address || '').trim();
    var has = /sto\.?\s*ni[ñn]o/i.test(a);
    return '<div class="f2row"><b>ADDRESS:</b> <span class="f2v' + (has ? ' f2w' : '') + '">' + (a ? esc(has ? a.toUpperCase() : a) : '&nbsp;') + '</span>' + (has ? '' : ' ' + suffix) + '</div>';
  }

  function nameRows(c) { return f2('FIRST NAME', c.first) + f2('MIDDLE NAME', c.middle) + f2('LAST NAME', c.last); }

  // "this ____ day of ________ 2026": the day the Captain signed (so printing again never changes the date)
  function dayOf(c) {
    var d = c.signedOn || c.now;
    return '<span class="f2v f2s">' + ordinal(d.getDate()) + '</span> day of <span class="f2v f2m">' + MONTHS[d.getMonth()] + '</span> <b class="f2y">' + d.getFullYear() + '</b>';
  }

  function certifier(c) {
    var sig = c.signed ? '<img class="f2sig" src="' + (c.signature || CONFIG.signature) + '" alt="Signature of the Punong Barangay"' + (c.signedOn ? ' title="Signed on ' + longDate(c.signedOn) + '"' : '') + '>'
                       : '<span class="f2sigwait">Signature appears here once the Captain signs</span>';
    return '<div class="f2cert"><span>Certified By:</span><div class="f2sigbox">' + sig + '</div>' +
      '<div class="f2cap">' + (c.captainName ? esc(toTitle(c.captainName)) : '&nbsp;') + '</div><b>PUNONG BARANGAY</b></div>';
  }

  function applicant() { return '<div class="f2app"><div class="f2line"></div><span>Name and Signature of Applicant</span></div>'; }
  function thumbs() { return '<div class="f2thumbs"><div><span>Left<br>Thumbmark</span></div><div><span>Right<br>Thumbmark</span></div></div>'; }
  function valid2(kind, months) {
    return '<div class="f2note">This ' + kind + ' is valid for <i>' + months + ' months</i> from date of first issue. The Barangay reserves the right to revoke or cancel this certificate for any false statement or information given by the applicant.</div>';
  }

  /* ---------- Barangay Clearance ---------- */
  function clearance(c) {
    return head2() + '<h2 class="f2title">BARANGAY CLEARANCE</h2>' +
      '<div class="f2body"><p>To Whom it may concern:</p>' +
      '<p>This is to certify that the person whose name and details appear hereon has requested a CLEARANCE from this office and the results is/are listed below:</p>' +
      '<div class="f2fields">' + nameRows(c) + address2(c, 'BARANGAY STO.NIÑO BALIWAG CITY BULACAN') + f2('AGE', c.age === '' ? '' : String(c.age)) +
        f2('DATE OF BIRTH', c.birth ? longDate(c.birth) : '') + '<div class="f2row"><b>REMARKS:</b> <b class="f2rem">NO DEROGATORY RECORD</b></div>' + f2('PURPOSE', purposeText(c.purpose, false), true) + '</div>' +
      '<p class="f2gap">This certification is issued on this ' + dayOf(c) + ' at Barangay Sto.Niño Baliwag City, Bulacan.</p>' +
      '<div class="f2fields f2ctc">' + f2('Com. Tax Cert. No.', '') + f2('Issued on', '') + '</div></div>' +
      '<div class="f2sign">' + '<div class="f2left">' + applicant() + thumbs() + '</div>' + certifier(c) + '</div>' +
      '<div class="f2bottom"><img class="f2qr" src="' + asset('qr-clearance.png') + '" alt="QR code">' + valid2('Clearance', CONFIG.clearanceMonths) +
        '<b class="f2nv">NOT VALID WITHOUT OFFICIAL DRY SEAL</b></div>' + foot2();
  }

  /* ---------- Certificate of Indigency ---------- */
  var INDIGENCY_PURPOSES = [
    ['Medical Assistance', /medical|medicine|hospital/i], ['Financial Assistance', /financ|cash|aid/i], ['Anti-Rabies Vaccination', /rabies|vaccin/i],
    ['Legal Services', /legal|lawyer|court/i], ['Scholarship at Tulong sa Edukasyon', /scholar|tulong|educ|school/i], ['Death Burial', /burial|death|funeral/i]
  ];

  function box(on) { return '<span class="f2chk">(' + (on ? '&#10003;' : '&nbsp;&nbsp;') + ')</span>'; }

  function indigency(c) {
    var p = String(c.purpose || ''), hit = -1;
    INDIGENCY_PURPOSES.forEach(function (o, i) { if (hit < 0 && o[1].test(p)) hit = i; });
    var rows = INDIGENCY_PURPOSES.map(function (o, i) { return '<div>' + box(i === hit) + ' ' + o[0] + '</div>'; }).join('') +
      '<div>' + box(hit < 0 && p) + ' Others (specify): <span class="f2v f2w">' + (hit < 0 && p ? esc(p) : '&nbsp;') + '</span></div>';
    return head2() + '<h2 class="f2title">CERTIFICATE OF INDIGENCY</h2>' +
      '<div class="f2body"><p>TO WHOM IT MAY CONCERN:</p>' +
      '<p>This is to certify that the person whose name and details appear hereon is a <b>bona fide resident</b> of this barangay and belongs to an <b>INDIGENT FAMILY</b> and <b>low-income</b> families/resident of this Barangay.</p>' +
      '<div class="f2fields">' + nameRows(c) + address2(c, 'BARANGAY STO.NIÑO BALIWAG CITY BULACAN') + f2('AGE', c.age === '' ? '' : String(c.age)) + f2('DATE OF BIRTH', c.birth ? longDate(c.birth) : '') + '</div>' +
      '<div class="f2purp"><div>This CERTIFICATION is upon request of the above-named person for:</div>' + rows + '</div>' +
      '<p class="f2gap f2just">Signed and issued on this ' + dayOf(c) + ' at Barangay Sto.Niño Baliwag City Bulacan</p></div>' +
      '<div class="f2sign f2sign-ind">' + '<div class="f2left">' + applicant() + '</div>' + certifier(c) + '</div>' +
      '<div class="f2bottom f2bottom-ind"><img class="f2qr" src="' + asset('qr-indigency.png') + '" alt="QR code"><b class="f2nv">*NOT VALID WITHOUT OFFICIAL DRY SEAL</b></div>' + foot2();
  }

  /* ---------- Certificate of Residency ---------- */
  function residency(c) {
    return head2() + '<h2 class="f2title">CERTIFICATE OF RESIDENCY</h2>' +
      '<div class="f2body"><p>To Whom it may concern:</p>' +
      '<p>This is to certify that the person whose name and details appear hereon is a bona fide resident of this barangay and has been residing at the stated address for at least six (6) months prior to the application of this certification.</p>' +
      '<div class="f2fields">' + nameRows(c) + address2(c, 'BRGY. STO.NIÑO BALIWAG CITY BULACAN') + f2('DATE OF BIRTH', c.birth ? longDate(c.birth) : '') + f2('YEAR(S) OF RESIDENCY', c.since) + '</div>' +
      '<p class="f2gap">This <b>CERTIFICATION</b> has been issued upon the request of <span class="f2v f2w2">' + (c.name ? esc(toTitle(c.name)) : '&nbsp;') + '</span> for whatever legal purpose it may serve.</p>' +
      '<p class="f2just">Signed and issue this ' + dayOf(c) + ' at Barangay Hall of Sto.Niño Baliwag City Bulacan</p></div>' +
      '<div class="f2sign">' + '<div class="f2left">' + applicant() + thumbs() + '</div>' + certifier(c) + '</div>' +
      '<div class="f2bottom"><img class="f2qr" src="' + asset('qr-residency.png') + '" alt="QR code">' + valid2('RESIDENCY', CONFIG.residencyMonths) +
        '<b class="f2nv">NOT VALID WITHOUT OFFICIAL DRY SEAL</b></div>' + foot2();
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

  function certificateHtml(t, editable) {
    var c = collect(t), body, own = true;
    switch (t.service) {
      case 'Certificate of Residency': body = residency(c); break;
      case 'Certificate of Indigency': body = indigency(c); break;
      case 'Business Permit': case 'Business Permit Request': body = businessPermit(c); own = false; break;
      default: body = clearance(c);       // Barangay Clearance and any other document
    }
    if (own) {
      // editable: staff can click any blank line to type or correct it before printing
      if (editable) body = body.replace(/class="f2v/g, 'contenteditable="true" spellcheck="false" class="f2v').replace(/class="f2chk"/g, 'class="f2chk" role="checkbox" tabindex="0"');
      return '<div class="cert cert2' + (editable ? ' cert-edit' : '') + '" id="certSheet"><div class="c2in">' + body + '</div></div>';
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
    style.textContent = sheet.classList.contains('cert2') ? '@page { size: A4 portrait; margin: 0; }' : '@page { size: A4 portrait; margin: 8mm; }';
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

  // id = transaction id, api = //api/transactions
  window.openCertificate = async function (id, api, onPrinted) {
    try {
      var d = await getJson(api + '?id=' + encodeURIComponent(id));
      if (!d) return;
      var t = d.item;
      if (t.category !== 'document') return showToast('Only document requests can be printed.', true);
      if (onPrinted && !t.signed_at) return showToast('The Barangay Captain must sign this document before it can be printed.', true);
      var body = openModal('Print ' + t.service,
        '<div class="cert-note">Request <b>' + esc(t.tracking_no) + '</b> &middot; ' + (onPrinted ? 'signed by the Captain. Printing this document releases it automatically. ' : 'the form is filled in from the resident\'s request. ') + 'Click any blank line to type or correct it, then print.' + '</div>' +
        certificateHtml(t, true) +
        '<div class="modal-actions cert-actions"><button type="button" class="btn-primary" id="certPrint">' + (onPrinted ? 'Print &amp; release' : 'Print this certificate') + '</button>' +
        '<button type="button" class="btn-light" id="certClose">Close</button></div>');
      body.querySelector('#certPrint').addEventListener('click', function () { printCertificate(onPrinted ? function () { onPrinted(t.id); } : null); });
      body.querySelector('#certClose').addEventListener('click', closeModal);
      body.addEventListener('focusin', function (e) {    // an empty blank starts clean (no stray space before what you type)
        if (e.target.classList && e.target.classList.contains('f2v') && !e.target.textContent.trim()) e.target.innerHTML = '';
      });
      body.addEventListener('focusout', function (e) {
        if (e.target.classList && e.target.classList.contains('f2v') && !e.target.textContent.trim()) e.target.innerHTML = '&nbsp;';
      });
      body.addEventListener('click', function (e) {      // tick / untick the purpose boxes of the Certificate of Indigency
        var b = e.target.closest && e.target.closest('.f2chk');
        if (b) b.innerHTML = /10003|✓/.test(b.innerHTML) ? '(&nbsp;&nbsp;)' : '(&#10003;)';
      });
    } catch (err) {
      showToast(err.message, true);
    }
  };
})();
