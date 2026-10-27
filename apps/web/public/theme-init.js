// Runs before the page draws, so it never flashes the wrong colours: applies
// the saved appearance ("light", "dark" or "system", kept in localStorage) as
// <html data-theme>. A separate file because the site allows no inline scripts.
(function () {
  var saved = 'system';
  try {
    saved = localStorage.getItem('tb-appearance') || 'system';
  } catch {
    // Storage blocked (private mode): follow the system.
  }
  var dark =
    saved === 'dark' ||
    (saved !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
})();
