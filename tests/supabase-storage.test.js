const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

// The whole reason Supabase exists in this project: Render/Railway free tiers
// wipe the local disk on every restart, so Stacey's stock edits must live
// somewhere durable. This test stands up a tiny stand-in for Supabase's REST
// API (the exact two calls server.js makes), points the real server at it, and
// proves an edit survives the local file being deleted — i.e. a redeploy.

const TEST_PASSWORD = 'test-secret-123';
const TEST_DATA_FILE = path.join(__dirname, '..', 'data', 'products.supatest.json');

// ── A minimal Supabase PostgREST stand-in ────────────────────────────────
// Implements just what loadProducts()/saveProducts() use:
//   GET  /rest/v1/shop_data?key=eq.products&select=value  -> [{ value }] | []
//   POST /rest/v1/shop_data  (Prefer: resolution=merge-duplicates)         -> upsert
// The store is an in-memory Map, so it deliberately OUTLIVES the app process —
// exactly like the real hosted database does across a redeploy.
function startMockSupabase() {
  const store = new Map();
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/rest/v1/shop_data') {
      const key = (url.searchParams.get('key') || '').replace(/^eq\./, '');
      const row = store.get(key);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(row ? [{ value: row }] : []));
      return;
    }
    if (req.method === 'POST' && url.pathname === '/rest/v1/shop_data') {
      let body = '';
      req.on('data', c => { body += c; });
      req.on('end', () => {
        try {
          for (const { key, value } of JSON.parse(body)) store.set(key, value);
          res.writeHead(201).end('[]');
        } catch (err) {
          res.writeHead(400).end(String(err));
        }
      });
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise(resolve => {
    server.listen(0, '127.0.0.1', () => resolve({ server, store, port: server.address().port }));
  });
}

function startServer(port, supabaseUrl) {
  return new Promise((resolve, reject) => {
    const server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(port),
        DATA_FILE: TEST_DATA_FILE,
        ADMIN_PASSWORD: TEST_PASSWORD,
        SUPABASE_URL: supabaseUrl,
        SUPABASE_SERVICE_KEY: 'test-service-key'
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let output = '';
    server.stdout.on('data', c => { output += c.toString(); });
    server.stderr.on('data', c => { output += c.toString(); });
    const timer = setTimeout(() => reject(new Error(`Server failed to start: ${output}`)), 4000);
    server.on('spawn', () => setTimeout(() => { clearTimeout(timer); resolve(server); }, 500));
    server.on('exit', code => { if (code !== 0 && code !== null) reject(new Error(`exited: ${code}`)); });
  });
}

test('product edits persist to Supabase and survive a disk wipe', async () => {
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  const mock = await startMockSupabase();
  const supabaseUrl = `http://127.0.0.1:${mock.port}`;
  const port = 3210;
  const baseUrl = `http://127.0.0.1:${port}`;

  let server = await startServer(port, supabaseUrl);
  try {
    // Health reports the durable backend is in use.
    const health = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(health.storage, 'supabase', 'server should report Supabase storage');

    // First read seeds the empty table from the local defaults.
    const seeded = await (await fetch(`${baseUrl}/api/products`)).json();
    assert.ok(Array.isArray(seeded) && seeded.length > 0);
    assert.ok(mock.store.has('products'), 'Supabase should have been seeded on first load');

    // Stacey logs in and renames the first product / sets a distinctive qty.
    const { token } = await (await fetch(`${baseUrl}/api/admin/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: TEST_PASSWORD })
    })).json();
    const edited = [{ id: 1, name: 'Persisted Piece', price: 1234, qty: 3, category: 'Bags',
      gender: 'Female', inStock: true, featured: false, tags: [], image: '', description: '' }];
    const put = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(edited)
    });
    assert.equal(put.status, 200);
    assert.equal(mock.store.get('products')[0].name, 'Persisted Piece', 'edit should reach Supabase');
  } finally {
    server.kill('SIGTERM');
  }

  // Simulate a free-tier redeploy: the local disk is wiped and the process
  // restarts fresh. The ONLY place the edit still lives is the (external) mock.
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  server = await startServer(port, supabaseUrl);
  try {
    const afterWipe = await (await fetch(`${baseUrl}/api/products`)).json();
    assert.equal(afterWipe[0].name, 'Persisted Piece', 'edit must survive the disk wipe via Supabase');
    assert.equal(afterWipe[0].qty, 3);
  } finally {
    server.kill('SIGTERM');
    mock.server.close();
    if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  }
});
