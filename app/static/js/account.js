// Account page: Account & Security (Settings) and the resident Profile page.
// Update details, change password, show the user's own recent activity.
(async function () {
  var app = $('#accApp');
  if (!app) return;
  var api = app.dataset.api;
  var profile = $('#profileForm');
  var password = $('#passwordForm');

  var initial = '👤';

  // photo or initial in the form, and in the top bar of this page
  function showAvatar(url) {
    var av = $('#accAvatar');
    if (av) {
      av.innerHTML = url ? '<img alt="" src="' + esc(url) + '">' : esc(initial);
      av.classList.toggle('has-img', !!url);
    }
    var rm = $('#accPhotoRemove');
    if (rm) rm.hidden = !url;
    if (window.BarangayShell && window.BarangayShell.setAvatar) window.BarangayShell.setAvatar(url || '');
  }

  function setText(sel, text) { var el = $(sel); if (el) el.textContent = text; }
  function setVal(sel, v) { var el = $(sel); if (el) el.value = v; }

  // little icon + colour for each kind of activity
  function activityIcon(action) {
    var a = String(action).toLowerCase();
    if (a.indexOf('failed') > -1) return ['bad', '!'];
    if (a.indexOf('password') > -1) return ['blue', '✎'];
    if (a.indexOf('profile') > -1) return ['purple', '👤'];
    if (a.indexOf('login') > -1 || a.indexOf('logout') > -1 || a.indexOf('session') > -1) return ['good', '✔'];
    return ['blue', 'i'];
  }

  function renderActivity(list) {
    var ul = $('#accActivity');
    if (!ul) return;
    ul.innerHTML = (list || []).map(function (r) {
      var t = toDate(r.created_at), ic = activityIcon(r.action);
      return '<li><span class="a-ico ' + ic[0] + '">' + ic[1] + '</span><div class="a-body"><strong>' + esc(r.action) + '</strong><small>' + esc(r.detail) + '</small></div>' +
             '<time>' + esc(fmtDateObj(t) + ', ' + fmtTimeObj(t)) + '</time></li>';
    }).join('') || '<li class="muted">No activity recorded yet.</li>';
  }

  try {
    var d = await getJson(api);
    if (!d) return;
    setVal('#accUsername', d.user.username);
    setVal('#accRole', d.user.role_label || d.user.role);

    var shown = d.user.full_name;
    if (d.resident) {
      $('#staffFields').hidden = true;
      $('#residentFields').hidden = false;
      ['first_name', 'last_name', 'address', 'birthdate', 'sex', 'civil_status', 'contact_no'].forEach(function (k) {
        profile.elements[k].value = d.resident[k] || '';
        profile.elements[k].disabled = true;          // residents cannot edit - only staff/admin (Residents page)
      });
      var saveRow = $('#profileSaveRow');
      if (saveRow) saveRow.hidden = true;
      shown = (d.resident.first_name + ' ' + d.resident.last_name).trim();
    } else {
      profile.elements.full_name.value = d.user.full_name;
    }
    setText('#accName', shown);
    setText('#accPosition', d.user.position || '');
    initial = shown ? shown.trim().charAt(0).toUpperCase() : '👤';
    showAvatar(d.avatar);
    window.__sig = d.signature || null;
    renderActivity(d.activity);
  } catch (err) {
    showError('Could not load your account. ' + err.message);
  }

  async function submit(form, action, okMessage, reset) {
    var data = new FormData(form);
    data.append('action', action);
    var btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    try {
      await postForm(api, data);
      showToast(okMessage);
      if (reset) form.reset();
      var fresh = await getJson(api);                 // refresh the activity list
      if (fresh) renderActivity(fresh.activity);
    } catch (err) {
      showToast(err.message, true);
    }
    btn.disabled = false;
  }

  if (profile) profile.addEventListener('submit', function (e) {
    e.preventDefault();
    if (profile.elements.first_name && profile.elements.first_name.disabled) return;   // resident: read-only
    submit(profile, 'update_profile', 'Your details were saved.', false);
  });
  if (password) password.addEventListener('submit', function (e) {
    e.preventDefault();
    if (password.elements.new_password.value !== password.elements.confirm_password.value) {
      showToast('The new passwords do not match.', true);
      return;
    }
    submit(password, 'change_password', 'Password updated.', true);
  });

  // profile photo: choose -> check -> upload
  var photo = $('#accPhoto');
  if (photo) {
    $('#accPhotoBtn').addEventListener('click', function () { photo.click(); });
    photo.addEventListener('change', async function () {
      var file = photo.files[0];
      photo.value = '';
      if (!file) return;
      if (!/^image\/(jpeg|png|gif|webp)$/.test(file.type)) { showToast('Please choose a JPG, PNG, GIF or WEBP picture.', true); return; }
      if (file.size > 2 * 1024 * 1024) { showToast('That photo is too large (2 MB maximum).', true); return; }
      var data = new FormData();
      data.append('action', 'upload_avatar');
      data.append('photo', file);
      try {
        var res = await postForm(api, data);
        showAvatar(res.avatar);
        showToast('Your photo was updated.');
        var fresh = await getJson(api);
        if (fresh) renderActivity(fresh.activity);
      } catch (err) {
        showToast(err.message, true);
      }
    });
    $('#accPhotoRemove').addEventListener('click', async function () {
      if (!confirm('Remove your profile photo?')) return;
      var data = new FormData();
      data.append('action', 'remove_avatar');
      try {
        await postForm(api, data);
        showAvatar('');
        showToast('Your photo was removed.');
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }


  // ---- Captain: draw / upload a signature (saved as a PNG; documents keep the one that was current when signed)
  var pad = $('#sigPad');
  if (pad) {
    var ctx = pad.getContext('2d');
    var drawing = false, dirty = false;
    function clearPad() { ctx.clearRect(0, 0, pad.width, pad.height); dirty = false; }
    function pos(e) {
      var r = pad.getBoundingClientRect();
      return { x: (e.clientX - r.left) * pad.width / r.width, y: (e.clientY - r.top) * pad.height / r.height };
    }
    ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#1b3a8f';
    pad.addEventListener('pointerdown', function (e) {
      drawing = true; dirty = true; pad.setPointerCapture(e.pointerId);
      var p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x + .1, p.y + .1); ctx.stroke();
    });
    pad.addEventListener('pointermove', function (e) { if (!drawing) return; var p = pos(e); ctx.lineTo(p.x, p.y); ctx.stroke(); });
    ['pointerup', 'pointercancel'].forEach(function (n) { pad.addEventListener(n, function () { drawing = false; }); });
    $('#sigClear').addEventListener('click', clearPad);

    // an uploaded picture is drawn onto the pad (scaled to fit) so it is saved the same way
    $('#sigUploadBtn').addEventListener('click', function () { $('#sigFile').click(); });
    $('#sigFile').addEventListener('change', function () {
      var file = this.files[0]; this.value = '';
      if (!file) return;
      if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { showToast('Please choose a PNG, JPG or WEBP picture.', true); return; }
      if (file.size > 2 * 1024 * 1024) { showToast('That picture is too large (2 MB maximum).', true); return; }
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        clearPad();
        var s = Math.min(pad.width / img.width, pad.height / img.height, 1);
        var w = img.width * s, h = img.height * s;
        ctx.drawImage(img, (pad.width - w) / 2, (pad.height - h) / 2, w, h);
        // a photo of a signature on white paper: turn the white background transparent
        var d = ctx.getImageData(0, 0, pad.width, pad.height), px = d.data;
        for (var i = 0; i < px.length; i += 4) {
          var lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
          if (px[i + 3] > 0 && lum > 225) px[i + 3] = 0;
        }
        ctx.putImageData(d, 0, 0);
        dirty = true; URL.revokeObjectURL(url);
        showToast('Picture loaded. Press "Save signature" to use it.');
      };
      img.onerror = function () { showToast('That picture could not be read.', true); };
      img.src = url;
    });

    function showSignature(sig) {
      if (!sig) return;
      $('#sigImg').src = sig.image;
      $('#sigKind').textContent = sig.custom ? 'Your saved signature' : 'Automatic signature (draw or upload your own)';
      $('#sigAuto').hidden = !sig.custom;
    }
    showSignature(window.__sig);
    $('#sigSave').addEventListener('click', async function () {
      if (!dirty) { showToast('Draw or upload your signature first.', true); return; }
      var data = new FormData();
      data.append('action', 'save_signature');
      data.append('signature', pad.toDataURL('image/png'));
      try {
        var res = await postForm(api, data);
        showSignature({ image: res.signature, custom: true });
        clearPad();
        showToast('Your signature was saved. It will be used when you sign documents.');
      } catch (err) { showToast(err.message, true); }
    });
    $('#sigAuto').addEventListener('click', async function () {
      if (!confirm('Go back to the automatic signature?')) return;
      var data = new FormData();
      data.append('action', 'clear_signature');
      try {
        var res = await postForm(api, data);
        showSignature({ image: res.signature, custom: false });
        showToast('The automatic signature will be used.');
      } catch (err) { showToast(err.message, true); }
    });
  }

  // show / hide password
  app.addEventListener('click', function (e) {
    var b = e.target.closest('.pw-eye');
    if (!b) return;
    var input = b.parentNode.querySelector('input');
    var show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    b.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    b.classList.toggle('on', show);
  });
})();
