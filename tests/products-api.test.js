const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');

let server;
let serverPort = 3100;

function startServer() {
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
      env: { ...process.env, PORT: String(serverPort), DATA_FILE: path.join(__dirname, '..', 'data', 'products.test.json') },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    server.stdout.on('data', (chunk) => {
      output += chunk.toString();
    });
    server.stderr.on('data', (chunk) => {
      output += chunk.toString();
    });

    const timer = setTimeout(() => {
      reject(new Error(`Server failed to start: ${output}`));
    }, 4000);

    server.on('spawn', () => {
      setTimeout(() => {
        clearTimeout(timer);
        resolve();
      }, 500);
    });
    server.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Server exited early: ${code}`));
    });
  });
}

test('products API serves and updates product data', async () => {
  await startServer();

  const baseUrl = `http://127.0.0.1:${serverPort}`;

  let response = await fetch(`${baseUrl}/api/products`);
  assert.equal(response.status, 200);
  const initial = await response.json();
  assert.ok(Array.isArray(initial));
  assert.ok(initial.length > 0);

  response = await fetch(`${baseUrl}/api/products`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': 'tacey-collections-admin'
    },
    body: JSON.stringify([{ id: 1, name: 'Test Product', price: 999, inStock: true }])
  });
  assert.equal(response.status, 200);

  response = await fetch(`${baseUrl}/api/products`);
  const updated = await response.json();
  assert.equal(updated[0].name, 'Test Product');
  assert.equal(updated[0].price, 999);

  server.kill('SIGTERM');
});
