/*
 * Tacey Collections — storefront & stock-admin server.
 *
 * Zero npm dependencies. Storage backend:
 *   - Supabase (free tier) when SUPABASE_URL + SUPABASE_SERVICE_KEY are set
 *     (survives restarts/redeploys on free hosting), with the local JSON file
 *     kept as a write-through backup.
 *   - Local JSON file otherwise (fine for local development).
 *
 * Admin auth: password (ADMIN_PASSWORD env var) checked server-side via
 * POST /api/admin/login, which returns a session token required for writes.
 */

const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'products.json');
const dataDir = path.dirname(dataFile);

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const useSupabase = Boolean(SUPABASE_URL && SUPABASE_KEY);

const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_BODY_BYTES = 20 * 1024 * 1024; // product images may be inlined as data URLs
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 10;

const adminPassword = process.env.ADMIN_PASSWORD || '2265';
if (!process.env.ADMIN_PASSWORD) {
  console.warn('ADMIN_PASSWORD not set — using the default passcode. Set the env var in production.');
}

const sessions = new Map(); // token -> expiry timestamp
const loginAttempts = new Map(); // ip -> { count, resetAt }

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8'
};

const DEFAULT_PRODUCTS = [
  { id: 1, name: 'Neon Pulse Streetwear Sneakers', category: 'Footwear', gender: 'Unisex', price: 4500, qty: 8, image: 'assets/product_sneakers.png', description: 'Bold black streetwear sneakers with neon pink highlights.', tags: ['sneakers', 'shoes', 'streetwear'], inStock: true, featured: true },
  { id: 2, name: 'Luxe Quilted Leather Handbag', category: 'Bags', gender: 'Female', price: 6800, qty: 5, image: 'assets/product_handbag.png', description: 'Timeless black quilted leather bag with gold chain strap.', tags: ['bag', 'handbag', 'luxury'], inStock: true, featured: true },
  { id: 3, name: 'Velvet Drape Evening Gown', category: 'Clothes', gender: 'Female', price: 8200, qty: 2, image: 'assets/product_dress.png', description: 'Deep magenta velvet gown with elegant draping.', tags: ['dress', 'gown', 'formal'], inStock: true, featured: false },
  { id: 4, name: 'Neon Stiletto High Heels', category: 'Footwear', gender: 'Female', price: 5200, qty: 6, image: 'assets/product_heels.png', description: 'Hot pink glossy stiletto heels with a sleek metallic base.', tags: ['heels', 'shoes', 'pink'], inStock: true, featured: true },
  { id: 5, name: 'Little Steps Comfy Sneakers', category: 'Footwear', gender: 'Kids', price: 2400, qty: 10, image: 'assets/product_sneakers.png', description: 'Lightweight, easy-strap sneakers for little trendsetters — comfy for school runs and play dates.', tags: ['kids', 'sneakers', 'shoes'], inStock: true, featured: false },
  { id: 6, name: 'Classic Panama Fedora', category: 'Hats', gender: 'Male', price: 1800, qty: 4, image: 'assets/logo.jpeg', description: 'Timeless woven fedora to top off any sharp look.', tags: ['hat', 'fedora', 'men'], inStock: true, featured: false }
];

/* ── Storage ─────────────────────────────────────────────── */

function readFileProducts() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    fs.writeFileSync(dataFile, JSON.stringify(DEFAULT_PRODUCTS, null, 2));
  }
  return JSON.parse(fs.readFileSync(dataFile, 'utf8'));
}

function writeFileProducts(products) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(dataFile, JSON.stringify(products, null, 2));
}

async function supabaseRequest(pathname, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
    ...options,
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res;
}

// Older records may predate the qty field — derive it from inStock.
function normalizeProducts(list) {
  return list.map(p => {
    const qty = Number.isFinite(Number(p.qty)) ? Math.max(0, Math.floor(Number(p.qty))) : (p.inStock ? 1 : 0);
    return { ...p, qty, inStock: qty > 0 };
  });
}

async function loadProducts() {
  if (useSupabase) {
    try {
      const res = await supabaseRequest('shop_data?key=eq.products&select=value');
      const rows = await res.json();
      if (rows.length && Array.isArray(rows[0].value)) return normalizeProducts(rows[0].value);
      // First run against an empty table: seed it from the local file.
      const seed = readFileProducts();
      await saveProducts(seed);
      return normalizeProducts(seed);
    } catch (err) {
      console.error('Supabase read failed, falling back to local file:', err.message);
    }
  }
  return normalizeProducts(readFileProducts());
}

async function saveProducts(products) {
  writeFileProducts(products);
  if (useSupabase) {
    await supabaseRequest('shop_data', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([{ key: 'products', value: products }])
    });
  }
}

/* ── Auth ────────────────────────────────────────────────── */

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function isRateLimited(ip) {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) return false;
  return entry.count >= LOGIN_MAX_ATTEMPTS;
}

function recordLoginAttempt(ip, success) {
  const now = Date.now();
  if (success) { loginAttempts.delete(ip); return; }
  const entry = loginAttempts.get(ip);
  if (!entry || now > entry.resetAt) {
    loginAttempts.set(ip, { count: 1, resetAt: now + LOGIN_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

function createSession() {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, Date.now() + SESSION_TTL_MS);
  return token;
}

function sessionToken(req) {
  const header = req.headers['authorization'];
  if (typeof header !== 'string') return null;
  return header.replace(/^Bearer\s+/i, '').trim() || null;
}

function isAuthorized(req) {
  const token = sessionToken(req);
  if (!token) return false;
  const expiry = sessions.get(token);
  if (!expiry) return false;
  if (Date.now() > expiry) { sessions.delete(token); return false; }
  return true;
}

setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of sessions) if (now > expiry) sessions.delete(token);
  for (const [ip, entry] of loginAttempts) if (now > entry.resetAt) loginAttempts.delete(ip);
}, 10 * 60 * 1000).unref();

/* ── Validation ──────────────────────────────────────────── */

function sanitizeProducts(input) {
  if (!Array.isArray(input)) throw new Error('Expected an array of products');
  if (input.length > 500) throw new Error('Too many products');
  return input.map((raw, i) => {
    if (!raw || typeof raw !== 'object') throw new Error(`Product ${i + 1} is not an object`);
    const name = String(raw.name || '').trim();
    if (!name) throw new Error(`Product ${i + 1} is missing a name`);
    const price = Number(raw.price);
    if (!Number.isFinite(price) || price < 0) throw new Error(`"${name}" has an invalid price`);
    // Quantity is the source of truth for availability; legacy payloads with
    // only an inStock flag are mapped to a quantity of 1 or 0.
    const rawQty = Number(raw.qty);
    const qty = Number.isFinite(rawQty) ? Math.max(0, Math.floor(rawQty)) : (raw.inStock ? 1 : 0);
    return {
      id: Number.isFinite(Number(raw.id)) ? Number(raw.id) : i + 1,
      name,
      category: String(raw.category || 'Clothes'),
      gender: String(raw.gender || 'Unisex'),
      price,
      qty,
      image: String(raw.image || ''),
      description: String(raw.description || ''),
      tags: Array.isArray(raw.tags) ? raw.tags.map(t => String(t)).slice(0, 20) : [],
      inStock: qty > 0,
      featured: Boolean(raw.featured)
    };
  });
}

/* ── HTTP helpers ────────────────────────────────────────── */

function sendJson(res, status, payload, extraHeaders = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new Error('Request body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function serveStatic(res, requestPath) {
  const resolved = path.resolve(__dirname, requestPath);
  const rel = path.relative(__dirname, resolved);
  const blocked =
    rel.startsWith('..') ||
    path.isAbsolute(rel) ||
    rel.split(path.sep).some(part => part.startsWith('.')) ||
    ['data', 'node_modules', 'tests'].includes(rel.split(path.sep)[0]);
  if (blocked) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  fs.readFile(resolved, (err, content) => {
    if (err) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

/* ── Server ──────────────────────────────────────────────── */

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  try {
    if (req.method === 'GET' && url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true, service: 'stacey-shop', storage: useSupabase ? 'supabase' : 'file', timestamp: new Date().toISOString() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/products') {
      const products = await loadProducts();
      sendJson(res, 200, products, { 'Access-Control-Allow-Origin': '*' });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/login') {
      const ip = clientIp(req);
      if (isRateLimited(ip)) {
        sendJson(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' });
        return;
      }
      let payload = {};
      try { payload = JSON.parse((await readBody(req)) || '{}'); } catch { /* fall through to auth failure */ }
      const ok = typeof payload.password === 'string' && safeEqual(payload.password, adminPassword);
      recordLoginAttempt(ip, ok);
      if (!ok) {
        sendJson(res, 401, { error: 'Wrong password' });
        return;
      }
      sendJson(res, 200, { ok: true, token: createSession(), expiresInHours: SESSION_TTL_MS / 3600000 });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/admin/session') {
      sendJson(res, isAuthorized(req) ? 200 : 401, { ok: isAuthorized(req) });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/admin/logout') {
      const token = sessionToken(req);
      if (token) sessions.delete(token);
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/api/products') {
      if (!isAuthorized(req)) {
        sendJson(res, 401, { error: 'Unauthorized' });
        return;
      }
      let products;
      try {
        products = sanitizeProducts(JSON.parse(await readBody(req)));
      } catch (error) {
        sendJson(res, 400, { error: error.message });
        return;
      }
      await saveProducts(products);
      sendJson(res, 200, { ok: true, count: products.length });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/stock-admin.html') {
      res.writeHead(302, { Location: '/admin.html' });
      res.end();
      return;
    }

    // Department pages share one template; app.js reads the path.
    if (req.method === 'GET' && ['/women', '/men', '/kids', '/shop'].includes(url.pathname)) {
      serveStatic(res, 'shop.html');
      return;
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
      serveStatic(res, pathname.replace(/^\/+/, ''));
      return;
    }

    sendJson(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('Request failed:', error);
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(port, host, () => {
  console.log(`Tacey Collections running on http://${host}:${port}`);
  console.log(`Storage: ${useSupabase ? 'Supabase (persistent)' : `local file (${path.relative(__dirname, dataFile)})`}`);
});
