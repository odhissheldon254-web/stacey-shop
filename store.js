/**
 * Tacey Collections — store.js
 *
 * The one place the site talks to Supabase. The shop reads the catalogue
 * here; Stacey's admin signs in, saves and uploads photos here.
 *
 * There is no server of our own. Supabase enforces who may do what:
 *   - anyone may READ the catalogue (it is a public shop)
 *   - only a signed-in account listed in shop_admins may CHANGE it
 * Those rules live in supabase/setup.sql as row-level security, so the
 * publishable key below is safe to ship in public code: on its own it can
 * only read.
 */
(function (root) {
  const SUPABASE_URL = 'https://hjivgncvlwtorzdbvbbm.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_GuFuadK4K8I_tMGzoCBL-w_HCSbSu0z';
  const IMAGE_BUCKET = 'product-images';
  const SESSION_KEY = 'tacey_admin_session';

  /* ── Validation (kept identical to the old server's rules) ── */
  function sanitizeProducts(input) {
    if (!Array.isArray(input)) throw new Error('Expected an array of products');
    if (input.length > 500) throw new Error('Too many products');
    return input.map((raw, i) => {
      if (!raw || typeof raw !== 'object') throw new Error(`Product ${i + 1} is not an object`);
      const name = String(raw.name || '').trim();
      if (!name) throw new Error(`Product ${i + 1} is missing a name`);
      const price = Number(raw.price);
      if (!Number.isFinite(price) || price < 0) throw new Error(`"${name}" has an invalid price`);
      const rawQty = Number(raw.qty);
      const qty = Number.isFinite(rawQty) ? Math.max(0, Math.floor(rawQty)) : (raw.inStock ? 1 : 0);
      // Several photos per piece: images[0] is the main one (the shop card).
      const images = (Array.isArray(raw.images) ? raw.images : [])
        .map(u => String(u || '').trim()).filter(Boolean).slice(0, 8);
      const main = String(raw.image || '').trim();
      if (!images.length && main) images.push(main);
      return {
        id: Number.isFinite(Number(raw.id)) ? Number(raw.id) : i + 1,
        name,
        category: String(raw.category || 'Clothes'),
        gender: String(raw.gender || 'Unisex'),
        price,
        qty,
        image: images[0] || '',
        images,
        sizes: Array.isArray(raw.sizes) ? raw.sizes.map(x => String(x).trim()).filter(Boolean).slice(0, 20) : [],
        description: String(raw.description || ''),
        tags: Array.isArray(raw.tags) ? raw.tags.map(t => String(t)).slice(0, 20) : [],
        inStock: qty > 0,
        featured: Boolean(raw.featured)
      };
    });
  }

  /* ── Session (admin only) ── */
  function readSession() {
    try { return JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null'); } catch { return null; }
  }
  function writeSession(s) {
    try {
      if (s) sessionStorage.setItem(SESSION_KEY, JSON.stringify(s));
      else sessionStorage.removeItem(SESSION_KEY);
    } catch { /* private mode: session lasts for this page only */ }
  }
  function toSession(data) {
    return {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: Date.now() + (Number(data.expires_in) || 3600) * 1000
    };
  }

  async function authRequest(path, body, token) {
    const headers = { apikey: SUPABASE_KEY, 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`${SUPABASE_URL}/auth/v1/${path}`, {
      method: 'POST', headers, body: body ? JSON.stringify(body) : undefined
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  // Phones love to capitalise the first letter of an email; Supabase does not.
  const cleanEmail = email => String(email || '').trim().toLowerCase();

  async function signIn(email, password) {
    const { res, data } = await authRequest('token?grant_type=password', { email: cleanEmail(email), password });
    if (res.status === 429) throw new Error('Too many attempts — wait a few minutes and try again');
    if (!res.ok) throw new Error('Wrong email or password');
    writeSession(toSession(data));
  }

  /* A valid access token, refreshing it if it is about to expire.
     Returns null when there is no usable session. */
  async function accessToken() {
    const s = readSession();
    if (!s) return null;
    if (Date.now() < s.expires_at - 60_000) return s.access_token;
    const { res, data } = await authRequest('token?grant_type=refresh_token', { refresh_token: s.refresh_token });
    if (!res.ok) { writeSession(null); return null; }
    writeSession(toSession(data));
    return data.access_token;
  }

  async function hasSession() {
    return Boolean(await accessToken());
  }

  async function signOut() {
    const s = readSession();
    writeSession(null);
    if (s) authRequest('logout', null, s.access_token).catch(() => {});
  }

  /* ── Forgotten password ──
     1. requestPasswordReset emails a link back to the admin page.
     2. On arrival, takeRecoveryFromUrl turns that link into a session.
     3. updatePassword sets the new password for that session. */
  const RESET_REDIRECT = 'https://taceycollections.odhis.co.ke/admin.html';

  async function requestPasswordReset(email) {
    const { res } = await authRequest(
      `recover?redirect_to=${encodeURIComponent(RESET_REDIRECT)}`, { email: cleanEmail(email) });
    if (res.status === 429) throw new Error('Too many reset emails — wait a few minutes and try again');
    if (res.status >= 500) throw new Error("The reset email couldn't be sent right now. Message the shop's website manager on WhatsApp.");
    // Any other answer is treated the same, so the page never reveals
    // whether an email belongs to an account.
  }

  /* Returns 'recovery' when the page was opened from a reset link (the
     session is now stored), 'expired' when the link was old or used, or
     null when there is nothing to do. Clears the link from the address bar. */
  function takeRecoveryFromUrl() {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    if (!params.has('access_token') && !params.has('error')) return null;
    history.replaceState(null, '', location.pathname);
    if (params.has('error')) return 'expired';
    writeSession(toSession({
      access_token: params.get('access_token'),
      refresh_token: params.get('refresh_token'),
      expires_in: params.get('expires_in')
    }));
    return params.get('type') === 'recovery' ? 'recovery' : null;
  }

  async function updatePassword(password) {
    if (String(password).length < 10) throw new Error('Use at least 10 characters');
    const token = await requireToken();
    const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      method: 'PUT',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password })
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 422 && /same/i.test(data.msg || data.error_description || '')) {
      throw new Error('That is the old password — choose a new one');
    }
    if (!res.ok) throw new Error(data.msg || 'Could not save the new password');
  }

  /* ── Catalogue ── */
  async function loadProducts() {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shop_data?key=eq.products&select=value`, {
      headers: { apikey: SUPABASE_KEY },
      cache: 'no-store'
    });
    if (!res.ok) throw new Error('Could not load products');
    const rows = await res.json();
    const list = rows[0]?.value;
    if (!Array.isArray(list)) throw new Error('Bad product data');
    return list;
  }

  async function requireToken() {
    const token = await accessToken();
    if (!token) {
      const err = new Error('Session expired — please log in again');
      err.code = 'AUTH';
      throw err;
    }
    return token;
  }

  async function saveProducts(list) {
    const clean = sanitizeProducts(list);
    const token = await requireToken();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/shop_data?key=eq.products`, {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation'
      },
      body: JSON.stringify({ value: clean })
    });
    if (res.status === 401) { writeSession(null); return requireToken(); }
    if (!res.ok) throw new Error('Save failed');
    // Row-level security does not error on a forbidden update: it simply
    // updates nothing. An empty result means this account is not an admin.
    const rows = await res.json().catch(() => []);
    if (!rows.length) throw new Error('This account is not allowed to edit the shop');
    return clean;
  }

  /* Uploads a product photo and returns its public URL. */
  async function uploadImage(blob) {
    const token = await requireToken();
    const ext = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${IMAGE_BUCKET}/${name}`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${token}`,
        'Content-Type': blob.type || 'image/jpeg',
        'Cache-Control': '31536000'
      },
      body: blob
    });
    if (!res.ok) throw new Error('Photo upload failed');
    return `${SUPABASE_URL}/storage/v1/object/public/${IMAGE_BUCKET}/${name}`;
  }

  const api = { sanitizeProducts, signIn, signOut, hasSession, loadProducts, saveProducts, uploadImage,
                requestPasswordReset, takeRecoveryFromUrl, updatePassword };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TaceyStore = api;
})(typeof window !== 'undefined' ? window : globalThis);
