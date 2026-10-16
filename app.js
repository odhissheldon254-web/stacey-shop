/**
 * Tacey Collections — app.js
 * Handles: product catalog, departments, cart + delivery, wishlist
 */

/* ================================================================
   PRODUCT CATALOG — loaded from Supabase (Stacey edits it in the admin)
   ================================================================ */
let PRODUCTS = [];

async function loadProductsFromApi() {
  try {
    const data = await window.TaceyStore.loadProducts();
    if (Array.isArray(data)) {
      PRODUCTS = normalizeQty(data);
      saveProducts();
      return PRODUCTS;
    }
  } catch (error) {
    console.warn('Using local fallback products', error);
    // Offline or Supabase unreachable: show the last real catalogue this
    // visitor saw, never made-up sample stock.
    try { PRODUCTS = normalizeQty(JSON.parse(localStorage.getItem('tacey_products') || '[]')); }
    catch { PRODUCTS = []; }
  }
  return PRODUCTS;
}

async function saveProducts() {
  localStorage.setItem('tacey_products', JSON.stringify(PRODUCTS));
}

// Delivery fees lookup (keyed by option value)
const DELIVERY_FEES = {
  pickup: 0,
  nairobi_cbd: 150,
  nairobi_suburbs: 300,
  kiambu_thika: 400,
  mombasa_kisumu: 500,
  upcountry: 600
};

/* ================================================================
   STATE
   ================================================================ */
let cart = JSON.parse(localStorage.getItem('tacey_cart') || '[]');
let wishlist = JSON.parse(localStorage.getItem('tacey_wishlist') || '[]');
let activeFilters = { category: 'all', gender: 'all', search: '' };

/* ================================================================
   HELPERS
   ================================================================ */
const $ = id => document.getElementById(id);
const fmt = n => `KES ${Number(n).toLocaleString('en-KE')}`;

// Quantity may be missing on older records — derive it from inStock.
function normalizeQty(list) {
  list.forEach(p => {
    if (!Number.isFinite(Number(p.qty))) p.qty = p.inStock ? 1 : 0;
    p.qty = Math.max(0, Math.floor(Number(p.qty)));
    p.inStock = p.qty > 0;
    // "footwear", "FOOTWEAR " and "Footwear" are one shelf, shown as "Footwear".
    p.category = String(p.category || 'Clothes').trim().toLowerCase()
      .replace(/\b\w/g, c => c.toUpperCase());
  });
  return list;
}

/* ── Storefront toast (bottom-center feedback bubble) ── */
let shopToastTimer;
function shopToast(msg) {
  let el = document.getElementById('shop-toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'shop-toast';
    el.setAttribute('role', 'status');
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(shopToastTimer);
  shopToastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

/* ── Scroll-reveal (fade-up as sections enter the viewport) ── */
const revealObserver = ('IntersectionObserver' in window) && !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  ? new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('revealed');
          revealObserver.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' })
  : null;

function observeReveals(root = document) {
  if (!revealObserver) return;
  document.documentElement.dataset.revealReady = '1';
  // `.reveal` is in the list because some sections carry it straight from the
  // markup. They still need observing — skipping them was what left the
  // departments and highlights blocks stuck at opacity:0 forever.
  root.querySelectorAll('.reveal, .product-card, .step-card, .dept-card, .highlights-card, .instagram-card, .shelf')
    .forEach((el, i) => {
      if (el.dataset.revealBound || el.classList.contains('revealed')) return;
      el.dataset.revealBound = '1';
      el.classList.add('reveal');
      el.style.transitionDelay = `${Math.min(i % 6, 5) * 60}ms`;
      revealObserver.observe(el);
    });
}

/* ================================================================
   DEPARTMENTS (Women / Men / Kids pages)
   ================================================================ */
const DEPARTMENTS = {
  women: {
    crumb: 'Women',
    title: "Women's Collection",
    tagline: 'Heels, gowns, bags and everyday glam — curated for her.',
    genders: ['Female', 'Unisex']
  },
  men: {
    crumb: 'Men',
    title: "Men's Collection",
    tagline: 'Sharp fits, clean kicks and versatile streetwear — built for him.',
    genders: ['Male', 'Unisex']
  },
  kids: {
    crumb: 'Kids',
    title: "Kids' Corner",
    tagline: 'Playful, comfy and adorable picks for the little trendsetters.',
    genders: ['Kids']
  },
  // /shop: everything, every department, on its shelves.
  shop: {
    crumb: 'Shop',
    title: 'Everything in the shop',
    tagline: 'Every piece Stacey has in right now, for women, men and kids.',
    genders: ['Female', 'Male', 'Unisex', 'Kids']
  }
};

function currentDeptKey() {
  const seg = location.pathname.replace(/\/+$/, '').split('/').pop().replace(/\.html$/, '');
  if (DEPARTMENTS[seg]) return seg;
  const q = new URLSearchParams(location.search).get('dept');
  return DEPARTMENTS[q] ? q : null;
}

/* ================================================================
   PRODUCT RENDERING
   ================================================================ */
function getFilteredProducts() {
  return PRODUCTS.filter(p => {
    const catOk  = activeFilters.category === 'all' || p.category === activeFilters.category;
    const genOk  = activeFilters.gender   === 'all' || p.gender   === activeFilters.gender;
    const q      = activeFilters.search.toLowerCase();
    const searchOk = !q || p.name.toLowerCase().includes(q)
      || (p.tags || []).some(t => t.includes(q))
      || p.category.toLowerCase().includes(q);
    return catOk && genOk && searchOk;
  });
}

function isWishlisted(id) {
  return wishlist.includes(id);
}

function productCardHTML(p) {
  const wishlisted = isWishlisted(p.id);
  return `
    <article class="product-card" data-id="${p.id}" tabindex="0" role="button"
             aria-label="View details for ${p.name}" style="${!p.inStock ? 'opacity:0.5;' : ''}">
      <div class="product-img-container">
        <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy">
        <span class="product-badge product-badge-gender">${p.gender}</span>
        ${p.featured ? `<span class="product-badge product-badge-featured">Stacey's pick</span>` : ''}
        ${!p.inStock ? `<span class="product-badge product-badge-bottom product-badge-out">Out of Stock</span>` : ''}
        ${p.inStock && p.qty <= 3 ? `<span class="product-badge product-badge-bottom low-stock-badge">Only ${p.qty} left</span>` : ''}
        <button class="wishlist-btn ${wishlisted ? 'wishlisted' : ''}" data-id="${p.id}" aria-label="${wishlisted ? 'Remove from' : 'Add to'} wishlist" aria-pressed="${wishlisted}">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="${wishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
      </div>
      <div class="product-info">
        <span class="product-cat">${p.category}</span>
        <h3 class="product-title">${p.name}</h3>
        <div class="product-price-row">
          <span class="product-price">${p.price.toLocaleString('en-KE')}</span>
          <button class="product-card-btn" data-id="${p.id}" aria-label="Add ${p.name} to cart"
                  ${!p.inStock ? 'disabled' : ''}>
            ${p.inStock ? 'Add to bag' : 'Sold out'}
          </button>
        </div>
      </div>
    </article>`;
}

function bindProductCardEvents(root) {
  root.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.product-card-btn')) return;
      if (e.target.closest('.wishlist-btn')) return;
      openDetailModal(+card.dataset.id);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailModal(+card.dataset.id); }
    });
  });

  root.querySelectorAll('.product-card-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addToCart(+btn.dataset.id);
    });
  });

  root.querySelectorAll('.wishlist-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleWishlist(+btn.dataset.id);
    });
  });
}

function renderProducts(list = getFilteredProducts()) {
  const grid = $('product-grid-container');
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:4rem 1rem; color:var(--color-text-muted);">
        <p style="font-size:1.1rem;">No items match your search. Try adjusting the filters or ask <strong>Stacey</strong> on WhatsApp — she restocks weekly.</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(productCardHTML).join('');
  bindProductCardEvents(grid);
  observeReveals(grid);
}

/* ================================================================
   DEPARTMENT PAGE — hero + horizontal shelves
   ================================================================ */
const SITE_ORIGIN = 'https://taceycollections.odhis.co.ke';

/* The three departments share one HTML file, so the per-department canonical
   URL, description and breadcrumb trail have to be set once we know which
   department this is. Without this all three would look like /shop to a
   crawler and compete with each other. */
function setDeptSeo(deptKey, dept) {
  const url = `${SITE_ORIGIN}/${deptKey}`;

  // shop.html ships with each of these tags, so this updates in place;
  // the create path only matters if the markup is ever trimmed.
  const setMeta = (attrName, attrValue, content) => {
    let el = document.head.querySelector(`meta[${attrName}="${attrValue}"]`);
    if (!el) {
      el = document.createElement('meta');
      el.setAttribute(attrName, attrValue);
      document.head.appendChild(el);
    }
    el.setAttribute('content', content);
  };

  let canonical = document.head.querySelector('link[rel="canonical"]');
  if (!canonical) {
    canonical = document.createElement('link');
    canonical.rel = 'canonical';
    document.head.appendChild(canonical);
  }
  canonical.setAttribute('href', url);

  const description = `Shop the ${dept.title} at Tacey Collections. ${dept.tagline} Order on WhatsApp and pay by M-Pesa after Stacey confirms.`;
  setMeta('name', 'description', description);
  setMeta('property', 'og:title', `${dept.title} | Tacey Collections`);
  setMeta('property', 'og:description', description);
  setMeta('property', 'og:url', url);

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: `${SITE_ORIGIN}/` },
      { '@type': 'ListItem', position: 2, name: dept.crumb, item: url }
    ]
  };

  let ld = document.getElementById('dept-breadcrumb-ld');
  if (!ld) {
    ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.id = 'dept-breadcrumb-ld';
    document.head.appendChild(ld);
  }
  ld.textContent = JSON.stringify(breadcrumb);
}

function renderDeptPage() {
  const deptKey = currentDeptKey();
  const container = $('shelves-container');
  if (!deptKey || !container) return false;

  const dept = DEPARTMENTS[deptKey];
  document.title = `${dept.crumb} | Tacey Collections`;
  setDeptSeo(deptKey, dept);

  // Hero
  const crumb = $('dept-crumb');   if (crumb)   crumb.textContent = dept.crumb;
  const title = $('dept-title');   if (title)   title.textContent = dept.title;
  const tag   = $('dept-tagline'); if (tag)     tag.textContent = dept.tagline;
  document.body.dataset.dept = deptKey;

  // Highlight the active department in nav + switcher chips
  document.querySelectorAll('[data-dept-link]').forEach(link => {
    link.classList.toggle('active', link.dataset.deptLink === deptKey);
  });

  const deptProducts = PRODUCTS.filter(p => dept.genders.includes(p.gender));

  // Known shelf styling; any brand-new category Stacey creates in the admin
  // still gets its own shelf via the fallback.
  const SHELF_META = {
    Footwear:    { name: 'The Footwear Shelf',    blurb: 'Sneakers, heels and everything in between' },
    Bags:        { name: 'The Bag Shelf',         blurb: 'Carry your style with you' },
    Clothes:     { name: 'The Wardrobe Shelf',    blurb: 'Outfits for every occasion' },
    Hats:        { name: 'The Hat Shelf',         blurb: 'Top off every look' },
    Accessories: { name: 'The Accessories Shelf', blurb: 'The details that make the outfit' },
    Jewellery:   { name: 'The Jewellery Shelf',   blurb: 'A little sparkle goes a long way' }
  };
  const shelfMetaFor = cat => SHELF_META[cat] ||
    { name: `The ${cat} Shelf`, blurb: `Fresh ${String(cat).toLowerCase()} picks from Stacey` };

  const categories = [...new Set(deptProducts.map(p => p.category))];
  const shelves = [
    { key: 'featured', name: "Stacey's picks", blurb: 'Her favourites right now', items: deptProducts.filter(p => p.featured && p.inStock) },
    ...categories.map(cat => ({ key: cat, ...shelfMetaFor(cat), items: deptProducts.filter(p => p.category === cat) }))
  ].filter(s => s.items.length);

  if (!shelves.length) {
    container.innerHTML = `
      <div class="shelf-empty">
        <h2>New stock is on its way!</h2>
        <p>Stacey is curating fresh pieces for this department right now.
           Message her on WhatsApp and she'll find exactly what you're looking for.</p>
        <a href="https://wa.me/254702179011?text=${encodeURIComponent(`Hi Stacey! I'm looking for ${dept.crumb.toLowerCase()}' items — what do you have coming in?`)}"
           class="btn btn-whatsapp" target="_blank" rel="noopener noreferrer">Ask Stacey what's coming</a>
      </div>`;
    return true;
  }

  container.innerHTML = shelves.map(s => `
    <div class="shelf" data-shelf="${s.key}">
      <div class="shelf-header">
        <div>
          <h2 class="shelf-title">${s.name}</h2>
          <p class="shelf-blurb">${s.blurb}</p>
        </div>
        <div class="shelf-arrows">
          <button class="shelf-arrow" data-dir="-1" aria-label="Scroll ${s.name} left">‹</button>
          <button class="shelf-arrow" data-dir="1" aria-label="Scroll ${s.name} right">›</button>
        </div>
      </div>
      <div class="shelf-track" tabindex="0" role="group" aria-label="${s.name}">
        ${s.items.map(productCardHTML).join('')}
      </div>
    </div>`).join('');

  bindProductCardEvents(container);
  observeReveals(container);

  // Search across the shelves on this page.
  const search = $('shelf-search');
  if (search) {
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      let shown = 0;
      container.querySelectorAll('.shelf').forEach(shelf => {
        let inShelf = 0;
        shelf.querySelectorAll('.product-card').forEach(card => {
          const p = PRODUCTS.find(x => x.id === Number(card.dataset.id));
          const hay = p ? [p.name, p.category, p.description, ...(p.tags || [])].join(' ').toLowerCase() : '';
          const match = !q || hay.includes(q);
          card.hidden = !match;
          if (match) inShelf++;
        });
        shelf.hidden = !inShelf;
        shown += inShelf;
      });
      $('shelf-search-empty').hidden = shown > 0;
    });
  }

  // Arrow scrolling
  container.querySelectorAll('.shelf').forEach(shelf => {
    const track = shelf.querySelector('.shelf-track');
    shelf.querySelectorAll('.shelf-arrow').forEach(btn => {
      btn.addEventListener('click', () => {
        track.scrollBy({ left: Number(btn.dataset.dir) * track.clientWidth * 0.8, behavior: 'smooth' });
      });
    });
  });

  return true;
}

/* ================================================================
   HOME PAGE: new arrivals, department counts, promo banner
   ================================================================ */
function renderHome() {
  const track = $('new-arrivals-track');
  if (!track) return;

  // Newest first: Stacey's admin gives each new piece the next id.
  const fresh = [...PRODUCTS]
    .sort((a, b) => (b.inStock - a.inStock) || (b.id - a.id))
    .slice(0, 10);

  if (fresh.length) {
    track.innerHTML = fresh.map(productCardHTML).join('');
    bindProductCardEvents(track);
  } else {
    track.innerHTML = `
      <div class="arrivals-empty">
        <p class="arrivals-empty-title">New pieces are being photographed</p>
        <p>Stacey is adding this week's stock. Ask her what's in right now.</p>
        <a class="btn btn-whatsapp" href="${STACEY_WHATSAPP}?text=${encodeURIComponent("Hi Stacey! What's new in stock?")}"
           target="_blank" rel="noopener noreferrer">Ask on WhatsApp</a>
      </div>`;
  }

  // "12 pieces" on each department tile, from the live catalogue.
  document.querySelectorAll('[data-dept-count]').forEach(el => {
    const dept = DEPARTMENTS[el.dataset.deptCount];
    if (!dept) return;
    const n = PRODUCTS.filter(p => dept.genders.includes(p.gender) && p.inStock).length;
    el.textContent = n ? `${n} piece${n === 1 ? '' : 's'}` : 'Coming soon';
  });
}

function initPromo() {
  const track = $('promo-track');
  const dots = [...document.querySelectorAll('#promo-dots .promo-dot')];
  if (!track || !dots.length) return;
  const slides = [...track.children];

  const current = () => Math.round(track.scrollLeft / track.clientWidth);
  const go = i => track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
  const mark = () => dots.forEach((d, i) => d.setAttribute('aria-current', i === current() ? 'true' : 'false'));

  dots.forEach((d, i) => d.addEventListener('click', () => { go(i); restart(); }));
  track.addEventListener('scroll', () => requestAnimationFrame(mark), { passive: true });
  mark();

  // Gentle auto-advance, paused while the shopper is touching it, when the
  // tab is hidden, or if they prefer reduced motion.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  let timer;
  const restart = () => {
    clearInterval(timer);
    timer = setInterval(() => {
      if (document.hidden) return;
      go((current() + 1) % slides.length);
    }, 5500);
  };
  ['pointerdown', 'focusin'].forEach(ev => track.addEventListener(ev, () => clearInterval(timer)));
  ['pointerup', 'focusout'].forEach(ev => track.addEventListener(ev, restart));
  restart();
}

/* ================================================================
   PRODUCT DETAIL MODAL
   ================================================================ */
function openDetailModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const modal = $('product-detail-modal');
  const container = $('modal-content-container');
  const images = (p.images && p.images.length) ? p.images : [p.image];
  const sizes = p.sizes || [];
  const wishlisted = isWishlisted(id);

  let selectedSize = null;

  const galHTML = images.length > 1 ? `
    <div class="gallery-thumbnails" id="modal-gallery-thumbs">
      ${images.map((src, i) => `
        <button class="gallery-thumb ${i === 0 ? 'active' : ''}" data-idx="${i}" aria-label="View image ${i + 1}">
          <img src="${src}" alt="${p.name} view ${i + 1}" loading="lazy">
        </button>`).join('')}
    </div>` : '';

  const sizeHTML = sizes.length ? `
    <div class="size-picker-group">
      <span class="size-picker-label">Select Size</span>
      <div class="size-chips" id="modal-size-chips">
        ${sizes.map(s => `<button class="size-chip" data-size="${s}">${s}</button>`).join('')}
      </div>
      <p class="size-required-note" id="size-required-note">Please select a size to continue.</p>
    </div>` : '';

  container.innerHTML = `
    <div class="details-gallery">
      <div class="details-main-img-wrap">
        <img src="${images[0]}" alt="${p.name}" class="details-main-img" id="modal-main-img">
      </div>
      ${galHTML}
    </div>
    <div class="details-content">
      <span class="product-cat">${p.category} · ${p.gender}</span>
      <h2 class="details-title" id="modal-title">${p.name}</h2>
      <p class="details-price">${p.price.toLocaleString('en-KE')}</p>
      <p class="details-availability ${!p.inStock ? 'sold-out' : p.qty <= 3 ? 'low' : ''}">
        ${!p.inStock ? 'Out of stock — ask Stacey about a restock'
          : p.qty <= 3 ? `Almost gone — only ${p.qty} piece${p.qty !== 1 ? 's' : ''} left`
          : `In stock — ${p.qty} pieces available`}
      </p>
      <p class="details-desc">${p.description}</p>
      ${sizeHTML}
      <a href="https://wa.me/254702179011?text=${encodeURIComponent(`Hi Stacey! I'm interested in: *${p.name}* at KES ${p.price.toLocaleString('en-KE')}. Is it available?`)}"
         class="details-ask" target="_blank" rel="noopener noreferrer">Questions about sizes or colours? Ask Stacey on WhatsApp</a>
      <div class="details-actions">
        <button class="btn btn-primary details-add" id="modal-add-cart-btn" ${!p.inStock ? 'disabled' : ''}>
          ${p.inStock ? `Add to bag · KES ${p.price.toLocaleString('en-KE')}` : 'Sold out'}
        </button>
        <button class="modal-wishlist-btn ${wishlisted ? 'wishlisted' : ''}" id="modal-wishlist-btn"
                aria-label="${wishlisted ? 'Remove from' : 'Save to'} wishlist" aria-pressed="${wishlisted}">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${wishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <button class="modal-share-btn" id="modal-share-btn" aria-label="Share this piece">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
        </button>
      </div>
    </div>`;

  // Share: a link that opens the shop with this piece already showing.
  $('modal-share-btn')?.addEventListener('click', async () => {
    const url = `${SITE_ORIGIN}/?p=${p.id}`;
    const text = `${p.name} — KES ${p.price.toLocaleString('en-KE')} at Tacey Collections`;
    try {
      if (navigator.share) { await navigator.share({ title: p.name, text, url }); return; }
      await navigator.clipboard.writeText(`${text}\n${url}`);
      shopToast('Link copied — paste it into WhatsApp');
    } catch (err) {
      if (err?.name !== 'AbortError') shopToast('Could not share — copy the address from your browser');
    }
  });

  // Gallery thumbnail switching
  document.getElementById('modal-gallery-thumbs')?.addEventListener('click', e => {
    const thumb = e.target.closest('.gallery-thumb');
    if (!thumb) return;
    const idx = +thumb.dataset.idx;
    const mainImg = $('modal-main-img');
    document.querySelectorAll('#modal-gallery-thumbs .gallery-thumb').forEach(t => t.classList.remove('active'));
    thumb.classList.add('active');
    mainImg.classList.add('fade-out');
    setTimeout(() => {
      mainImg.src = images[idx];
      mainImg.classList.remove('fade-out');
    }, 220);
  });

  // Size chip selection
  document.getElementById('modal-size-chips')?.addEventListener('click', e => {
    const chip = e.target.closest('.size-chip');
    if (!chip) return;
    document.querySelectorAll('#modal-size-chips .size-chip').forEach(c => c.classList.remove('selected'));
    chip.classList.add('selected');
    selectedSize = chip.dataset.size;
    $('size-required-note')?.classList.remove('visible');
  });

  // Add to cart (with size check)
  $('modal-add-cart-btn')?.addEventListener('click', () => {
    if (sizes.length && !selectedSize) {
      $('size-required-note')?.classList.add('visible');
      return;
    }
    addToCart(id, selectedSize);
    modal.close();
  });

  // Wishlist toggle in modal
  $('modal-wishlist-btn')?.addEventListener('click', () => {
    toggleWishlist(id);
    const btn = $('modal-wishlist-btn');
    const wl = isWishlisted(id);
    btn.classList.toggle('wishlisted', wl);
    btn.setAttribute('aria-pressed', String(wl));
    btn.querySelector('svg').setAttribute('fill', wl ? 'currentColor' : 'none');
  });

  modal.showModal();
}

/* ================================================================
   CART
   ================================================================ */
function saveCart() {
  localStorage.setItem('tacey_cart', JSON.stringify(cart));
}

function addToCart(id, size = null) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p || !p.inStock) return;
  // Match by id + size combo
  const key = size ? `${id}__${size}` : String(id);
  const existing = cart.find(i => i.key === key);
  const inBag = existing ? existing.qty : 0;
  if (inBag >= p.qty) {
    shopToast(`Only ${p.qty} piece${p.qty !== 1 ? 's' : ''} of "${p.name}" available — all in your bag already!`);
    return;
  }
  if (existing) { existing.qty += 1; }
  else { cart.push({ key, id, qty: 1, size }); }
  saveCart();
  renderCart();
  flashCartBadge();
  shopToast(`"${p.name}"${size ? ` (${size})` : ''} added to your bag`);
}

function removeFromCart(key) {
  cart = cart.filter(i => (i.key || String(i.id)) !== key);
  saveCart();
  renderCart();
}

function changeQty(key, delta) {
  const item = cart.find(i => (i.key || String(i.id)) === key);
  if (!item) return;
  const p = PRODUCTS.find(x => x.id === item.id);
  const max = p ? Math.max(1, p.qty) : Infinity;
  const wanted = item.qty + delta;
  if (wanted > max) {
    shopToast(`Only ${max} piece${max !== 1 ? 's' : ''} available right now`);
    return;
  }
  item.qty = Math.max(1, wanted);
  saveCart();
  renderCart();
}

function flashCartBadge() {
  const badge = $('cart-count');
  if (!badge) return;
  badge.classList.remove('cart-badge-pop');
  void badge.offsetWidth;
  badge.classList.add('cart-badge-pop');
}

function getDeliveryFee() {
  const sel = $('delivery-location');
  if (!sel) return 0;
  const opt = sel.options[sel.selectedIndex];
  return parseInt(opt.dataset.fee || '0', 10);
}

function renderCart() {
  const container = $('cart-items-container');
  const badge     = $('cart-count');
  const subtotalEl= $('cart-subtotal');
  const feeEl     = $('cart-delivery-fee');
  const grandEl   = $('cart-grand-total');

  const totalQty = cart.reduce((s, i) => s + i.qty, 0);
  if (badge) badge.textContent = totalQty;

  if (!container) return;

  if (!cart.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;color:var(--color-text-muted);">
        <p>Your bag is empty.<br>Add something gorgeous!</p>
      </div>`;
    if (subtotalEl) subtotalEl.textContent = fmt(0);
    if (feeEl)      feeEl.textContent = 'Free';
    if (grandEl)    grandEl.textContent = fmt(0);
    return;
  }

  let subtotal = 0;
  container.innerHTML = cart.map(item => {
    const p = PRODUCTS.find(x => x.id === item.id);
    if (!p) return '';
    const lineTotal = p.price * item.qty;
    subtotal += lineTotal;
    const itemKey = item.key || String(item.id);
    const escKey = itemKey.replace(/"/g, '&quot;');
    return `
      <div class="cart-item" style="display:flex;gap:0.85rem;align-items:center;padding:0.85rem 0;border-bottom:1px solid var(--color-border);">
        <img src="${p.image}" alt="${p.name}" style="width:54px;height:54px;object-fit:cover;border-radius:8px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <p style="font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</p>
          <p style="font-size:0.8rem;color:var(--color-text-muted);">${item.size ? `Size: <strong>${item.size}</strong> · ` : ''}${fmt(p.price)} each</p>
          <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.35rem;">
            <button type="button" data-cart-act="dec" data-key="${escKey}" style="width:26px;height:26px;border:1px solid var(--color-border);border-radius:5px;font-size:1rem;display:grid;place-items:center;color:var(--color-text);" aria-label="Decrease quantity">−</button>
            <span style="font-size:0.9rem;font-weight:600;min-width:20px;text-align:center;">${item.qty}</span>
            <button type="button" data-cart-act="inc" data-key="${escKey}"  style="width:26px;height:26px;border:1px solid var(--color-border);border-radius:5px;font-size:1rem;display:grid;place-items:center;color:var(--color-text);" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <p style="font-weight:700;color:var(--color-accent);font-size:0.9rem;">${fmt(lineTotal)}</p>
          <button type="button" data-cart-act="remove" data-key="${escKey}" style="font-size:0.75rem;color:var(--color-error);margin-top:0.25rem;" aria-label="Remove ${p.name}">Remove</button>
        </div>
      </div>`;
  }).join('');

  const fee = getDeliveryFee();
  const grand = subtotal + fee;

  if (subtotalEl) subtotalEl.textContent = fmt(subtotal);
  if (feeEl)      feeEl.textContent = fee > 0 ? fmt(fee) : 'Free';
  if (grandEl)    grandEl.textContent = fmt(grand);
}

function buildWhatsAppMessage() {
  if (!cart.length) return '';
  const lines = cart.map(item => {
    const p = PRODUCTS.find(x => x.id === item.id);
    const sizeStr = item.size ? ` (Size: ${item.size})` : '';
    return `• ${p.name}${sizeStr} x${item.qty} = ${fmt(p.price * item.qty)}`;
  });
  const subtotal = cart.reduce((s, i) => {
    const p = PRODUCTS.find(x => x.id === i.id);
    return s + p.price * i.qty;
  }, 0);
  const fee  = getDeliveryFee();
  const sel  = $('delivery-location');
  const loc  = sel?.options[sel.selectedIndex]?.text || 'Self Pickup';
  const addr = $('delivery-address')?.value?.trim();
  const pickup = sel?.value === 'pickup';
  const grand = subtotal + fee;

  return `Hi Stacey! 👋 I'd like to place an order from Tacey Collections:

${lines.join('\n')}

🚚 Delivery: ${loc}${pickup ? '' : `\n📍 Address: ${addr || '(I will share it here)'}`}
─────────────────
🛍️ Subtotal:  ${fmt(subtotal)}
🚚 Delivery Fee: ${fmt(fee)}
💳 *Total:  ${fmt(grand)}*

Please confirm availability and M-Pesa payment details. Thank you!`;
}

/* ================================================================
   CART DRAWER
   ================================================================ */
function openCart() {
  const drawer = $('cart-drawer');
  renderCart();
  if (drawer && !drawer.open) {
    drawer.showModal();
    $('cart-toggle-btn')?.setAttribute('aria-expanded', 'true');
  }
}

function closeCart() {
  const drawer = $('cart-drawer');
  if (drawer?.open) {
    drawer.close();
    $('cart-toggle-btn')?.setAttribute('aria-expanded', 'false');
  }
}

/* ================================================================
   CONTACT DETAILS
   ================================================================ */
const STACEY_WHATSAPP = 'https://wa.me/254702179011';

/* M-Pesa details. These must match partials/paybill.html — the same numbers
   are published on /delivery and /faq, and a test fails if they drift. */
const MPESA = { paybill: '714888', account: '47046' };

/* ================================================================
   WISHLIST
   ================================================================ */
function saveWishlist() {
  localStorage.setItem('tacey_wishlist', JSON.stringify(wishlist));
}

function toggleWishlist(id) {
  const idx = wishlist.indexOf(id);
  if (idx === -1) {
    wishlist.push(id);
    const p = PRODUCTS.find(x => x.id === id);
    shopToast(`"${p?.name || 'Item'}" saved`);
  } else {
    wishlist.splice(idx, 1);
    shopToast('Removed from saved items');
  }
  saveWishlist();
  renderWishlistBadge();
  // The same piece can be on screen several times (new arrivals, a shelf,
  // the grid), so update every heart for it in place.
  const saved = isWishlisted(id);
  document.querySelectorAll(`.wishlist-btn[data-id="${id}"]`).forEach(btn => {
    btn.classList.toggle('wishlisted', saved);
    btn.setAttribute('aria-pressed', String(saved));
    btn.setAttribute('aria-label', `${saved ? 'Remove from' : 'Add to'} saved items`);
    btn.querySelector('svg')?.setAttribute('fill', saved ? 'currentColor' : 'none');
  });
}

function renderWishlistBadge() {
  const badge = $('wishlist-count');
  if (!badge) return;
  const count = wishlist.length;
  badge.textContent = count;
  badge.classList.toggle('visible', count > 0);
}

function renderWishlistDrawer() {
  const container = $('wishlist-items-container');
  if (!container) return;

  if (!wishlist.length) {
    container.innerHTML = `
      <div style="text-align:center;padding:3rem 1rem;color:var(--color-text-muted);">
        <p>No saved items yet.<br>Tap the heart on any product!</p>
      </div>`;
    return;
  }

  container.innerHTML = wishlist.map(id => {
    const p = PRODUCTS.find(x => x.id === id);
    if (!p) return '';
    return `
      <div class="wishlist-item">
        <img src="${p.image}" alt="${p.name}" class="wishlist-item-img">
        <div class="wishlist-item-info">
          <p class="wishlist-item-name">${p.name}</p>
          <p class="wishlist-item-price">KES ${p.price.toLocaleString('en-KE')}</p>
        </div>
        <div class="wishlist-item-actions">
          <button class="wishlist-add-btn" type="button" data-wish-act="add" data-id="${id}"
                  ${!p.inStock ? 'disabled style="opacity:0.4;cursor:not-allowed;"' : ''}>
            ${p.inStock ? '+ Add' : 'Out of Stock'}
          </button>
          <button class="wishlist-remove-btn" type="button" data-wish-act="remove" data-id="${id}">Remove</button>
        </div>
      </div>`;
  }).join('');
}

function openWishlist() {
  const drawer = $('wishlist-drawer');
  renderWishlistDrawer();
  if (drawer && !drawer.open) {
    drawer.showModal();
    $('wishlist-toggle-btn')?.setAttribute('aria-expanded', 'true');
  }
}

function closeWishlist() {
  const drawer = $('wishlist-drawer');
  if (drawer?.open) {
    drawer.close();
    $('wishlist-toggle-btn')?.setAttribute('aria-expanded', 'false');
  }
}

/* ================================================================
   TESTIMONIALS
   ================================================================ */
/* Real customer reviews only. Every entry here is published on the site with
   a name, a town and a star rating attached, so it has to be something a
   customer actually said — invented ones are false advertising, and shoppers
   in this market spot them instantly. The section hides itself while this is
   empty; add entries as Stacey collects them (a WhatsApp screenshot is
   enough) and it reappears. */
const TESTIMONIALS = [];

function starsHTML(n) {
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="star${i < n ? '' : ' empty'}">★</span>`).join('');
}

function renderTestimonials() {
  const grid = $('testimonials-grid');
  if (!grid) return;
  // No reviews yet — drop the whole section rather than show an empty heading.
  if (!TESTIMONIALS.length) {
    document.getElementById('testimonials')?.remove();
    document.querySelectorAll('a[href="/#testimonials"]').forEach(a => a.closest('li')?.remove());
    return;
  }
  grid.innerHTML = TESTIMONIALS.map(t => `
    <article class="testimonial-card reveal">
      <div class="star-rating">${starsHTML(t.rating)}</div>
      <p class="testimonial-text">${t.text}</p>
      <div class="testimonial-author">
        <div class="testimonial-avatar" aria-hidden="true">${t.avatar}</div>
        <div>
          <p class="testimonial-name">${t.name}</p>
          <p class="testimonial-location">📍 ${t.location}</p>
        </div>
        <span class="testimonial-verified">✔ Verified</span>
      </div>
    </article>`).join('');
  observeReveals(grid);
}

/* ================================================================
   MOBILE NAV
   ================================================================ */
function initMobileNav() {
  const menuBtn   = $('mobile-menu-btn');
  const drawer    = $('nav-drawer');
  const backdrop  = $('nav-drawer-backdrop');
  const closeBtn  = $('nav-drawer-close');

  if (!menuBtn || !drawer) return;

  function openNav() {
    drawer.classList.add('open');
    backdrop?.classList.add('open');
    menuBtn.classList.add('open');
    menuBtn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    closeBtn?.focus();
  }

  function closeNav() {
    drawer.classList.remove('open');
    backdrop?.classList.remove('open');
    menuBtn.classList.remove('open');
    menuBtn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    menuBtn.focus();
  }

  menuBtn.addEventListener('click', () => {
    drawer.classList.contains('open') ? closeNav() : openNav();
  });

  backdrop?.addEventListener('click', closeNav);
  closeBtn?.addEventListener('click', closeNav);

  // Close on nav link click
  drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', closeNav));

  $('nav-drawer-how')?.addEventListener('click', closeNav);

  // Escape key
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) closeNav();
  });

  // Focus trap inside drawer
  drawer.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const focusable = drawer.querySelectorAll('a, button, [tabindex]:not([tabindex="-1"])');
    const first = focusable[0];
    const last  = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
}

/* ================================================================
   FILTER + SEARCH EVENT LISTENERS
   ================================================================ */
function renderCategoryTabs() {
  const tablist = $('category-tablist');
  if (!tablist) return;
  const categories = [...new Set(PRODUCTS.map(p => p.category))];
  tablist.innerHTML = [
    `<button class="filter-tab active" role="tab" aria-selected="true" data-filter="category" data-value="all">All Items</button>`,
    ...categories.map(c => `<button class="filter-tab" role="tab" aria-selected="false" data-filter="category" data-value="${c}">${c}</button>`)
  ].join('');
}

function initFilters() {
  document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const group = tab.closest('[role="tablist"]');
      group.querySelectorAll('.filter-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');
      activeFilters[tab.dataset.filter] = tab.dataset.value;
      renderProducts();
    });
  });

  const searchInput = $('product-search');
  if (searchInput) {
    let debounceTimer;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        activeFilters.search = searchInput.value.trim();
        renderProducts();
      }, 280);
    });
  }
}

/* ================================================================
   MISC INIT
   ================================================================ */
function initNavbar() {
  const navbar = $('main-nav');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.style.background = window.scrollY > 60
      ? 'rgba(255,255,255,0.97)'
      : 'rgba(255,255,255,0.86)';
  }, { passive: true });
}

/* ── Pop-ups behave like app screens ──
   While the product sheet, bag or saved list is open the page behind stays
   put (swiping the sheet used to scroll the shop underneath, so closing it
   dropped you somewhere else), and the phone's Back button closes the
   pop-up instead of leaving the site. */
function initSheetBehaviour() {
  const ids = ['product-detail-modal', 'cart-drawer', 'wishlist-drawer'];
  let lockedY = 0;
  let ownBacks = 0;   // history.back() calls we made ourselves
  // We restore the position ourselves; the browser's own restore on Back
  // would jump to wherever the page was when the sheet opened (the top).
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  const anyOpen = () => ids.some(id => $(id)?.open);

  const lock = () => {
    if (document.body.classList.contains('sheet-open')) return;
    lockedY = window.scrollY;
    document.body.classList.add('sheet-open');
    document.body.style.top = `-${lockedY}px`;
  };
  const unlock = () => {
    if (anyOpen() || !document.body.classList.contains('sheet-open')) return;
    document.body.classList.remove('sheet-open');
    document.body.style.top = '';
    window.scrollTo({ top: lockedY, behavior: 'instant' });
  };

  ids.forEach(id => {
    const d = $(id);
    if (!d) return;
    const show = d.showModal.bind(d);
    d.showModal = () => {
      if (d.open) return;
      lock();
      show();
      history.pushState({ sheet: id }, '');
    };
    d.addEventListener('close', () => {
      unlock();
      // Closed with the X, Esc or a tap outside: drop the history entry we
      // added, so Back afterwards behaves normally.
      if (history.state?.sheet === id) { ownBacks++; history.back(); }
    });
  });

  window.addEventListener('popstate', () => {
    if (ownBacks > 0) { ownBacks--; return; }
    ids.forEach(id => { const d = $(id); if (d?.open) d.close(); });
  });
}

function initModals() {
  // Cart toggle
  $('cart-toggle-btn')?.addEventListener('click', openCart);
  $('close-cart-btn')?.addEventListener('click', closeCart);

  /* Delegated handlers for markup this file generates.
     These used to be inline onclick="..." attributes, which silently did
     nothing: app.js is loaded as type="module", so its functions never
     reach global scope and every click threw a ReferenceError. Delegation
     keeps the handlers in scope and survives re-renders. */
  $('cart-items-container')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-cart-act]');
    if (!btn) return;
    const { cartAct, key } = btn.dataset;
    if (cartAct === 'inc')    changeQty(key, 1);
    if (cartAct === 'dec')    changeQty(key, -1);
    if (cartAct === 'remove') removeFromCart(key);
  });

  $('wishlist-items-container')?.addEventListener('click', e => {
    const btn = e.target.closest('[data-wish-act]');
    if (!btn) return;
    const id = Number(btn.dataset.id);
    if (btn.dataset.wishAct === 'add') {
      addToCart(id);
    } else {
      toggleWishlist(id);
      renderWishlistDrawer();
    }
  });

  // Delivery fee live update; the address box only matters for delivery.
  const syncAddress = () => {
    const pickup = $('delivery-location')?.value === 'pickup';
    [$('delivery-address'), $('delivery-address-label')].forEach(el => { if (el) el.hidden = pickup; });
  };
  $('delivery-location')?.addEventListener('change', () => { syncAddress(); renderCart(); });
  syncAddress();

  // WhatsApp checkout
  $('checkout-whatsapp-btn')?.addEventListener('click', () => {
    if (!cart.length) { shopToast('Your bag is empty — add a piece first.'); return; }
    const msg = buildWhatsAppMessage();
    window.open(`${STACEY_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  });

  // Product detail modal close
  $('close-detail-modal')?.addEventListener('click', () => $('product-detail-modal')?.close());

  // Close dialogs on backdrop click
  ['product-detail-modal', 'cart-drawer'].forEach(id => {
    $(id)?.addEventListener('click', e => {
      if (e.target === $(id)) $(id).close();
    });
  });

  // After cart-drawer closes, reset aria
  $('cart-drawer')?.addEventListener('close', () => {
    $('cart-toggle-btn')?.setAttribute('aria-expanded', 'false');
  });
}

/* ================================================================
   BOOT
   ================================================================ */
/* ================================================================
   WISHLIST INIT
   ================================================================ */
function initWishlist() {
  $('wishlist-toggle-btn')?.addEventListener('click', openWishlist);
  $('close-wishlist-btn')?.addEventListener('click', closeWishlist);

  $('wishlist-drawer')?.addEventListener('click', e => {
    if (e.target === $('wishlist-drawer')) closeWishlist();
  });

  $('wishlist-drawer')?.addEventListener('close', () => {
    $('wishlist-toggle-btn')?.setAttribute('aria-expanded', 'false');
  });

  $('wishlist-add-all-btn')?.addEventListener('click', () => {
    if (!wishlist.length) return;
    wishlist.forEach(id => addToCart(id));
    closeWishlist();
    openCart();
  });

  $('wishlist-clear-btn')?.addEventListener('click', () => {
    wishlist = [];
    saveWishlist();
    renderWishlistBadge();
    renderWishlistDrawer();
    renderProducts();
    shopToast('Wishlist cleared');
  });

  renderWishlistBadge();
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadProductsFromApi();
  // Bags and saved lists live on the shopper's phone. Drop pieces that are
  // no longer in the shop (e.g. the old samples) so nothing breaks.
  const exists = id => PRODUCTS.some(p => p.id === id);
  if (PRODUCTS.length) {
    cart = cart.filter(item => exists(item.id));
    wishlist = wishlist.filter(exists);
    saveCart();
    saveWishlist();
  }
  renderDeptPage();
  renderHome();
  initPromo();
  renderCategoryTabs();
  renderProducts();
  renderCart();
  renderTestimonials();
  initFilters();
  initNavbar();
  initMobileNav();
  initModals();
  initSheetBehaviour();
  initWishlist();
  observeReveals();

  // Arriving from an info page's bag icon (/#cart) — open the drawer.
  if (location.hash === '#cart') {
    openCart();
    history.replaceState(null, '', location.pathname);
  }
  // A shared product link (/?p=12) opens that piece straight away.
  const sharedId = Number(new URLSearchParams(location.search).get('p'));
  if (sharedId && PRODUCTS.some(x => x.id === sharedId)) {
    openDetailModal(sharedId);
    history.replaceState(null, '', location.pathname);
  }
  if (location.hash === '#saved') {
    openWishlist();
    history.replaceState(null, '', location.pathname);
  }

  // CSS badge pop animation (inject once)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes badge-pop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
    .cart-badge-pop { animation: badge-pop 0.3s ease; }
  `;
  document.head.appendChild(style);
});
