const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const TEST_PASSWORD = 'test-secret-123';
const TEST_DATA_FILE = path.join(__dirname, '..', 'data', 'products.test.json');

let server;
let serverPort = 3100;

function startServer() {
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  serverPort += 1;
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: {
        ...process.env,
        PORT: String(serverPort),
        DATA_FILE: TEST_DATA_FILE,
        ADMIN_PASSWORD: TEST_PASSWORD,
        SUPABASE_URL: '',
        SUPABASE_SERVICE_KEY: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    server.stdout.on('data', chunk => { output += chunk.toString(); });
    server.stderr.on('data', chunk => { output += chunk.toString(); });

    const timer = setTimeout(() => {
      reject(new Error(`Server failed to start: ${output}`));
    }, 4000);

    server.on('spawn', () => {
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 500);
    });
    server.on('exit', code => {
      if (code !== 0 && code !== null) reject(new Error(`Server exited early: ${code}`));
    });
  });
}

function stopServer() {
  server.kill('SIGTERM');
}

async function login(baseUrl, password = TEST_PASSWORD) {
  return fetch(`${baseUrl}/api/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password })
  });
}

test('stock admin endpoint redirects to the single admin page', async () => {
  await startServer();
  try {
    const response = await fetch(`http://127.0.0.1:${serverPort}/stock-admin.html`, { redirect: 'manual' });
    assert.equal(response.status, 302);
    assert.equal(response.headers.get('location'), '/admin.html');
  } finally {
    stopServer();
  }
});

test('product writes require a valid session token', async () => {
  await startServer();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  try {
    // Public read works.
    let response = await fetch(`${baseUrl}/api/products`);
    assert.equal(response.status, 200);
    const initial = await response.json();
    assert.ok(Array.isArray(initial));
    assert.ok(initial.length > 0);

    const newCatalog = [{ id: 1, name: 'Test Product', price: 999, qty: 7, category: 'Bags', gender: 'Female', inStock: true, featured: false, tags: [], image: '', description: '' }];

    // Write without a token is rejected.
    response = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newCatalog)
    });
    assert.equal(response.status, 401);

    // The old hardcoded key no longer works either.
    response = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'X-Admin-Key': 'tacey-collections-admin' },
      body: JSON.stringify(newCatalog)
    });
    assert.equal(response.status, 401);

    // Wrong password is rejected.
    response = await login(baseUrl, 'wrong-password');
    assert.equal(response.status, 401);

    // Correct password returns a token.
    response = await login(baseUrl);
    assert.equal(response.status, 200);
    const { token } = await response.json();
    assert.ok(token && token.length >= 32);

    // Write with the token succeeds.
    response = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(newCatalog)
    });
    assert.equal(response.status, 200);

    // The change is visible to shoppers, with quantity driving availability.
    response = await fetch(`${baseUrl}/api/products`);
    const updated = await response.json();
    assert.equal(updated[0].name, 'Test Product');
    assert.equal(updated[0].price, 999);
    assert.equal(updated[0].qty, 7);
    assert.equal(updated[0].inStock, true);

    // Setting quantity to zero marks the item out of stock automatically.
    response = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify([{ ...newCatalog[0], qty: 0, inStock: true }])
    });
    assert.equal(response.status, 200);
    response = await fetch(`${baseUrl}/api/products`);
    const soldOut = await response.json();
    assert.equal(soldOut[0].qty, 0);
    assert.equal(soldOut[0].inStock, false);

    // Invalid payloads are rejected with 400.
    response = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify([{ price: 100 }])
    });
    assert.equal(response.status, 400);

    // Logout invalidates the token.
    await fetch(`${baseUrl}/api/admin/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${token}` } });
    response = await fetch(`${baseUrl}/api/products`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify(newCatalog)
    });
    assert.equal(response.status, 401);
  } finally {
    stopServer();
  }
});

test('department routes serve the shop template', async () => {
  await startServer();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  try {
    for (const dept of ['/women', '/men', '/kids']) {
      const response = await fetch(`${baseUrl}${dept}`);
      assert.equal(response.status, 200, `${dept} should serve`);
      const html = await response.text();
      assert.ok(html.includes('dept-hero'), `${dept} should contain the department hero`);
    }
  } finally {
    stopServer();
  }
});

test('data files are not served to the public', async () => {
  await startServer();
  const baseUrl = `http://127.0.0.1:${serverPort}`;
  try {
    for (const blockedPath of ['/data/products.json', '/data/products.test.json', '/.gitignore']) {
      const response = await fetch(`${baseUrl}${blockedPath}`);
      assert.equal(response.status, 404, `${blockedPath} should be blocked`);
    }
  } finally {
    stopServer();
  }
});
