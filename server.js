const http = require('http');
const fs = require('fs');
const path = require('path');

const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || '0.0.0.0';
const dataFile = process.env.DATA_FILE || path.join(__dirname, 'data', 'products.json');
const adminFile = process.env.ADMIN_FILE || path.join(__dirname, 'data', 'admin.json');
const dataDir = path.dirname(dataFile);
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'tacey-collections-admin';

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
  '.ico': 'image/x-icon'
};

function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) {
    const defaultProducts = [
      { id: 1, name: 'Neon Pulse Streetwear Sneakers', category: 'Footwear', gender: 'Unisex', price: 4500, image: 'assets/product_sneakers.png', description: 'Bold black streetwear sneakers with neon pink highlights.', tags: ['sneakers', 'shoes', 'streetwear'], inStock: true, featured: true },
      { id: 2, name: 'Luxe Quilted Leather Handbag', category: 'Bags', gender: 'Female', price: 6800, image: 'assets/product_handbag.png', description: 'Timeless black quilted leather bag with gold chain strap.', tags: ['bag', 'handbag', 'luxury'], inStock: true, featured: true },
      { id: 3, name: 'Velvet Drape Evening Gown', category: 'Clothes', gender: 'Female', price: 8200, image: 'assets/product_dress.png', description: 'Deep magenta velvet gown with elegant draping.', tags: ['dress', 'gown', 'formal'], inStock: true, featured: false },
      { id: 4, name: 'Neon Stiletto High Heels', category: 'Footwear', gender: 'Female', price: 5200, image: 'assets/product_heels.png', description: 'Hot pink glossy stiletto heels with a sleek metallic base.', tags: ['heels', 'shoes', 'pink'], inStock: true, featured: true }
    ];
    fs.writeFileSync(dataFile, JSON.stringify(defaultProducts, null, 2));
  }
}

function ensureAdminFile() {
  const dir = path.dirname(adminFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(adminFile)) {
    const admin = { pinHash: null, reset: null, email: process.env.ADMIN_EMAIL || null };
    fs.writeFileSync(adminFile, JSON.stringify(admin, null, 2));
  }
}

function readProducts() { ensureDataFile(); return JSON.parse(fs.readFileSync(dataFile, 'utf8')); }
function writeProducts(products) { ensureDataFile(); fs.writeFileSync(dataFile, JSON.stringify(products, null, 2)); }
function readAdmin() { ensureAdminFile(); return JSON.parse(fs.readFileSync(adminFile, 'utf8')); }
function writeAdmin(admin) { ensureAdminFile(); fs.writeFileSync(adminFile, JSON.stringify(admin, null, 2)); }

function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
}

function isAdminAuthorized(req) {
  const headerKey = req.headers['x-admin-key'] || req.headers['authorization'];
  const normalized = typeof headerKey === 'string' ? headerKey.replace(/^Bearer\s+/i, '').trim() : '';
  return normalized === ADMIN_KEY;
}

function serveStatic(req, res, filePath) {
  const safePath = path.normalize(filePath).replace(/^\\u0000/, '');
  const fullPath = path.join(__dirname, safePath);
  if (!fullPath.startsWith(__dirname)) {
    res.writeHead(403, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Forbidden' }));
    return;
  }

  fs.readFile(fullPath, (err, content) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Not found' }));
      return;
    }
    const ext = path.extname(fullPath).toLowerCase();
    const type = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': type });
    res.end(content);
  });
}

function simpleHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = (h * 0x01000193) >>> 0;
  }
  return h.toString(16);
}

async function sendResetEmail(to, code) {
  try {
    const nodemailer = require('nodemailer');
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
    });
    const from = process.env.FROM_EMAIL || process.env.SMTP_USER || 'no-reply@example.com';
    const info = await transporter.sendMail({
      from,
      to,
      subject: 'Tacey Collections — Reset Code',
      text: `Your reset code is: ${code} (expires in 15 minutes)`
    });
    console.log('Email sent', info && info.messageId);
    return true;
  } catch (err) {
    console.warn('nodemailer not configured or failed:', err && err.message);
    return false;
  }
}

const server = http.createServer((req, res) => {
  setCorsHeaders(res);
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: 'stacey-shop', timestamp: new Date().toISOString() }));
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/products') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(readProducts()));
    return;
  }

  if (req.method === 'PUT' && url.pathname === '/api/products') {
    if (!isAdminAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const products = JSON.parse(body);
        if (!Array.isArray(products)) throw new Error('Expected array');
        writeProducts(products);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, products }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/request-reset') {
    if (!isAdminAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const email = (payload.email || '').trim();
        const admin = readAdmin();
        const configured = process.env.ADMIN_EMAIL || admin.email;
        if (!configured || configured !== email) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown admin email' })); return; }
        const code = String(Math.floor(100000 + Math.random() * 900000));
        const expires = Date.now() + (15 * 60 * 1000);
        admin.reset = { code, expires };
        admin.email = configured;
        writeAdmin(admin);
        const sent = await sendResetEmail(configured, code).catch(e => { console.error(e); return false; });
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, emailed: !!sent }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/confirm-reset') {
    if (!isAdminAuthorized(req)) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized' }));
      return;
    }

    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        const payload = JSON.parse(body || '{}');
        const { email, code, newPin } = payload;
        const admin = readAdmin();
        const configured = process.env.ADMIN_EMAIL || admin.email;
        if (!configured || configured !== (email || '').trim()) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Unknown admin email' })); return; }
        const reset = admin.reset || {};
        if (!reset.code || reset.code !== String(code) || Date.now() > (reset.expires || 0)) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'Invalid or expired code' })); return; }
        if (!newPin || String(newPin).length < 4) { res.writeHead(400, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'New PIN too short' })); return; }
        const pinHash = simpleHash(String(newPin));
        admin.pinHash = pinHash;
        admin.reset = null;
        writeAdmin(admin);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true }));
      } catch (error) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
    return;
  }

  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const filePath = pathname.replace(/^\//, '');
  if (filePath) {
    serveStatic(req, res, filePath);
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(port, host, () => {
  console.log(`Products API & site server running on http://${host}:${port}`);
});
