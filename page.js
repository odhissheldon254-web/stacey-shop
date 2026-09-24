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

  /* ── Live bag count ─────────────────────────────────────────
     Content pages deliberately skip app.js, so they read the bag straight
     from storage. The number has to be right or the shopper assumes the
     info pages dropped their order. Clicking through to /#cart opens the
     real drawer on the storefront. */
  const badge = $('cart-count');
  if (badge) {
    try {
      const bag = JSON.parse(localStorage.getItem('tacey_cart') || '[]');
      const count = bag.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
      badge.textContent = count;
      const link = $('cart-toggle-link');
      if (link) {
        link.setAttribute('aria-label',
          count ? `View your shopping bag — ${count} item${count === 1 ? '' : 's'}`
                : 'Your shopping bag is empty');
      }
    } catch {
      badge.textContent = '0';   // corrupt or blocked storage: show a bag, not a crash
    }
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
