// Admin dashboard: loads everything from api/admin_dashboard.php
(function () {
  var STATUS_COLORS = {
    'Pending': '#f59e0b', 'Submitted': '#3b82f6', 'Under Review': '#60a5fa', 'Processing': '#fbbf24',
    'For Approval': '#fb923c', 'Approved': '#22a559', 'Ready for Release': '#8b5cf6',
    'Released': '#14b8a6', 'Resolved': '#84cc16', 'Rejected': '#ef4444', 'Inactive': '#9ca3af'
  };

  function tickClock() {
    var now = new Date();
    $('#clock').textContent = fmtDateObj(now) + '\n' + fmtTimeObj(now);
  }

  function renderDonut(counts) {
    var total = counts.reduce(function (sum, c) { return sum + Number(c.total); }, 0);
    var start = 0, stops = [];

    counts.forEach(function (c) {
      var end = start + (total ? (Number(c.total) / total) * 100 : 0);
      stops.push((STATUS_COLORS[c.status] || '#999') + ' ' + start + '% ' + end + '%');
      start = end;
    });

    $('#donut').style.background = total ? 'conic-gradient(' + stops.join(',') + ')' : '#e3e9f3';
    $('#donutTotal').textContent = total;

    $('#legend').innerHTML = counts.map(function (c) {
      return '<li><i style="background:' + (STATUS_COLORS[c.status] || '#999') + '"></i>' +
             esc(c.status) + '<b>' + Number(c.total) + '</b></li>';
    }).join('') || '<li class="muted">No transactions yet</li>';
  }

  function renderLine(points) {
    var W = 360, H = 120, pad = 14;
    var max = Math.max.apply(null, points.map(function (p) { return p.total; }).concat([1]));
    var step = (W - pad * 2) / (points.length - 1);

    var coords = points.map(function (p, i) {
      return [pad + i * step, H - pad - (p.total / max) * (H - pad * 2)];
    });
    var path = coords.map(function (c, i) { return (i ? 'L' : 'M') + c[0].toFixed(1) + ' ' + c[1].toFixed(1); }).join(' ');
    var dots = coords.map(function (c) { return '<circle cx="' + c[0] + '" cy="' + c[1] + '" r="3" fill="#1d5fd0"/>'; }).join('');
    var labels = points.map(function (p, i) {
      var day = toDate(p.date + ' 00:00:00').toLocaleDateString('en-US', { weekday: 'short' });
      return '<text x="' + coords[i][0] + '" y="' + (H + 14) + '" font-size="10" fill="#6b7a90" text-anchor="middle">' + day + '</text>';
    }).join('');

    $('#lineChart').innerHTML =
      '<svg viewBox="0 0 ' + W + ' ' + (H + 20) + '">' +
      '<path d="' + path + '" fill="none" stroke="#1d5fd0" stroke-width="2"/>' + dots + labels + '</svg>';
  }

  function renderRecent(rows) {
    var body = $('#recentBody');
    if (!rows.length) { body.innerHTML = '<tr><td colspan="6" class="muted">No transactions yet.</td></tr>'; return; }

    body.innerHTML = rows.map(function (r) {
      return '<tr>' +
        '<td>' + esc(r.tracking_no) + '</td>' +
        '<td>' + esc(r.service) + '</td>' +
        '<td>' + esc(r.resident) + '</td>' +
        '<td>' + badge(r.status) + '</td>' +
        '<td>' + fmtDate(r.created_at) + '</td>' +
        '<td><a class="view-btn" href="transactions?id=' + Number(r.id) + '">View</a></td></tr>';
    }).join('');
  }

  // Filter the recent-transactions rows as the staff types in the search box
  $('#search').addEventListener('input', function () {
    var q = this.value.toLowerCase();
    document.querySelectorAll('#recentBody tr').forEach(function (tr) {
      tr.hidden = q && tr.textContent.toLowerCase().indexOf(q) === -1;
    });
  });

  async function load() {
    try {
      var d = await getJson(document.body.dataset.api);
      if (!d) return;

      $('#greeting').textContent = greeting() + ', ' + d.user.name.split(' ')[0] + '!';
      $('#userName').textContent = d.user.name;
      $('#userRole').textContent = d.user.position;

      $('#stDocs').textContent  = d.stats.documents_pending;
      $('#stComp').textContent  = d.stats.complaints_pending;
      $('#stRep').textContent   = d.stats.reports_pending;
      $('#stRes').textContent   = d.stats.total_residents;
      $('#stToday').textContent = d.stats.today_transactions;

      $('#bkDocs').textContent = d.breakdown.document;
      $('#bkComp').textContent = d.breakdown.complaint;
      $('#bkRep').textContent  = d.breakdown.report;

      renderDonut(d.status_counts);
      renderLine(d.weekly);
      renderRecent(d.recent);
      setUnread(d.unread);
    } catch (err) {
      showError('Could not load the dashboard. ' + err.message);
    }
  }

  tickClock();
  setInterval(tickClock, 30000);
  load();
})();
