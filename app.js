/**
 * Tacey Collections — app.js
 * Handles: Product catalog, Cart + Delivery, Style Matcher Quiz, Quick Answers chat
 */

/* ================================================================
   PRODUCT CATALOG — Stacey can update prices & add items here
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
    PRODUCTS = JSON.parse(localStorage.getItem('tacey_products') || 'null') || [
  {
    id: 1,
    name: "Neon Pulse Streetwear Sneakers",
    category: "Footwear",
    gender: "Unisex",
    price: 4500,
    image: "assets/product_sneakers.png",
    images: ["assets/product_sneakers.png"],
    sizes: ["38","39","40","41","42","43","44"],
    description: "Bold black streetwear sneakers with neon pink highlights. Lightweight sole, premium grip, and limited colorway. Perfect for street style outings.",
    tags: ["sneakers","shoes","streetwear","neon","unisex","casual"],
    inStock: true,
    featured: true
  },
  {
    id: 2,
    name: "Luxe Quilted Leather Handbag",
    category: "Bags",
    gender: "Female",
    price: 6800,
    image: "assets/product_handbag.png",
    images: ["assets/product_handbag.png"],
    sizes: [],
    description: "Timeless black quilted leather bag with gold chain strap. Spacious interior with suede lining. The must-have for any elevated wardrobe.",
    tags: ["bag","handbag","leather","luxury","quilted","gold","chain"],
    inStock: true,
    featured: true
  },
  {
    id: 3,
    name: "Velvet Drape Evening Gown",
    category: "Clothes",
    gender: "Female",
    price: 8200,
    image: "assets/product_dress.png",
    images: ["assets/product_dress.png"],
    sizes: ["XS","S","M","L","XL"],
    description: "Deep magenta velvet gown with elegant draping and a daring slit. Hand-stitched finishing. Perfect for galas, formal dinners, and weddings.",
    tags: ["dress","gown","evening","formal","velvet","gala","magenta"],
    inStock: true,
    featured: false
  },
  {
    id: 4,
    name: "Neon Stiletto High Heels",
    category: "Footwear",
    gender: "Female",
    price: 5200,
    image: "assets/product_heels.png",
    images: ["assets/product_heels.png"],
    sizes: ["36","37","38","39","40","41"],
    description: "Hot pink glossy stiletto heels with a sleek metallic base. Padded insole for all-night comfort. Designed to steal every spotlight.",
    tags: ["heels","stiletto","shoes","pink","neon","glam","night out"],
    inStock: true,
    featured: true
    }
  ];
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
let quizAnswers = {};
let currentQuizStep = 1;
const TOTAL_QUIZ_STEPS = 4; // 3 questions + selfie session
let quizSelfie = null;      // data URL — stays in the browser only
let quizCamStream = null;

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
    crumb: 'Women', emoji: '👠',
    title: "Women's Collection",
    tagline: 'Heels, gowns, bags and everyday glam — curated for her.',
    genders: ['Female', 'Unisex']
  },
  men: {
    crumb: 'Men', emoji: '👟',
    title: "Men's Collection",
    tagline: 'Sharp fits, clean kicks and versatile streetwear — built for him.',
    genders: ['Male', 'Unisex']
  },
  kids: {
    crumb: 'Kids', emoji: '🧸',
    title: "Kids' Corner",
    tagline: 'Playful, comfy and adorable picks for the little trendsetters.',
    genders: ['Kids']
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
        ${p.featured ? `<span class="product-badge product-badge-featured">★ Featured</span>` : ''}
        ${!p.inStock ? `<span class="product-badge product-badge-bottom product-badge-out">Out of Stock</span>` : ''}
        ${p.inStock && p.qty <= 3 ? `<span class="product-badge product-badge-bottom low-stock-badge">🔥 Only ${p.qty} left</span>` : ''}
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
            ${p.inStock ? '+ Add' : 'Sold Out'}
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
        <p style="font-size:2rem; margin-bottom:1rem;">🔍</p>
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
const SITE_ORIGIN = 'https://tacey.odhis.co.ke';

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
  const emoji = $('dept-emoji');   if (emoji)   emoji.textContent = dept.emoji;
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
    Footwear:    { icon: '👟', name: 'The Footwear Shelf',    blurb: 'Sneakers, heels and everything in between' },
    Bags:        { icon: '👜', name: 'The Bag Shelf',         blurb: 'Carry your style with you' },
    Clothes:     { icon: '👗', name: 'The Wardrobe Shelf',    blurb: 'Outfits for every occasion' },
    Hats:        { icon: '🧢', name: 'The Hat Shelf',         blurb: 'Top off every look' },
    Accessories: { icon: '✨', name: 'The Accessories Shelf', blurb: 'The details that make the outfit' },
    Jewellery:   { icon: '💎', name: 'The Jewellery Shelf',   blurb: 'A little sparkle goes a long way' }
  };
  const shelfMetaFor = cat => SHELF_META[cat] ||
    { icon: '🛍️', name: `The ${cat} Shelf`, blurb: `Fresh ${String(cat).toLowerCase()} picks from Stacey` };

  const categories = [...new Set(deptProducts.map(p => p.category))];
  const shelves = [
    { key: 'featured', icon: '⭐', name: 'Featured Picks', blurb: "Stacey's personal favourites this season", items: deptProducts.filter(p => p.featured && p.inStock) },
    ...categories.map(cat => ({ key: cat, ...shelfMetaFor(cat), items: deptProducts.filter(p => p.category === cat) }))
  ].filter(s => s.items.length);

  if (!shelves.length) {
    container.innerHTML = `
      <div class="shelf-empty">
        <p class="shelf-empty-emoji">${dept.emoji}</p>
        <h2>New stock is on its way!</h2>
        <p>Stacey is curating fresh pieces for this department right now.
           Message her on WhatsApp and she'll find exactly what you're looking for.</p>
        <a href="https://wa.me/254702179011?text=${encodeURIComponent(`Hi Stacey! I'm looking for ${dept.crumb.toLowerCase()}' items — what do you have coming in?`)}"
           class="btn btn-whatsapp" target="_blank" rel="noopener noreferrer">💬 Ask Stacey What's Coming</a>
      </div>`;
    return true;
  }

  container.innerHTML = shelves.map(s => `
    <div class="shelf" data-shelf="${s.key}">
      <div class="shelf-header">
        <div>
          <h2 class="shelf-title"><span class="shelf-icon" aria-hidden="true">${s.icon}</span> ${s.name}</h2>
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
        ${!p.inStock ? '🚫 Currently out of stock — ask Stacey about a restock'
          : p.qty <= 3 ? `🔥 Almost gone — only ${p.qty} piece${p.qty !== 1 ? 's' : ''} left`
          : `✔ In stock — ${p.qty} pieces available`}
      </p>
      <p class="details-desc">${p.description}</p>
      ${sizeHTML}
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:auto;">
        <button class="btn btn-primary" id="modal-add-cart-btn" ${!p.inStock ? 'disabled' : ''}>
          ${p.inStock ? '🛒 Add to Cart' : 'Sold Out'}
        </button>
        <button class="modal-wishlist-btn ${wishlisted ? 'wishlisted' : ''}" id="modal-wishlist-btn"
                aria-label="${wishlisted ? 'Remove from' : 'Save to'} wishlist" aria-pressed="${wishlisted}">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="${wishlisted ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
        </button>
        <a href="https://wa.me/254702179011?text=${encodeURIComponent(`Hi Stacey! I'm interested in: *${p.name}* at KES ${p.price.toLocaleString('en-KE')}. Is it available?`)}"
           class="btn btn-whatsapp" target="_blank" rel="noopener noreferrer">
          💬 Ask Stacey
        </a>
      </div>
    </div>`;

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
  shopToast(`✓ "${p.name}"${size ? ` (${size})` : ''} added to your bag`);
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
        <p style="font-size:2rem;margin-bottom:0.5rem;">🛍️</p>
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
  const addr = $('delivery-address')?.value?.trim() || 'N/A';
  const grand = subtotal + fee;

  return `Hi Stacey! 👋 I'd like to place an order from Tacey Collections:

${lines.join('\n')}

🚚 Delivery: ${loc}
📍 Address: ${addr}
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
   STYLE MATCHER QUIZ
   ================================================================ */
function openQuiz() {
  const modal = $('quiz-modal');
  quizAnswers = {};
  quizSelfie = null;
  currentQuizStep = 1;
  resetSelfieUI();
  renderQuizStep();
  modal?.showModal();
}

function renderQuizStep() {
  const steps = document.querySelectorAll('.quiz-step');
  steps.forEach(s => s.classList.toggle('active', +s.dataset.step === currentQuizStep));
  const progress = $('quiz-progress');
  if (progress) progress.style.width = `${((currentQuizStep - 1) / TOTAL_QUIZ_STEPS) * 100}%`;
  const indicator = $('quiz-step-indicator');
  if (indicator) indicator.textContent = currentQuizStep === 4 ? 'Lights, camera… 🎬'
    : currentQuizStep <= TOTAL_QUIZ_STEPS ? `Step ${currentQuizStep} of ${TOTAL_QUIZ_STEPS}` : 'Your Matches!';
  const prevBtn = $('quiz-prev-btn');
  if (prevBtn) prevBtn.style.visibility = currentQuizStep > 1 && currentQuizStep <= TOTAL_QUIZ_STEPS ? 'visible' : 'hidden';
  if (currentQuizStep !== 4) stopQuizCamera();
}

/* ── Selfie session (all local — nothing is uploaded) ── */
function resetSelfieUI() {
  stopQuizCamera();
  const vid = $('quiz-cam-video'), img = $('quiz-selfie-preview'), ph = $('quiz-cam-placeholder');
  if (vid) vid.hidden = true;
  if (img) { img.hidden = true; img.src = ''; }
  if (ph) ph.hidden = false;
  toggleSelfieActions('start');
}

function toggleSelfieActions(mode) {
  const map = { start: 'quiz-cam-actions', snap: 'quiz-snap-actions', done: 'quiz-selfie-actions' };
  Object.values(map).forEach(id => { const el = $(id); if (el) el.hidden = true; });
  const el = $(map[mode]);
  if (el) el.hidden = false;
}

async function startQuizCamera() {
  try {
    quizCamStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
    const vid = $('quiz-cam-video');
    vid.srcObject = quizCamStream;
    vid.hidden = false;
    $('quiz-cam-placeholder').hidden = true;
    $('quiz-selfie-preview').hidden = true;
    toggleSelfieActions('snap');
  } catch (err) {
    console.warn('Camera unavailable:', err);
    shopToast('📷 Camera not available — you can upload a photo instead');
  }
}

function stopQuizCamera() {
  if (quizCamStream) {
    quizCamStream.getTracks().forEach(t => t.stop());
    quizCamStream = null;
  }
  const vid = $('quiz-cam-video');
  if (vid) { vid.srcObject = null; vid.hidden = true; }
}

function snapQuizSelfie() {
  const vid = $('quiz-cam-video');
  if (!vid || !vid.videoWidth) return;
  const size = Math.min(vid.videoWidth, vid.videoHeight);
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 640;
  const ctx = canvas.getContext('2d');
  // Mirror it so the photo matches what they saw in the preview.
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(vid, (vid.videoWidth - size) / 2, (vid.videoHeight - size) / 2, size, size, 0, 0, canvas.width, canvas.height);
  setQuizSelfie(canvas.toDataURL('image/jpeg', 0.92));
}

function setQuizSelfie(dataUrl) {
  quizSelfie = dataUrl;
  stopQuizCamera();
  const img = $('quiz-selfie-preview');
  if (img) { img.src = dataUrl; img.hidden = false; }
  $('quiz-cam-placeholder').hidden = true;
  toggleSelfieActions('done');
}

function getQuizMatches() {
  let results = PRODUCTS.filter(p => p.inStock);
  if (quizAnswers.gender && quizAnswers.gender !== 'all') {
    results = results.filter(p => p.gender === quizAnswers.gender || p.gender === 'Unisex');
  }
  if (quizAnswers.category) {
    results = results.filter(p => p.category === quizAnswers.category);
  }
  if (!results.length) results = PRODUCTS.filter(p => p.inStock).slice(0, 3);
  return results;
}

function quizResultRow(p) {
  return `
    <div style="display:flex;gap:1rem;padding:0.85rem;border:1px solid var(--color-border);border-radius:10px;margin-bottom:0.75rem;cursor:pointer;transition:border-color 0.2s;"
         data-quiz-pick="${p.id}" onmouseenter="this.style.borderColor='var(--color-primary-glow)'" onmouseleave="this.style.borderColor='var(--color-border)'">
      <img src="${p.image}" alt="${p.name}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;">
      <div>
        <p style="font-weight:600;font-size:0.95rem;">${p.name}</p>
        <p style="color:var(--color-text-muted);font-size:0.82rem;">${p.category} · ${p.gender}</p>
        <p style="color:var(--color-accent);font-weight:700;margin-top:0.25rem;">${fmt(p.price)}</p>
      </div>
    </div>`;
}

function showQuizResults() {
  const container = $('quiz-results-container');
  if (!container) return;
  stopQuizCamera();
  const progress = $('quiz-progress');
  if (progress) progress.style.width = '100%';
  const indicator = $('quiz-step-indicator');
  if (indicator) indicator.textContent = quizSelfie ? 'Showtime! 🎭' : 'Your Matches!';

  const results = getQuizMatches();

  if (quizSelfie) {
    // ── The private fashion show: curtains part to reveal the shopper's look ──
    container.innerHTML = `
      <div class="show-stage" id="show-stage">
        <div class="show-content">
          <p class="show-billing">✦ Tonight, on the Tacey runway ✦</p>
          <div class="show-star-frame">
            <img src="${quizSelfie}" alt="Your selfie" class="show-star-img">
            <span class="show-spotlight" aria-hidden="true"></span>
          </div>
          <h3 class="show-headline">Starring: You</h3>
          <p class="show-sub">Styled by Stacey with your perfect matches</p>
          <div class="show-picks">
            ${results.slice(0, 3).map(p => `
              <button class="show-pick" type="button" data-quiz-pick="${p.id}">
                <img src="${p.image}" alt="${p.name}">
                <span class="show-pick-name">${p.name}</span>
                <span class="show-pick-price">${fmt(p.price)}</span>
              </button>`).join('')}
          </div>
          <div class="show-actions">
            <button class="btn btn-primary" id="save-look-btn">💾 Save My Look Card</button>
            <a class="btn btn-whatsapp"
               href="https://wa.me/254702179011?text=${encodeURIComponent(`Hi Stacey! 🎭 The Style Matcher matched me with: ${results.slice(0, 3).map(p => p.name).join(', ')}. What do you think fits me best?`)}"
               target="_blank" rel="noopener noreferrer">💬 Ask Stacey About My Look</a>
          </div>
        </div>
        <div class="curtain curtain-left" aria-hidden="true"></div>
        <div class="curtain curtain-right" aria-hidden="true"></div>
        <button class="show-reveal-btn" id="open-curtains-btn">🎭 Open the Curtains</button>
      </div>`;

    $('open-curtains-btn')?.addEventListener('click', () => {
      $('show-stage')?.classList.add('open');
      setTimeout(() => $('open-curtains-btn')?.remove(), 900);
    });
    $('save-look-btn')?.addEventListener('click', () => downloadLookCard(results.slice(0, 2)));
  } else {
    container.innerHTML = `
      <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:1rem;color:var(--color-accent);">✨ Perfect picks for you:</h3>
      ${results.map(quizResultRow).join('')}
      <button class="btn btn-ghost" type="button" data-quiz-close style="width:100%;margin-top:0.5rem;">Browse Full Catalog</button>`;
  }

  const steps = document.querySelectorAll('.quiz-step');
  steps.forEach(s => s.classList.remove('active'));
  container.classList.add('active');
  const prevBtn = $('quiz-prev-btn');
  if (prevBtn) prevBtn.style.visibility = 'hidden';
}

/* ── Look card: selfie + matches composed on a canvas, saved locally ── */
function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function downloadLookCard(picks) {
  try {
    const W = 900, H = 1280;
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#0d0a12';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(W / 2, 300, 60, W / 2, 300, 500);
    glow.addColorStop(0, 'rgba(255,42,133,0.28)');
    glow.addColorStop(1, 'transparent');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // Selfie in a circular gold-rimmed frame
    const selfieImg = await loadImage(quizSelfie);
    ctx.save();
    ctx.beginPath();
    ctx.arc(W / 2, 300, 200, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(selfieImg, W / 2 - 200, 100, 400, 400);
    ctx.restore();
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#e9c48b';
    ctx.beginPath();
    ctx.arc(W / 2, 300, 204, 0, Math.PI * 2);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 56px sans-serif';
    ctx.fillText('My Tacey Look', W / 2, 590);
    ctx.fillStyle = '#e9c48b';
    ctx.font = 'italic 30px serif';
    ctx.fillText('Style that speaks for you', W / 2, 640);

    // Matched pieces
    const y = 700, size = 330, gap = 40;
    const startX = picks.length === 1 ? (W - size) / 2 : (W - size * picks.length - gap * (picks.length - 1)) / 2;
    for (let i = 0; i < picks.length; i++) {
      const img = await loadImage(picks[i].image);
      const x = startX + i * (size + gap);
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, size, size, 24);
      ctx.clip();
      ctx.drawImage(img, x, y, size, size);
      ctx.restore();
      ctx.fillStyle = '#ffffff';
      ctx.font = '600 26px sans-serif';
      ctx.fillText(picks[i].name.length > 24 ? picks[i].name.slice(0, 23) + '…' : picks[i].name, x + size / 2, y + size + 44);
      ctx.fillStyle = '#e9c48b';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(fmt(picks[i].price), x + size / 2, y + size + 84);
    }

    ctx.fillStyle = '#ff2a85';
    ctx.font = 'bold 30px sans-serif';
    ctx.fillText('Tacey Collections · WhatsApp +254 702 179 011', W / 2, H - 60);

    const link = document.createElement('a');
    link.download = 'my-tacey-look.jpg';
    link.href = canvas.toDataURL('image/jpeg', 0.92);
    link.click();
    shopToast('💾 Look card saved — share it with Stacey!');
  } catch (err) {
    console.error(err);
    shopToast('⚠️ Could not create the look card on this device');
  }
}

/* ================================================================
   TACEY AI — Knowledge Base & Engine
   ================================================================ */
const STACEY_WHATSAPP = 'https://wa.me/254702179011';

/* M-Pesa details. These must match partials/paybill.html — the same numbers
   are published on /delivery and /faq, and a test fails if they drift. */
const MPESA = { paybill: '714888', account: '47046' };

const AI_KB = {
  greet: [
    "Hi there! 👋 I can check what's in stock, prices and delivery for you. What are you looking for — shoes, bags, or clothing?",
    "Hey! Welcome to Tacey Collections 💅 Ask me about prices, what's in stock, or delivery — and I'll put you through to Stacey for anything else.",
    "Hello! Tell me what you're after and I'll show you what's on the shelves right now. ✨"
  ],
  delivery: `🚚 **Delivery Info**

We deliver all across Kenya! Here's the fee breakdown:

• 🏪 **Self Pickup** — Free
• 📍 **Nairobi CBD** — KES 150
• 🏘️ **Nairobi Suburbs** (Westlands, Kilimani, Lavington…) — KES 300
• 🚗 **Kiambu / Thika** — KES 400
• ✈️ **Mombasa / Kisumu / Nakuru** — KES 500
• 🗺️ **Rest of Kenya (Upcountry)** — KES 600

Just add items to your cart, select your location in the cart drawer, and confirm via WhatsApp. Stacey handles the rest!`,

  hours: `⏰ Stacey replies on WhatsApp **Monday to Saturday, 9:00am – 7:00pm EAT**. Messages sent outside those hours are answered first thing the next morning — and this chat can check stock, prices and delivery any time.`,

  payment: `💳 **Payment Methods**

• **M-Pesa** — Paybill **${MPESA.paybill}**, Account **${MPESA.account}**
• **Cash on pickup** — for self-collection orders

Send your bag through on WhatsApp first. Stacey confirms the items and the final total including delivery, and only then do you pay — forward her the M-Pesa confirmation message and your order goes out.`,

  returns: `🔄 **Returns & Exchanges**

Not happy with your item? No worries — contact Stacey within **48 hours** of receiving your order via WhatsApp (+254 702 179 011) and we'll sort it out!`,

  contact: `📞 **Contact Stacey directly:**
• WhatsApp: +254 702 179 011
• Instagram: @tacey_collections

Click below to open a WhatsApp chat right now 👇`
};

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function aiGetProducts(category, gender) {
  let list = PRODUCTS.filter(p => p.inStock);
  if (category) list = list.filter(p => p.category.toLowerCase() === category.toLowerCase());
  if (gender)   list = list.filter(p => p.gender === gender || (gender !== 'Kids' && p.gender === 'Unisex'));
  return list;
}

function buildProductCards(list) {
  return list.slice(0, 4).map(p => `
    <button class="ai-product-card" data-product-id="${p.id}" aria-label="View ${p.name}">
      <img src="${p.image}" alt="${p.name}" class="ai-product-card-img">
      <div class="ai-product-card-info">
        <p class="ai-product-card-name">${p.name}</p>
        <p class="ai-product-card-price">${fmt(p.price)}</p>
      </div>
    </button>`).join('');
}

function processAIQuery(raw) {
  const q = raw.toLowerCase().trim();

  /* --- Greetings --- */
  if (/^(hi|hello|hey|hii|sup|howdy|yo)\b/.test(q)) {
    return { text: pickRandom(AI_KB.greet) };
  }

  /* --- Delivery --- */
  if (/deliver|shipping|ship|location|fee|doorstep|nairobi|mombasa|kisumu|upcountry|thika|kiambu/.test(q)) {
    return { text: AI_KB.delivery };
  }

  /* --- Payment --- */
  if (/pay|mpesa|m-pesa|cash|payment|how do i pay/.test(q)) {
    return { text: AI_KB.payment };
  }

  /* --- Hours --- */
  if (/hours?|open|available|time|when/.test(q)) {
    return { text: AI_KB.hours };
  }

  /* --- Returns --- */
  if (/return|exchange|refund|wrong|damaged|broken/.test(q)) {
    return { text: AI_KB.returns };
  }

  /* --- Contact / Speak to Human --- */
  if (/contact|speak|stacey|human|talk|call|whatsapp|instagram/.test(q)) {
    return { text: AI_KB.contact, showWhatsApp: true };
  }

  /* --- Price queries --- */
  if (/price|cost|how much|expensive|afford|cheap/.test(q)) {
    const inStockPrices = PRODUCTS.filter(p => p.inStock).map(p => `• **${p.name}** — ${fmt(p.price)}`);
    return { text: `💰 **Current Prices:**\n\n${inStockPrices.join('\n')}\n\nWant to add something to your cart? Just ask! 🛒` };
  }

  /* --- Footwear queries --- */
  if (/shoe|shoes|sneaker|heel|boot|footwear|kicks/.test(q)) {
    const gender = /kid|child|children|baby|toddler/.test(q) ? 'Kids' : /men|male|guys|his/.test(q) ? 'Male' : /women|female|ladies|girls|her/.test(q) ? 'Female' : null;
    const list = aiGetProducts('Footwear', gender);
    if (!list.length) return { text: "Hmm, I don't have footwear matching that filter right now. Want me to check other options or connect you with Stacey?", escalate: true };
    return {
      text: `👟 Here are our current footwear options${gender ? ` for ${gender}` : ''}:`,
      cards: buildProductCards(list)
    };
  }

  /* --- Bags --- */
  if (/bag|handbag|purse|clutch|tote/.test(q)) {
    const list = aiGetProducts('Bags', null);
    if (!list.length) return { text: "No bags in stock right now, but Stacey may have new arrivals soon! Want to ask her directly?", escalate: true };
    return { text: `👜 Here are our bags:`, cards: buildProductCards(list) };
  }

  /* --- Clothes / Dresses --- */
  if (/dress|cloth|outfit|wear|gown|top|trouser|skirt|shirt|fashion/.test(q)) {
    const list = aiGetProducts('Clothes', null);
    if (!list.length) return { text: "We're restocking clothes soon! Want to get notified? Ask Stacey via WhatsApp.", escalate: true };
    return { text: `👗 Our clothing collection:`, cards: buildProductCards(list) };
  }

  /* --- All products / what do you have --- */
  if (/all|catalog|collection|what.*(have|sell|stock)|show me/.test(q)) {
    const inStock = PRODUCTS.filter(p => p.inStock);
    return {
      text: `✨ Here's everything in our current collection (${inStock.length} items):`,
      cards: buildProductCards(inStock)
    };
  }

  /* --- Out of stock / specific item not found --- */
  if (/stock|available|sold out|out of/.test(q)) {
    const outOfStock = PRODUCTS.filter(p => !p.inStock);
    if (!outOfStock.length) {
      return { text: "Great news — everything in the catalog is currently in stock! 🎉" };
    }
    return { text: `These items are currently sold out:\n${outOfStock.map(p => `• ${p.name}`).join('\n')}\n\nFor re-stock updates, contact Stacey on WhatsApp!`, escalate: true };
  }

  /* --- Specific product name search --- */
  const nameMatch = PRODUCTS.filter(p =>
    p.name.toLowerCase().includes(q) || (p.tags || []).some(t => q.includes(t))
  );
  if (nameMatch.length) {
    return {
      text: `🔎 Found ${nameMatch.length} match${nameMatch.length > 1 ? 'es' : ''}:`,
      cards: buildProductCards(nameMatch)
    };
  }

  /* --- Fallback: escalate to Stacey --- */
  return {
    text: `Hmm, I'm not sure about that one! 🤔 Let me connect you directly with Stacey — she'll have the answer in seconds!`,
    escalate: true
  };
}

/* ================================================================
   AI CHAT UI
   ================================================================ */
let chatOpen = false;

function initAIChat() {
  const bubbleBtn  = $('ai-bubble-btn');
  const chatWindow = $('ai-chat-window');
  const closeBtn   = $('ai-chat-close');
  const form       = $('ai-input-bar');
  const input      = $('ai-input');
  const messages   = $('ai-messages');
  const chips      = $('ai-chips');

  if (!bubbleBtn || !chatWindow) return;

  // Toggle chat open/close
  bubbleBtn.addEventListener('click', () => {
    chatOpen = !chatOpen;
    chatWindow.hidden = !chatOpen;
    bubbleBtn.setAttribute('aria-expanded', String(chatOpen));
    if (chatOpen) {
      // Show welcome message on first open
      if (!messages.children.length) {
        appendBotMsg(pickRandom(AI_KB.greet));
      }
      input.focus();
    }
  });

  closeBtn.addEventListener('click', () => {
    chatOpen = false;
    chatWindow.hidden = true;
    bubbleBtn.setAttribute('aria-expanded', 'false');
  });

  // Quick reply chips
  chips?.addEventListener('click', e => {
    const chip = e.target.closest('.ai-chip');
    if (!chip) return;
    const msg = chip.dataset.msg;
    if (msg) handleUserMessage(msg);
  });

  // Form submit
  form?.addEventListener('submit', e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    handleUserMessage(text);
  });

  // Product card clicks inside chat
  messages?.addEventListener('click', e => {
    const card = e.target.closest('.ai-product-card');
    if (!card) return;
    const id = +card.dataset.productId;
    chatWindow.hidden = true;
    chatOpen = false;
    openDetailModal(id);
  });
}

function appendMsg(role, html) {
  const messages = $('ai-messages');
  if (!messages) return;
  const wrapper = document.createElement('div');
  wrapper.className = `ai-msg ${role}`;
  wrapper.innerHTML = `<div class="ai-msg-bubble">${html}</div>`;
  messages.appendChild(wrapper);
  messages.scrollTop = messages.scrollHeight;
  return wrapper;
}

function appendBotMsg(text, extra = '') {
  const safeText = text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\n/g, '<br>');
  appendMsg('bot', safeText + extra);
}

function showTypingIndicator() {
  const messages = $('ai-messages');
  if (!messages) return null;
  const el = document.createElement('div');
  el.className = 'ai-typing';
  el.id = 'ai-typing-indicator';
  el.innerHTML = '<span></span><span></span><span></span>';
  messages.appendChild(el);
  messages.scrollTop = messages.scrollHeight;
  return el;
}

function handleUserMessage(text) {
  appendMsg('user', text);
  const input = $('ai-input');
  if (input) input.value = '';

  const typing = showTypingIndicator();

  // Simulate a short "thinking" delay for realism
  const delay = 600 + Math.random() * 600;
  setTimeout(() => {
    typing?.remove();
    const response = processAIQuery(text);

    let extra = '';
    if (response.cards) {
      extra = `<div style="display:flex;flex-direction:column;gap:0.4rem;margin-top:0.5rem;">${response.cards}</div>`;
    }
    if (response.showWhatsApp) {
      extra += `<a href="${STACEY_WHATSAPP}" target="_blank" rel="noopener noreferrer"
        style="display:inline-flex;align-items:center;gap:0.4rem;margin-top:0.6rem;padding:0.5rem 0.9rem;background:var(--color-success);color:#fff;border-radius:8px;font-size:0.82rem;font-weight:600;text-decoration:none;">
        💬 Chat with Stacey on WhatsApp
      </a>`;
    }
    if (response.escalate) {
      extra += `<div class="ai-escalate-notice">
        <span>⚡</span>
        <span>Or <a href="${STACEY_WHATSAPP}" target="_blank" rel="noopener noreferrer" style="color:var(--color-primary);text-decoration:underline;">WhatsApp Stacey</a> for instant help</span>
      </div>`;
    }

    appendBotMsg(response.text, extra);
  }, delay);
}

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
    shopToast(`💜 "${p?.name || 'Item'}" saved to wishlist`);
  } else {
    wishlist.splice(idx, 1);
    shopToast('Removed from wishlist');
  }
  saveWishlist();
  renderWishlistBadge();
  // Re-render product cards so heart state updates
  renderProducts();
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
        <p style="font-size:2rem;margin-bottom:0.5rem;">💜</p>
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

  // Quiz trigger inside drawer
  $('nav-drawer-quiz-btn')?.addEventListener('click', () => { closeNav(); openQuiz(); });
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
   QUIZ EVENT LISTENERS
   ================================================================ */
function initQuiz() {
  document.querySelectorAll('.quiz-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const step = opt.closest('.quiz-step');
      step.querySelectorAll('.quiz-option').forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      quizAnswers[opt.dataset.answer] = opt.dataset.value;

      setTimeout(() => {
        if (currentQuizStep < TOTAL_QUIZ_STEPS) {
          currentQuizStep++;
          renderQuizStep();
        } else {
          showQuizResults();
        }
      }, 350);
    });
  });

  $('quiz-prev-btn')?.addEventListener('click', () => {
    if (currentQuizStep > 1) {
      currentQuizStep--;
      renderQuizStep();
    }
  });

  const quizTriggers = ['nav-quiz-trigger', 'header-quiz-btn', 'hero-quiz-btn'];
  quizTriggers.forEach(id => $(`${id}`)?.addEventListener('click', openQuiz));

  $('close-quiz-modal')?.addEventListener('click', () => $('quiz-modal')?.close());
  $('quiz-modal')?.addEventListener('close', stopQuizCamera);

  // Selfie session controls
  $('quiz-cam-start')?.addEventListener('click', startQuizCamera);
  $('quiz-cam-snap')?.addEventListener('click', snapQuizSelfie);
  $('quiz-cam-cancel')?.addEventListener('click', resetSelfieUI);
  $('quiz-cam-skip')?.addEventListener('click', () => { quizSelfie = null; showQuizResults(); });
  $('quiz-retake-btn')?.addEventListener('click', resetSelfieUI);
  $('quiz-show-btn')?.addEventListener('click', showQuizResults);
  $('quiz-selfie-upload')?.addEventListener('change', e => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setQuizSelfie(reader.result);
    reader.readAsDataURL(file);
    e.target.value = '';
  });
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

  $('quiz-results-container')?.addEventListener('click', e => {
    if (e.target.closest('[data-quiz-close]')) { $('quiz-modal')?.close(); return; }
    const pick = e.target.closest('[data-quiz-pick]');
    if (!pick) return;
    $('quiz-modal')?.close();
    openDetailModal(Number(pick.dataset.quizPick));
  });

  // Delivery fee live update
  $('delivery-location')?.addEventListener('change', renderCart);

  // WhatsApp checkout
  $('checkout-whatsapp-btn')?.addEventListener('click', () => {
    if (!cart.length) { alert('Add some items to your cart first! 🛍️'); return; }
    const msg = buildWhatsAppMessage();
    window.open(`${STACEY_WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer');
  });

  // Product detail modal close
  $('close-detail-modal')?.addEventListener('click', () => $('product-detail-modal')?.close());

  // Close dialogs on backdrop click
  ['product-detail-modal', 'cart-drawer', 'quiz-modal'].forEach(id => {
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
  renderDeptPage();
  renderCategoryTabs();
  renderProducts();
  renderCart();
  renderTestimonials();
  initFilters();
  initQuiz();
  initNavbar();
  initMobileNav();
  initModals();
  initWishlist();
  initAIChat();
  observeReveals();

  // Arriving from an info page's bag icon (/#cart) — open the drawer.
  if (location.hash === '#cart') {
    openCart();
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
