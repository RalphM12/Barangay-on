// Resident dashboard: loads data from api/resident_dashboard.php
(async function () {
  try {
    var d = await getJson(document.body.dataset.api);
    if (!d) return;

    $('#greeting').textContent = 'Good day, ' + d.user.name.split(' ')[0];
    $('#userName').textContent = d.user.name;

    if (d.resident_status && d.resident_status !== 'Registered') {
      var vb = $('#verifyBanner');
      vb.innerHTML = d.resident_status === 'Pending'
        ? '<b>Waiting for Verification.</b> The barangay office has not registered you yet. You can request documents, file complaints and send community reports once you are registered.'
        : '<b>Your resident record is not active.</b> Please contact the barangay office.';
      vb.hidden = false;
      document.querySelectorAll('.services .svc').forEach(function (a) { a.classList.add('is-locked'); a.setAttribute('aria-disabled', 'true'); a.removeAttribute('href'); });
    }

    $('#stPending').textContent    = d.stats.pending;
    $('#stProcessing').textContent = d.stats.processing;
    $('#stCompleted').textContent  = d.stats.completed;

    $('#recentBody').innerHTML = d.recent.map(function (r) {
      return '<tr><td>' + esc(r.tracking_no) + '</td><td>' + esc(r.service) + '</td>' +
             '<td>' + badge(r.status) + '</td><td>' + fmtDate(r.created_at) + '</td></tr>';
    }).join('') || '<tr><td colspan="4" class="muted">You have no transactions yet.</td></tr>';

    setUnread(d.unread);

    var ann = await getJson(document.body.dataset.announcements);
    $('#annList').innerHTML = ann.rows.slice(0, 5).map(function (a) {
      return '<li><strong>' + esc(a.title) + '</strong><p>' + esc(a.body) + '</p><small>' + esc(a.posted_by) + ' · ' + timeAgo(a.created_at) + '</small></li>';
    }).join('') || '<li class="muted">No announcements right now.</li>';
  } catch (err) {
    showError('Could not load your dashboard. ' + err.message);
  }
})();
