(function () {
  // Hero slider
  var slides = document.querySelectorAll('.slide');
  var dots = document.querySelectorAll('.dot');
  var i = 0, timer = null;

  function show(n) {
    i = (n + slides.length) % slides.length;
    slides.forEach(function (s, k) { s.classList.toggle('on', k === i); });
    dots.forEach(function (d, k) { d.classList.toggle('on', k === i); });
  }
  function start() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    stop(); timer = setInterval(function () { show(i + 1); }, 5500);
  }
  function stop() { if (timer) clearInterval(timer); }

  dots.forEach(function (d, k) { d.addEventListener('click', function () { show(k); start(); }); });
  start();

  // Highlight the nav link of the section in view
  var links = document.querySelectorAll('.topbar-nav a[href^="#"]');
  var map = {};
  links.forEach(function (a) { map[a.getAttribute('href').slice(1)] = a; });
  links.forEach(function (a) {
    a.addEventListener('click', function () {
      links.forEach(function (x) { x.classList.remove('active'); });
      a.classList.add('active');
    });
  });
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          links.forEach(function (a) { a.classList.remove('active'); });
          map[en.target.id].classList.add('active');
        }
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(map).forEach(function (id) { var el = document.getElementById(id); if (el) io.observe(el); });
  }
})();