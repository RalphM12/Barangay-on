// Captain dashboard: "My E-Signature". Shows the current signature and lets the captain change it by
// drawing, typing their name, or uploading a picture. Saved through the same account API as
// Settings > Account & Security (action save_signature / clear_signature), so both places stay in sync.
(function () {
  var card = $('#sigCard');
  if (!card) return;
  var api = document.body.dataset.account;
  var pad = $('#sigPad'), ctx = pad.getContext('2d');
  var mode = 'draw', dirty = false, drawing = false, fontStack = null, fullName = '';
  var INK = '#1b3a8f';

  function clearPad() { ctx.clearRect(0, 0, pad.width, pad.height); dirty = false; }
  function brush() { ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = INK; }
  brush();

  /* ---------- current signature ---------- */
  function show(sig) {
    if (!sig) return;
    var img = $('#sigImg');
    img.src = sig.image; img.hidden = false;
    $('#sigLoading').hidden = true;
    var kind = $('#sigKind');
    kind.textContent = sig.custom ? 'Your own signature' : 'Automatic signature';
    kind.classList.toggle('custom', !!sig.custom);
    $('#sigAuto').hidden = !sig.custom;
  }

  /* ---------- editor open / close ---------- */
  function setMode(m) {
    mode = m;
    card.querySelectorAll('.sig-tab').forEach(function (t) {
      var on = t.dataset.mode === m; t.classList.toggle('on', on); t.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    card.querySelectorAll('.sig-pane').forEach(function (p) { p.hidden = p.dataset.pane !== m; });
    pad.classList.toggle('drawable', m === 'draw');
    $('#sigHint').textContent = m === 'draw' ? 'Draw your signature with your mouse, finger or stylus.'
      : m === 'type' ? 'This is how your typed signature will look.' : 'Your picture appears here before you save it.';
    clearPad();
    if (m === 'type') { if (!$('#sigText').value) $('#sigText').value = fullName; renderTyped(); }
  }
  function openEditor() {
    $('#sigEditor').hidden = false; $('#sigChange').setAttribute('aria-expanded', 'true'); $('#sigChange').hidden = true;
    setMode('draw');
    $('#sigEditor').scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  function closeEditor() {
    $('#sigEditor').hidden = true; $('#sigChange').setAttribute('aria-expanded', 'false'); $('#sigChange').hidden = false;
    clearPad();
  }
  $('#sigChange').addEventListener('click', openEditor);
  $('#sigCancel').addEventListener('click', closeEditor);
  card.querySelectorAll('.sig-tab').forEach(function (t) { t.addEventListener('click', function () { setMode(t.dataset.mode); }); });

  /* ---------- draw ---------- */
  function pos(e) {
    var r = pad.getBoundingClientRect();
    return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height };
  }
  pad.addEventListener('pointerdown', function (e) {
    if (mode !== 'draw') return;
    drawing = true; dirty = true; pad.setPointerCapture(e.pointerId); brush();
    var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .1, p.y + .1); ctx.stroke();
  });
  pad.addEventListener('pointermove', function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
  ['pointerup', 'pointercancel'].forEach(function (n) { pad.addEventListener(n, function () { drawing = false; }); });
  $('#sigClear').addEventListener('click', function () { clearPad(); if (mode === 'type') { $('#sigText').value = ''; } });

  /* ---------- type ---------- */
  function renderTyped() {
    clearPad();
    var text = $('#sigText').value.trim();
    if (!text) return;
    var size = 110;
    ctx.textBaseline = 'middle'; ctx.textAlign = 'center'; ctx.fillStyle = INK;
    do { ctx.font = size + 'px ' + fontStack; size -= 4; } while (ctx.measureText(text).width > pad.width - 50 && size > 24);
    ctx.fillText(text, pad.width / 2, pad.height / 2);
    dirty = true;
  }
  fontStack = card.querySelector('.sig-style.on').dataset.font;
  card.querySelectorAll('.sig-style').forEach(function (b) {
    b.style.fontFamily = b.dataset.font;
    b.addEventListener('click', function () {
      card.querySelectorAll('.sig-style').forEach(function (x) { var on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', on ? 'true' : 'false'); });
      fontStack = b.dataset.font; renderTyped();
    });
  });
  $('#sigText').addEventListener('input', renderTyped);

  /* ---------- upload ---------- */
  $('#sigUploadBtn').addEventListener('click', function () { $('#sigFile').click(); });
  $('#sigFile').addEventListener('change', function () {
    var file = this.files[0]; this.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { showToast('Please choose a PNG, JPG or WEBP picture.', true); return; }
    if (file.size > 2 * 1024 * 1024) { showToast('That picture is too large (2 MB maximum).', true); return; }
    var url = URL.createObjectURL(file), img = new Image();
    img.onload = function () {
      clearPad();
      var s = Math.min(pad.width / img.width, pad.height / img.height, 1), w = img.width * s, h = img.height * s;
      ctx.drawImage(img, (pad.width - w) / 2, (pad.height - h) / 2, w, h);
      // a photo on white paper: make the white background transparent
      var d = ctx.getImageData(0, 0, pad.width, pad.height), px = d.data;
      for (var i = 0; i < px.length; i += 4) { if (px[i + 3] > 0 && (px[i] + px[i + 1] + px[i + 2]) / 3 > 225) px[i + 3] = 0; }
      ctx.putImageData(d, 0, 0);
      dirty = true; URL.revokeObjectURL(url);
    };
    img.onerror = function () { URL.revokeObjectURL(url); showToast('That picture could not be read.', true); };
    img.src = url;
  });

  /* ---------- save / reset ---------- */
  $('#sigSave').addEventListener('click', async function () {
    if (!dirty) { showToast(mode === 'type' ? 'Type your name first.' : mode === 'upload' ? 'Choose a picture first.' : 'Draw your signature first.', true); return; }
    var btn = this; btn.disabled = true;
    var data = new FormData();
    data.append('action', 'save_signature');
    data.append('signature', pad.toDataURL('image/png'));
    try {
      var res = await postForm(api, data);
      show({ image: res.signature, custom: true });
      closeEditor();
      showToast('Your e-signature was saved. It will be used when you sign documents.');
    } catch (err) { showToast(err.message, true); }
    btn.disabled = false;
  });
  $('#sigAuto').addEventListener('click', async function () {
    if (!confirm('Go back to the automatic signature?')) return;
    var data = new FormData();
    data.append('action', 'clear_signature');
    try {
      var res = await postForm(api, data);
      show({ image: res.signature, custom: false });
      showToast('The automatic signature will be used.');
    } catch (err) { showToast(err.message, true); }
  });

  /* ---------- load ---------- */
  (async function () {
    try {
      var d = await getJson(api);
      if (!d) return;
      fullName = (d.user && d.user.full_name) || '';
      show(d.signature);
    } catch (err) {
      $('#sigLoading').textContent = 'Could not load your signature. ' + err.message;
      $('#sigKind').textContent = '';
    }
  })();
})();
