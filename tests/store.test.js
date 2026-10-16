/**
 * Covers store.js, the only code that talks to Supabase.
 * Supabase itself is faked with a stub fetch, so these run offline.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const STORE_FILE = path.join(__dirname, '..', 'store.js');

function freshStore(fetchImpl) {
  const memory = new Map();
  global.sessionStorage = {
    getItem: k => (memory.has(k) ? memory.get(k) : null),
    setItem: (k, v) => memory.set(k, String(v)),
    removeItem: k => memory.delete(k)
  };
  global.fetch = fetchImpl;
  delete require.cache[require.resolve(STORE_FILE)];
  return require(STORE_FILE);
}

const json = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body
});

test('the public site never ships a secret Supabase key', () => {
  const src = fs.readFileSync(STORE_FILE, 'utf8');
  assert.doesNotMatch(src, /sb_secret_/, 'a secret key bypasses every security rule');
  const jwts = src.match(/eyJ[\w-]+\.eyJ[\w-]+\.[\w-]+/g) || [];
  for (const jwt of jwts) {
    const payload = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
    assert.notEqual(payload.role, 'service_role', 'the service_role key must never be in the website');
  }
});

test('sanitizeProducts keeps the old server rules', () => {
  const { sanitizeProducts } = freshStore(async () => json(200, []));
  const [p] = sanitizeProducts([{ name: '  Heels ', price: '5200', qty: 2.7, tags: [1, 'pink'] }]);
  assert.equal(p.name, 'Heels');
  assert.equal(p.price, 5200);
  assert.equal(p.qty, 2);
  assert.equal(p.inStock, true);
  assert.deepEqual(p.tags, ['1', 'pink']);

  // Out of stock follows the quantity, not a stale flag.
  assert.equal(sanitizeProducts([{ name: 'x', price: 1, qty: 0, inStock: true }])[0].inStock, false);

  assert.throws(() => sanitizeProducts({}), /array/);
  assert.throws(() => sanitizeProducts([{ price: 1 }]), /missing a name/);
  assert.throws(() => sanitizeProducts([{ name: 'x', price: -1 }]), /invalid price/);
  assert.throws(() => sanitizeProducts(new Array(501).fill({ name: 'x', price: 1 })), /Too many/);
});

test('saving without signing in is refused before anything is sent', async () => {
  let calls = 0;
  const store = freshStore(async () => { calls++; return json(200, []); });
  await assert.rejects(store.saveProducts([{ name: 'x', price: 1 }]), err => err.code === 'AUTH');
  assert.equal(calls, 0);
});

test('a signed-in account that is not an admin cannot save', async () => {
  // Row-level security answers a forbidden update with "200, zero rows".
  // Treating that as success would tell Stacey her change was saved.
  const store = freshStore(async url => {
    if (url.includes('/auth/v1/token')) return json(200, { access_token: 't', refresh_token: 'r', expires_in: 3600 });
    return json(200, []);
  });
  await store.signIn('someone@example.com', 'pw');
  await assert.rejects(store.saveProducts([{ name: 'x', price: 1 }]), /not allowed/);
});

test('an admin save sends the cleaned list with her token', async () => {
  let sent;
  const store = freshStore(async (url, opts = {}) => {
    if (url.includes('/auth/v1/token')) return json(200, { access_token: 'stacey', refresh_token: 'r', expires_in: 3600 });
    sent = { url, opts };
    return json(200, [{ key: 'products' }]);
  });
  await store.signIn('stacey@example.com', 'pw');
  await store.saveProducts([{ name: ' Bag ', price: 6800, qty: 3 }]);
  assert.equal(sent.opts.method, 'PATCH');
  assert.match(sent.url, /shop_data\?key=eq\.products/);
  assert.equal(sent.opts.headers.Authorization, 'Bearer stacey');
  assert.equal(JSON.parse(sent.opts.body).value[0].name, 'Bag');
});

test('a wrong password gives a clear message', async () => {
  const store = freshStore(async () => json(400, { error: 'invalid_grant' }));
  await assert.rejects(store.signIn('a@b.c', 'nope'), /Wrong email or password/);
  assert.equal(await store.hasSession(), false);
});

test('an expiring session is refreshed instead of logging her out', async () => {
  let refreshed = false;
  const store = freshStore(async url => {
    if (url.includes('grant_type=password')) return json(200, { access_token: 'old', refresh_token: 'r', expires_in: 1 });
    if (url.includes('grant_type=refresh_token')) { refreshed = true; return json(200, { access_token: 'new', refresh_token: 'r2', expires_in: 3600 }); }
    return json(200, []);
  });
  await store.signIn('stacey@example.com', 'pw');
  assert.equal(await store.hasSession(), true);
  assert.ok(refreshed);
});

test('emails are tidied before sign-in and reset (phones capitalise them)', async () => {
  const sent = [];
  const store = freshStore(async (url, opts = {}) => {
    sent.push({ url, body: JSON.parse(opts.body || '{}') });
    return json(200, { access_token: 't', refresh_token: 'r', expires_in: 3600 });
  });
  await store.signIn('  Taceycollections@Gmail.com ', 'pw');
  await store.requestPasswordReset('Taceycollections@gmail.com');
  assert.equal(sent[0].body.email, 'taceycollections@gmail.com');
  assert.equal(sent[1].body.email, 'taceycollections@gmail.com');
  assert.match(sent[1].url, /\/auth\/v1\/recover\?redirect_to=https%3A%2F%2Ftaceycollections\.odhis\.co\.ke%2Fadmin\.html$/);
});

test('a reset request never reveals whether the email has an account', async () => {
  const store = freshStore(async () => json(400, { msg: 'User not found' }));
  await store.requestPasswordReset('stranger@example.com'); // resolves, no error
});

function withLocation(hash, fn) {
  let replaced = null;
  global.location = { hash, pathname: '/admin.html' };
  global.history = { replaceState: (_s, _t, url) => { replaced = url; } };
  try { return fn(() => replaced); } finally { delete global.location; delete global.history; }
}

test('opening the reset link signs her in for the password change and clears the link', async () => {
  const store = freshStore(async () => json(200, {}));
  withLocation('#access_token=abc&refresh_token=def&expires_in=3600&type=recovery', replaced => {
    assert.equal(store.takeRecoveryFromUrl(), 'recovery');
    assert.equal(replaced(), '/admin.html', 'the token must not stay in the address bar');
  });
  assert.equal(await store.hasSession(), true);
});

test('an expired or reused reset link is reported, not silently ignored', () => {
  const store = freshStore(async () => json(200, {}));
  withLocation('#error=access_denied&error_code=otp_expired', () => {
    assert.equal(store.takeRecoveryFromUrl(), 'expired');
  });
  withLocation('', () => assert.equal(store.takeRecoveryFromUrl(), null));
});

test('a new password must be at least 10 characters', async () => {
  let calls = 0;
  const store = freshStore(async () => { calls++; return json(200, {}); });
  await assert.rejects(store.updatePassword('short'), /10 characters/);
  assert.equal(calls, 0);
});

test('a failed reset email is reported instead of promising it is on its way', async () => {
  const store = freshStore(async () => json(500, { msg: 'Error sending recovery email' }));
  await assert.rejects(store.requestPasswordReset('taceycollections@gmail.com'), /couldn't be sent/);
});
