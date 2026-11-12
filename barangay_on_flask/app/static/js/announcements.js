// Announcements page. Everyone can read; the captain can post and delete.
(function () {
  var app = $('#annApp');
  var api = app.dataset.api;
  var canPost = app.dataset.canpost === '1';

  async function load() {
    try {
      var d = await getJson(api);
      if (!d) return;
      $('#annList').innerHTML = d.rows.map(function (a) {
        return '<li><strong>' + esc(a.title) + '</strong><p>' + esc(a.body) + '</p>' +
               '<small>' + esc(a.posted_by) + ' · ' + timeAgo(a.created_at) + '</small>' +
               (canPost ? '<br><button type="button" class="btn-sm bad" data-del="' + Number(a.id) + '">Delete</button>' : '') + '</li>';
      }).join('') || '<li class="muted">No announcements yet.</li>';
    } catch (err) {
      showError('Could not load announcements. ' + err.message);
    }
  }

  if (canPost) {
    $('#annForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var form = new FormData(this);
      form.append('action', 'create');
      var btn = this.querySelector('button[type="submit"]');
      btn.disabled = true;
      try {
        await postForm(api, form);
        this.reset();
        showToast('Announcement posted.');
        load();
      } catch (err) {
        showToast(err.message, true);
      }
      btn.disabled = false;
    });

    $('#annList').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-del]');
      if (!b || !confirm('Delete this announcement?')) return;
      var form = new FormData();
      form.append('action', 'delete');
      form.append('id', b.dataset.del);
      try {
        await postForm(api, form);
        showToast('Announcement deleted.');
        load();
      } catch (err) {
        showToast(err.message, true);
      }
    });
  }

  load();
})();
