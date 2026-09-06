/* ================================================================
   page.js — the small script for static content pages.

   The storefront pages load app.js (catalogue, cart, wishlist,
   quiz). Content pages need none of that; they only need the
   header to behave. Keeping them separate means /about and /faq
   stay fast and never touch the products API.
   ================================================================ */
(function () {
  'use strict';

  const $ = id => document.getElementById(id);

  /* ── Sticky navbar tint on scroll ───────────────────────── */
  const navbar = $('main-nav');
  if (navbar) {
    const tint = () => {
      navbar.style.background = window.scrollY > 60
        ? 'rgba(11,11,15,0.95)'
        : 'rgba(11,11,15,0.7)';
    };
    tint();
    window.addEventListener('scroll', tint, { passive: true });
  }

  /* ── Mobile nav drawer ──────────────────────────────────── */
  const menuBtn  = $('mobile-menu-btn');
  const drawer   = $('nav-drawer');
  const backdrop = $('nav-drawer-backdrop');
  const closeBtn = $('nav-drawer-close');

  if (menuBtn && drawer) {
    const open = () => {
      drawer.classList.add('open');
      backdrop?.classList.add('open');
      menuBtn.classList.add('open');
      menuBtn.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
      closeBtn?.focus();
    };

    const close = () => {
      drawer.classList.remove('open');
      backdrop?.classList.remove('open');
      menuBtn.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
      menuBtn.focus();
    };

    menuBtn.addEventListener('click', () => {
      drawer.classList.contains('open') ? close() : open();
    });
    backdrop?.addEventListener('click', close);
    closeBtn?.addEventListener('click', close);
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));

    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && drawer.classList.contains('open')) close();
    });

    // Keep Tab inside the drawer while it is open.
    drawer.addEventListener('keydown', e => {
      if (e.key !== 'Tab') return;
      const focusable = drawer.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last  = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
  }

  /* ── Mark the current page in the header ────────────────── */
  const here = document.body.dataset.nav;
  if (here) {
    document.querySelectorAll(`[data-nav="${here}"]`).forEach(link => {
      link.classList.add('active');
      link.setAttribute('aria-current', 'page');
    });
  }
})();
