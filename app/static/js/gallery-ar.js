/* AR photo illusion for the home-page gallery.
   1) Cards tilt in 3D toward the pointer, with a glare and a scanning frame.
   2) "View in AR" shows the photo floating over the live camera (if allowed) and
      moves it with the phone's motion sensors, or with the mouse / finger as a fallback. */
(function () {
  'use strict';
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- 1) depth tilt on each card ---- */
  if (!reduce) {
    document.querySelectorAll('[data-ar-card]').forEach(function (card) {
      var max = 11;
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
        card.classList.add('is-tilting');
        card.style.setProperty('--ry', ((px - .5) * 2 * max).toFixed(2) + 'deg');
        card.style.setProperty('--rx', ((.5 - py) * 2 * max).toFixed(2) + 'deg');
        card.style.setProperty('--gx', (px * 100).toFixed(1) + '%');
        card.style.setProperty('--gy', (py * 100).toFixed(1) + '%');
        card.style.setProperty('--go', '1');
      });
      function reset() {
        card.classList.remove('is-tilting');
        card.style.setProperty('--rx', '0deg'); card.style.setProperty('--ry', '0deg'); card.style.setProperty('--go', '0');
      }
      card.addEventListener('pointerleave', reset);
      card.addEventListener('pointercancel', reset);
    });
  }

  /* ---- 2) AR viewer ---- */
  var view, stream, onOrient, onMove, lastFocus;

  function close() {
    if (!view) return;
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (onOrient) window.removeEventListener('deviceorientation', onOrient);
    if (onMove) window.removeEventListener('pointermove', onMove);
    document.removeEventListener('keydown', onKey);
    view.remove(); view = null;
    document.documentElement.style.overflow = '';
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function open(src, caption, trigger) {
    lastFocus = trigger;
    view = document.createElement('div');
    view.className = 'ar-view';
    view.setAttribute('role', 'dialog'); view.setAttribute('aria-modal', 'true'); view.setAttribute('aria-label', 'AR photo view');
    view.innerHTML =
      '<video class="ar-cam" autoplay playsinline muted hidden></video>' +
      '<div class="ar-stage"><figure class="ar-photo"><img alt=""><figcaption></figcaption><span class="ar-shadow"></span></figure></div>' +
      '<div class="ar-top"><span class="ar-tag">AR PHOTO</span><button type="button" class="ar-close">Close &#10005;</button></div>' +
      '<p class="ar-note" aria-live="polite"></p>';
    view.querySelector('img').src = src;
    view.querySelector('img').alt = caption || 'Barangay photo';
    view.querySelector('figcaption').textContent = caption || '';
    document.body.appendChild(view);
    document.documentElement.style.overflow = 'hidden';
    view.querySelector('.ar-close').addEventListener('click', close);
    view.querySelector('.ar-close').focus();
    document.addEventListener('keydown', onKey);

    var note = view.querySelector('.ar-note'), stage = view.querySelector('.ar-stage'), photo = view.querySelector('.ar-photo');
    var cx = 0, cy = 0, tx = 0, ty = 0;           // current / target tilt in degrees
    function apply() {
      photo.style.setProperty('--ary', cx.toFixed(2) + 'deg'); photo.style.setProperty('--arx', cy.toFixed(2) + 'deg');
      stage.style.transform = 'translate(' + (-cx * 4).toFixed(1) + 'px,' + (cy * 4).toFixed(1) + 'px)';
    }
    function clamp(v, m) { return Math.max(-m, Math.min(m, v)); }
    function set(x, y) { cx = clamp(x, 28); cy = clamp(y, 22); apply(); }

    // mouse / finger fallback (always on, so desktops can play with it too)
    if (!reduce) {
      onMove = function (e) {
        set((e.clientX / window.innerWidth - .5) * 56, (.5 - e.clientY / window.innerHeight) * 44);
      };
      window.addEventListener('pointermove', onMove);
    }

    // phone motion: the photo stays "pinned" in space while the phone moves
    function startMotion() {
      var g0 = null, b0 = null;
      onOrient = function (e) {
        if (e.gamma == null || e.beta == null) return;
        if (g0 === null) { g0 = e.gamma; b0 = e.beta; }
        window.removeEventListener('pointermove', onMove); onMove = null;
        set(-(e.gamma - g0) * .8, (e.beta - b0) * .8);
      };
      window.addEventListener('deviceorientation', onOrient);
    }
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
      DeviceOrientationEvent.requestPermission().then(function (s) { if (s === 'granted') startMotion(); }).catch(function () {});
    } else if ('ondeviceorientation' in window) {
      startMotion();
    }

    // live camera behind the photo
    var video = view.querySelector('video');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false }).then(function (s) {
        if (!view) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s; video.srcObject = s; video.hidden = false;
        note.textContent = 'Move your phone to look around the photo.';
      }).catch(function () {
        note.textContent = 'Camera is off, so the photo floats on a plain background. Move your mouse or phone to tilt it.';
      });
    } else {
      note.textContent = 'Camera is not available here (it needs https). Move your mouse or phone to tilt the photo.';
    }
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest && e.target.closest('[data-ar-open]');
    if (btn) open(btn.dataset.src, btn.dataset.caption, btn);
  });
})();
