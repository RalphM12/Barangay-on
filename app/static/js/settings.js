// Settings pages (all roles): load / save / cancel / reset, live preview of appearance.
// Talks to /api/settings. The server validates every value again, so nothing here is trusted.
(function () {
  var app = $('#setApp');
  if (!app) return;
  var api = app.dataset.api;
  var csrf = document.querySelector('meta[name="csrf"]').content;
  var saved = {};      // what is stored on the server right now
  var defaults = {};

  // ---------- reading / writing the controls of one panel ----------
  function controls(panel) { return panel.querySelectorAll('[name]'); }

  function readPanel(panel) {
    var out = {};
    controls(panel).forEach(function (el) {
      if (el.type === 'radio') { if (el.checked) out[el.name] = el.value; }
      else if (el.type === 'checkbox') out[el.name] = el.checked ? '1' : '0';
      else out[el.name] = el.value;
    });
    return out;
  }

  function fillPanel(panel, values) {
    controls(panel).forEach(function (el) {
      var v = values[el.name];
      if (v === undefined) return;
      if (el.type === 'radio') el.checked = String(v) === el.value;
      else if (el.type === 'checkbox') el.checked = Number(v) === 1;
      else el.value = String(v);
    });
  }

  // appearance-type values can be previewed on screen straight away
  var PREVIEW = ['theme', 'font_size', 'density', 'sidebar_collapsed', 'date_format', 'time_format', 'page_size'];
  function preview(values) {
    var p = {};
    PREVIEW.forEach(function (k) { if (values[k] !== undefined) p[k] = values[k]; });
    window.BarangayShell.apply(p);
  }

  function panels() { return app.querySelectorAll('[data-group]'); }

  // ---------- load ----------
  async function load() {
    try {
      var d = await getJson(api);
      if (!d) return;
      saved = d.settings;
      defaults = d.defaults;

      var sel = app.querySelector('select[name="default_page"]');
      if (sel) sel.innerHTML = Object.keys(d.default_pages).map(function (k) {
        return '<option value="' + esc(k) + '">' + esc(d.default_pages[k]) + '</option>';
      }).join('');

      panels().forEach(function (p) { fillPanel(p, saved); });
    } catch (err) {
      showError('Could not load your settings. ' + err.message);
    }
  }

  // ---------- live preview while the person changes a control ----------
  app.addEventListener('change', function (e) {
    var panel = e.target.closest('[data-group]');
    if (!panel) return;
    preview(readPanel(panel));
  });

  // ---------- save / cancel / reset ----------
  async function send(data) {
    data.append('csrf', csrf);
    return postForm(api, data);
  }

  app.addEventListener('click', async function (e) {
    var panel = e.target.closest('[data-group]');
    if (!panel) return;
    var btn;

    if ((btn = e.target.closest('[data-save]'))) {
      var values = readPanel(panel);
      var form = new FormData();
      form.append('action', 'save');
      Object.keys(values).forEach(function (k) { form.append(k, values[k]); });
      btn.disabled = true;
      try {
        var res = await send(form);
        Object.keys(res.settings).forEach(function (k) { saved[k] = res.settings[k]; });
        showToast('Your settings were saved.');
      } catch (err) {
        showToast(err.message, true);
      }
      btn.disabled = false;
    }

    if (e.target.closest('[data-cancel]')) {
      fillPanel(panel, saved);                 // back to what is stored
      preview(saved);
      showToast('Changes cancelled.');
    }

    if ((btn = e.target.closest('[data-reset]'))) {
      if (!confirm('Reset these settings to their defaults?')) return;
      var f = new FormData();
      f.append('action', 'reset');
      f.append('group', btn.dataset.reset);
      btn.disabled = true;
      try {
        var r = await send(f);
        Object.keys(r.settings).forEach(function (k) { saved[k] = r.settings[k]; });
        fillPanel(panel, saved);
        preview(saved);
        showToast('Settings were reset to the defaults.');
      } catch (err2) {
        showToast(err2.message, true);
      }
      btn.disabled = false;
    }
  });

  load();
})();
