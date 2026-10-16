/* Phone tab bar: highlights the current page, mirrors the bag and saved
   counts from the header badges, and opens the real drawers when they are
   on this page (the links are the fallback everywhere else). */
(function () {
  'use strict';
  const bar = document.querySelector('.tab-bar');
  if (!bar) return;

  const path = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';
  const tab = path === '/' || path === '/index' ? 'home'
    : ['/shop', '/women', '/men', '/kids'].includes(path) ? 'shop' : null;
  if (tab) bar.querySelector(`[data-tab="${tab}"]`)?.setAttribute('aria-current', 'page');

  bar.querySelectorAll('[data-tab-opens]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.getElementById(link.dataset.tabOpens);
      if (!target) return;
      e.preventDefault();
      target.click();
    });
  });

  bar.querySelectorAll('[data-tab-count]').forEach(badge => {
    const source = document.getElementById(badge.dataset.tabCount);
    if (!source) return;
    const sync = () => {
      const n = parseInt(source.textContent, 10) || 0;
      badge.textContent = n ? String(n) : '';
    };
    sync();
    new MutationObserver(sync).observe(source, { childList: true, characterData: true, subtree: true });
  });
})();
