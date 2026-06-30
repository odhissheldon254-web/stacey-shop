/**
 * Tacey Collections — app.js
 * Handles: Product catalog, Cart + Delivery, Style Matcher Quiz, Tacey AI Chatbot
 */

/* ================================================================
   PRODUCT CATALOG — Stacey can update prices & add items here
   ================================================================ */
let PRODUCTS = JSON.parse(localStorage.getItem('tacey_products') || 'null') || [
  {
    id: 1,
    name: "Neon Pulse Streetwear Sneakers",
    category: "Footwear",
    gender: "Unisex",
    price: 4500,
    image: "assets/product_sneakers.png",
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
    description: "Hot pink glossy stiletto heels with a sleek metallic base. Padded insole for all-night comfort. Designed to steal every spotlight.",
    tags: ["heels","stiletto","shoes","pink","neon","glam","night out"],
    inStock: true,
    featured: true
  }
];

// Save products to localStorage so admin changes persist
function saveProducts() {
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
let activeFilters = { category: 'all', gender: 'all', search: '' };
let quizAnswers = {};
let currentQuizStep = 1;
const TOTAL_QUIZ_STEPS = 3;

/* ================================================================
   HELPERS
   ================================================================ */
const $ = id => document.getElementById(id);
const fmt = n => `KES ${Number(n).toLocaleString('en-KE')}`;

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

function renderProducts(list = getFilteredProducts()) {
  const grid = $('product-grid-container');
  if (!grid) return;

  if (!list.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1; text-align:center; padding:4rem 1rem; color:var(--color-text-muted);">
        <p style="font-size:2rem; margin-bottom:1rem;">🔍</p>
        <p style="font-size:1.1rem;">No items match your search. Try adjusting the filters or ask <strong>Tacey AI</strong> for help!</p>
      </div>`;
    return;
  }

  grid.innerHTML = list.map(p => `
    <article class="product-card" data-id="${p.id}" tabindex="0" role="button"
             aria-label="View details for ${p.name}" style="${!p.inStock ? 'opacity:0.5;' : ''}">
      <div class="product-img-container">
        <img src="${p.image}" alt="${p.name}" class="product-img" loading="lazy">
        <span class="product-badge">${p.gender}</span>
        ${p.featured ? `<span class="product-badge" style="left:auto;right:0.75rem;color:var(--color-primary);border-color:var(--color-primary-glow);">★ Featured</span>` : ''}
        ${!p.inStock ? `<span class="product-badge" style="top:auto;bottom:0.75rem;left:0.75rem;color:var(--color-error);">Out of Stock</span>` : ''}
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
    </article>`).join('');

  // Card click → open detail modal
  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.product-card-btn')) return;
      openDetailModal(+card.dataset.id);
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetailModal(+card.dataset.id); }
    });
  });

  // Add-to-cart buttons
  grid.querySelectorAll('.product-card-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      addToCart(+btn.dataset.id);
    });
  });
}

/* ================================================================
   PRODUCT DETAIL MODAL
   ================================================================ */
function openDetailModal(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  const modal = $('product-detail-modal');
  const container = $('modal-content-container');

  container.innerHTML = `
    <div class="details-img-wrap">
      <img src="${p.image}" alt="${p.name}" class="details-img">
    </div>
    <div class="details-content">
      <span class="product-cat">${p.category} · ${p.gender}</span>
      <h2 class="details-title" id="modal-title">${p.name}</h2>
      <p class="details-price">${p.price.toLocaleString('en-KE')}</p>
      <p class="details-desc">${p.description}</p>
      <div style="display:flex;gap:0.75rem;flex-wrap:wrap;margin-top:auto;">
        <button class="btn btn-primary" id="modal-add-cart-btn" ${!p.inStock ? 'disabled' : ''}>
          ${p.inStock ? '🛒 Add to Cart' : 'Sold Out'}
        </button>
        <a href="https://wa.me/254702179011?text=${encodeURIComponent(`Hi Stacey! I'm interested in: *${p.name}* at KES ${p.price.toLocaleString('en-KE')}. Is it available?`)}"
           class="btn btn-whatsapp" target="_blank" rel="noopener noreferrer">
          💬 Ask Stacey
        </a>
      </div>
    </div>`;

  $('modal-add-cart-btn')?.addEventListener('click', () => {
    addToCart(id);
    modal.close();
  });

  modal.showModal();
}

/* ================================================================
   CART
   ================================================================ */
function saveCart() {
  localStorage.setItem('tacey_cart', JSON.stringify(cart));
}

function addToCart(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p || !p.inStock) return;
  const existing = cart.find(i => i.id === id);
  if (existing) { existing.qty += 1; }
  else { cart.push({ id, qty: 1 }); }
  saveCart();
  renderCart();
  flashCartBadge();
}

function removeFromCart(id) {
  cart = cart.filter(i => i.id !== id);
  saveCart();
  renderCart();
}

function changeQty(id, delta) {
  const item = cart.find(i => i.id === id);
  if (!item) return;
  item.qty = Math.max(1, item.qty + delta);
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
    return `
      <div class="cart-item" style="display:flex;gap:0.85rem;align-items:center;padding:0.85rem 0;border-bottom:1px solid var(--color-border);">
        <img src="${p.image}" alt="${p.name}" style="width:54px;height:54px;object-fit:cover;border-radius:8px;flex-shrink:0;">
        <div style="flex:1;min-width:0;">
          <p style="font-weight:600;font-size:0.9rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${p.name}</p>
          <p style="font-size:0.8rem;color:var(--color-text-muted);">${fmt(p.price)} each</p>
          <div style="display:flex;align-items:center;gap:0.5rem;margin-top:0.35rem;">
            <button onclick="changeQty(${p.id},-1)" style="width:26px;height:26px;border:1px solid var(--color-border);border-radius:5px;font-size:1rem;display:grid;place-items:center;color:var(--color-text);" aria-label="Decrease quantity">−</button>
            <span style="font-size:0.9rem;font-weight:600;min-width:20px;text-align:center;">${item.qty}</span>
            <button onclick="changeQty(${p.id},1)"  style="width:26px;height:26px;border:1px solid var(--color-border);border-radius:5px;font-size:1rem;display:grid;place-items:center;color:var(--color-text);" aria-label="Increase quantity">+</button>
          </div>
        </div>
        <div style="text-align:right;flex-shrink:0;">
          <p style="font-weight:700;color:var(--color-accent);font-size:0.9rem;">${fmt(lineTotal)}</p>
          <button onclick="removeFromCart(${p.id})" style="font-size:0.75rem;color:var(--color-error);margin-top:0.25rem;" aria-label="Remove ${p.name}">Remove</button>
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
    return `• ${p.name} x${item.qty} = ${fmt(p.price * item.qty)}`;
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
  currentQuizStep = 1;
  renderQuizStep();
  modal?.showModal();
}

function renderQuizStep() {
  const steps = document.querySelectorAll('.quiz-step');
  steps.forEach(s => s.classList.toggle('active', +s.dataset.step === currentQuizStep));
  const progress = $('quiz-progress');
  if (progress) progress.style.width = `${((currentQuizStep - 1) / TOTAL_QUIZ_STEPS) * 100}%`;
  const indicator = $('quiz-step-indicator');
  if (indicator) indicator.textContent = currentQuizStep <= TOTAL_QUIZ_STEPS ? `Step ${currentQuizStep} of ${TOTAL_QUIZ_STEPS}` : 'Your Matches!';
  const prevBtn = $('quiz-prev-btn');
  if (prevBtn) prevBtn.style.visibility = currentQuizStep > 1 && currentQuizStep <= TOTAL_QUIZ_STEPS ? 'visible' : 'hidden';
}

function showQuizResults() {
  const container = $('quiz-results-container');
  if (!container) return;
  const progress = $('quiz-progress');
  if (progress) progress.style.width = '100%';
  const indicator = $('quiz-step-indicator');
  if (indicator) indicator.textContent = 'Your Matches!';

  let results = PRODUCTS.filter(p => p.inStock);
  if (quizAnswers.gender && quizAnswers.gender !== 'all') {
    results = results.filter(p => p.gender === quizAnswers.gender || p.gender === 'Unisex');
  }
  if (quizAnswers.category) {
    results = results.filter(p => p.category === quizAnswers.category);
  }
  if (!results.length) results = PRODUCTS.filter(p => p.inStock).slice(0, 3);

  container.innerHTML = `
    <h3 style="font-size:1.2rem;font-weight:700;margin-bottom:1rem;color:var(--color-accent);">✨ Perfect picks for you:</h3>
    ${results.map(p => `
      <div style="display:flex;gap:1rem;padding:0.85rem;border:1px solid var(--color-border);border-radius:10px;margin-bottom:0.75rem;cursor:pointer;transition:border-color 0.2s;"
           onclick="$('quiz-modal').close();openDetailModal(${p.id});" onmouseenter="this.style.borderColor='var(--color-primary-glow)'" onmouseleave="this.style.borderColor='var(--color-border)'">
        <img src="${p.image}" alt="${p.name}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;">
        <div>
          <p style="font-weight:600;font-size:0.95rem;">${p.name}</p>
          <p style="color:var(--color-text-muted);font-size:0.82rem;">${p.category} · ${p.gender}</p>
          <p style="color:var(--color-accent);font-weight:700;margin-top:0.25rem;">${fmt(p.price)}</p>
        </div>
      </div>`).join('')}
    <button class="btn btn-ghost" style="width:100%;margin-top:0.5rem;" onclick="$('quiz-modal').close()">Browse Full Catalog</button>`;

  const steps = document.querySelectorAll('.quiz-step');
  steps.forEach(s => s.classList.remove('active'));
  container.classList.add('active');
  const prevBtn = $('quiz-prev-btn');
  if (prevBtn) prevBtn.style.visibility = 'hidden';
}

/* ================================================================
   TACEY AI — Knowledge Base & Engine
   ================================================================ */
const STACEY_WHATSAPP = 'https://wa.me/254702179011';

const AI_KB = {
  greet: [
    "Hi there! 👋 I'm Tacey AI, your personal stylist at Tacey Collections. What can I help you find today — shoes, bags, or an outfit? ✨",
    "Hey! Welcome to Tacey Collections 💅 I know every item in stock. Ask me anything — prices, availability, delivery, or style tips!",
    "Hello! Looking for something amazing? I'm Tacey AI and I'm here to style you up! What are you shopping for today?"
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

  hours: `⏰ Stacey is available **every day** from 8AM – 9PM EAT. Tacey AI is here around the clock 24/7 to answer your questions!`,

  payment: `💳 **Payment Methods**

We accept:
• **M-Pesa** (most popular!) — Stacey sends the till/number after you confirm your order via WhatsApp
• **Cash on Pickup** — for self-collection orders

Your order is confirmed via WhatsApp first, then payment is sorted with Stacey directly.`,

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
  if (gender)   list = list.filter(p => p.gender === gender || p.gender === 'Unisex');
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
    const gender = /men|male|guys|his/.test(q) ? 'Male' : /women|female|ladies|girls|her/.test(q) ? 'Female' : null;
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
   ADMIN PANEL — Password-protected via URL hash #admin-tacey
   ================================================================ */
function initAdminPanel() {
  if (window.location.hash !== '#admin-tacey') return;

  const adminHTML = `
  <div id="admin-panel" style="
    position:fixed;inset:0;z-index:99999;
    background:rgba(6,6,8,0.97);backdrop-filter:blur(20px);
    padding:2rem;overflow-y:auto;font-family:var(--font-body);">

    <div style="max-width:900px;margin:0 auto;">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2rem;">
        <div>
          <h1 style="font-family:var(--font-heading);font-size:1.8rem;margin-bottom:0.25rem;">
            🔑 Admin Panel
          </h1>
          <p style="color:var(--color-text-muted);font-size:0.9rem;">Manage products, prices & stock for Tacey Collections</p>
        </div>
        <button onclick="document.getElementById('admin-panel').remove();history.pushState('',document.title,window.location.pathname);"
          class="btn btn-ghost" style="flex-shrink:0;">✕ Close</button>
      </div>

      <div style="display:flex;gap:1rem;margin-bottom:1.5rem;flex-wrap:wrap;">
        <button onclick="adminAddProduct()" class="btn btn-primary">+ Add New Product</button>
        <button onclick="adminResetProducts()" class="btn btn-ghost" style="border-color:var(--color-error);color:var(--color-error);">↺ Reset to Defaults</button>
      </div>

      <div id="admin-product-list" style="display:flex;flex-direction:column;gap:1rem;"></div>
    </div>
  </div>`;

  document.body.insertAdjacentHTML('beforeend', adminHTML);
  renderAdminList();
}

function renderAdminList() {
  const list = document.getElementById('admin-product-list');
  if (!list) return;
  list.innerHTML = PRODUCTS.map((p, idx) => `
    <div style="background:var(--color-surface);border:1px solid var(--color-border);border-radius:12px;padding:1.25rem;display:flex;gap:1rem;align-items:center;flex-wrap:wrap;">
      <img src="${p.image}" alt="${p.name}" style="width:70px;height:70px;object-fit:cover;border-radius:8px;flex-shrink:0;">
      <div style="flex:1;min-width:200px;">
        <input value="${p.name}" id="admin-name-${p.id}"
          style="width:100%;background:var(--color-surface-elevated);border:1px solid var(--color-border);color:var(--color-text);padding:0.45rem 0.75rem;border-radius:6px;font-size:0.9rem;margin-bottom:0.5rem;">
        <div style="display:flex;gap:0.75rem;flex-wrap:wrap;align-items:center;">
          <label style="font-size:0.82rem;color:var(--color-text-muted);">Price KES:
            <input type="number" value="${p.price}" id="admin-price-${p.id}" min="0"
              style="width:110px;background:var(--color-surface-elevated);border:1px solid var(--color-border);color:var(--color-accent);padding:0.4rem 0.6rem;border-radius:6px;font-size:0.88rem;margin-left:0.4rem;">
          </label>
          <label style="font-size:0.82rem;color:var(--color-text-muted);display:flex;align-items:center;gap:0.4rem;">
            <input type="checkbox" ${p.inStock ? 'checked' : ''} id="admin-stock-${p.id}"> In Stock
          </label>
          <label style="font-size:0.82rem;color:var(--color-text-muted);display:flex;align-items:center;gap:0.4rem;">
            <input type="checkbox" ${p.featured ? 'checked' : ''} id="admin-feat-${p.id}"> Featured
          </label>
        </div>
        <input value="${p.image}" id="admin-img-${p.id}" placeholder="Image path..."
          style="width:100%;margin-top:0.5rem;background:var(--color-surface-elevated);border:1px solid var(--color-border);color:var(--color-text-muted);padding:0.4rem 0.75rem;border-radius:6px;font-size:0.8rem;">
      </div>
      <div style="display:flex;flex-direction:column;gap:0.5rem;">
        <button onclick="adminSaveProduct(${p.id})" class="btn btn-primary" style="padding:0.5rem 1rem;font-size:0.85rem;">💾 Save</button>
        <button onclick="adminDeleteProduct(${p.id})" class="btn btn-ghost" style="padding:0.5rem 1rem;font-size:0.85rem;color:var(--color-error);border-color:var(--color-error);">🗑 Delete</button>
      </div>
    </div>`).join('');
}

window.adminSaveProduct = function(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  p.name     = document.getElementById(`admin-name-${id}`)?.value  || p.name;
  p.price    = parseFloat(document.getElementById(`admin-price-${id}`)?.value) || p.price;
  p.inStock  = document.getElementById(`admin-stock-${id}`)?.checked ?? p.inStock;
  p.featured = document.getElementById(`admin-feat-${id}`)?.checked ?? p.featured;
  p.image    = document.getElementById(`admin-img-${id}`)?.value || p.image;
  saveProducts();
  renderProducts();
  alert(`✅ "${p.name}" saved successfully!`);
};

window.adminDeleteProduct = function(id) {
  const p = PRODUCTS.find(x => x.id === id);
  if (!p) return;
  if (!confirm(`Delete "${p.name}"?`)) return;
  PRODUCTS = PRODUCTS.filter(x => x.id !== id);
  saveProducts();
  renderProducts();
  renderAdminList();
};

window.adminAddProduct = function() {
  const newId = Math.max(...PRODUCTS.map(p => p.id), 0) + 1;
  PRODUCTS.push({
    id: newId,
    name: "New Product",
    category: "Footwear",
    gender: "Unisex",
    price: 2500,
    image: "assets/product_sneakers.png",
    description: "Add a description here.",
    tags: [],
    inStock: true,
    featured: false
  });
  saveProducts();
  renderProducts();
  renderAdminList();
  // Scroll to new product at bottom
  const list = document.getElementById('admin-product-list');
  list?.lastElementChild?.scrollIntoView({ behavior: 'smooth' });
};

window.adminResetProducts = function() {
  if (!confirm('Reset ALL products to defaults? This cannot be undone.')) return;
  localStorage.removeItem('tacey_products');
  location.reload();
};

/* ================================================================
   FILTER + SEARCH EVENT LISTENERS
   ================================================================ */
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
}

/* ================================================================
   MISC INIT
   ================================================================ */
function initNavbar() {
  const navbar = $('main-nav');
  if (!navbar) return;
  window.addEventListener('scroll', () => {
    navbar.style.background = window.scrollY > 60
      ? 'rgba(11,11,15,0.95)'
      : 'rgba(11,11,15,0.7)';
  }, { passive: true });
}

function initModals() {
  // Cart toggle
  $('cart-toggle-btn')?.addEventListener('click', openCart);
  $('close-cart-btn')?.addEventListener('click', closeCart);

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
document.addEventListener('DOMContentLoaded', () => {
  renderProducts();
  renderCart();
  initFilters();
  initQuiz();
  initNavbar();
  initModals();
  initAIChat();
  initAdminPanel();

  // CSS badge pop animation (inject once)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes badge-pop { 0%,100%{transform:scale(1)} 50%{transform:scale(1.4)} }
    .cart-badge-pop { animation: badge-pop 0.3s ease; }
  `;
  document.head.appendChild(style);
});
