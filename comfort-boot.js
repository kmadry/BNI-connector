/* Stosuje zapisane ustawienia komfortu zanim strona się narysuje (bez migania). Wczytywany w <head>. */
(function () {
  try {
    var d = { detail: 'simple', density: 'spacious', text: '100', contrast: 'soft', theme: 'auto', motion: 'off', font: 'plex', caps: 'on' };
    var s = JSON.parse(localStorage.getItem('bni-comfort') || 'null');
    if (!s) { s = {}; var old = localStorage.getItem('bni-theme'); if (old === 'dark' || old === 'light') s.theme = old; }
    for (var k in d) if (!(k in s)) s[k] = d[k];
    var h = document.documentElement;
    ['detail', 'density', 'text', 'contrast', 'motion', 'font', 'caps'].forEach(function (k) { h.dataset[k] = s[k]; });
    if (s.theme === 'auto') delete h.dataset.theme; else h.dataset.theme = s.theme;
  } catch (e) {}
})();
