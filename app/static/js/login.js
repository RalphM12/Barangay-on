(function () {
  // Show / hide password (works for one or several password fields)
  document.querySelectorAll('.pw-wrap button').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var input = btn.parentElement.querySelector('input');
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.setAttribute('aria-pressed', show ? 'true' : 'false');
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });

  // Time-of-day greeting (login page)
  var el = document.getElementById('greeting');
  if (el) {
    var h = new Date().getHours();
    el.textContent = h < 12 ? 'Magandang umaga.' : h < 14 ? 'Magandang tanghali.' : h < 18 ? 'Magandang hapon.' : 'Magandang gabi.';
  }
})();