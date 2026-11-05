// Reports page (admin and captain): totals, charts and CSV export for a date range
(function () {
  var app = $('#repApp');
  var api = app.dataset.api;
  var exportApi = app.dataset.export;

  function ymd(date) {
    var m = String(date.getMonth() + 1).padStart(2, '0');
    var d = String(date.getDate()).padStart(2, '0');
    return date.getFullYear() + '-' + m + '-' + d;
  }

  var today = new Date();
  var start = new Date();
  start.setDate(today.getDate() - 29);
  $('#repFrom').value = ymd(start);
  $('#repTo').value = ymd(today);

  function bar(label, value, max) {
    var pct = max ? Math.round((value / max) * 100) : 0;
    return '<div class="hbar"><div class="top"><span>' + esc(label) + '</span><b>' + value + '</b></div>' +
           '<div class="track"><i style="width:' + pct + '%"></i></div></div>';
  }

  async function load() {
    var from = $('#repFrom').value, to = $('#repTo').value;
    $('#repExport').href = exportApi + '?' + qs({ from: from, to: to });
    try {
      var d = await getJson(api + '?' + qs({ from: from, to: to }));
      if (!d) return;
      $('#repFrom').value = d.from;
      $('#repTo').value = d.to;
      $('#repExport').href = exportApi + '?' + qs({ from: d.from, to: d.to });

      var t = d.totals;
      var cards = [['Total', t.total], ['Document Requests', t.documents], ['Complaints', t.complaints],
                   ['Community Reports', t.reports], ['Completed', t.completed], ['Rejected', t.rejected]];
      $('#repStats').innerHTML = cards.map(function (c) {
        return '<div class="m"><small>' + c[0] + '</small><strong>' + c[1] + '</strong></div>';
      }).join('');

      var maxS = Math.max.apply(null, d.by_status.map(function (s) { return Number(s.total); }).concat([1]));
      $('#repStatus').innerHTML = d.by_status.map(function (s) { return bar(s.status, Number(s.total), maxS); }).join('') ||
        '<p class="muted">No transactions in this range.</p>';

      var maxV = Math.max.apply(null, d.by_service.map(function (s) { return Number(s.total); }).concat([1]));
      $('#repServices').innerHTML = d.by_service.map(function (s) { return bar(s.name, Number(s.total), maxV); }).join('') ||
        '<p class="muted">No transactions in this range.</p>';

      var maxT = Math.max.apply(null, d.series.map(function (p) { return p.total; }).concat([1]));
      $('#repSeriesTitle').textContent = 'Transactions per ' + d.grain;
      $('#repSeries').innerHTML = d.series.map(function (p) {
        return '<div class="vb"><b>' + p.total + '</b><i style="height:' + Math.round((p.total / maxT) * 140) + 'px"></i><span>' + esc(p.label) + '</span></div>';
      }).join('');
    } catch (err) {
      showError('Could not build the report. ' + err.message);
    }
  }

  $('#repApply').addEventListener('click', load);
  load();
})();
