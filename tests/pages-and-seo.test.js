/**
 * Covers the public page routing, the SEO files, and the internal-link
 * structure that ties the site together.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TEST_DATA_FILE = path.join(ROOT, 'data', 'products.pages-test.json');
const SITE = 'https://taceycollections.co.ke';

let server;
let port = 3200;

function startServer() {
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
  port += 1;
  return new Promise((resolve, reject) => {
    server = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
      env: {
        ...process.env,
        PORT: String(port),
        DATA_FILE: TEST_DATA_FILE,
        ADMIN_PASSWORD: 'pages-test-secret',
        SUPABASE_URL: '',
        SUPABASE_SERVICE_KEY: ''
      },
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let output = '';
    server.stdout.on('data', c => { output += c.toString(); });
    server.stderr.on('data', c => { output += c.toString(); });

    const timer = setTimeout(() => reject(new Error(`Server failed to start: ${output}`)), 4000);
    server.on('spawn', () => setTimeout(() => { clearTimeout(timer); resolve(); }, 500));
    server.on('exit', code => {
      if (code !== 0 && code !== null) reject(new Error(`Server exited early: ${code}`));
    });
  });
}

function stopServer() {
  server.kill('SIGTERM');
  if (fs.existsSync(TEST_DATA_FILE)) fs.unlinkSync(TEST_DATA_FILE);
}

const base = () => `http://127.0.0.1:${port}`;

test('every public page and SEO file is reachable', async () => {
  await startServer();
  try {
    const routes = [
      '/', '/women', '/men', '/kids', '/shop',
      '/about', '/contact', '/delivery', '/faq', '/size-guide',
      '/robots.txt', '/sitemap.xml', '/site.webmanifest', '/assets/favicon.svg', '/page.js'
    ];
    for (const route of routes) {
      const res = await fetch(base() + route);
      assert.equal(res.status, 200, `${route} should return 200`);
    }
  } finally {
    stopServer();
  }
});

test('unknown URLs return the branded 404 page, not a JSON blob', async () => {
  await startServer();
  try {
    const res = await fetch(`${base()}/this-page-does-not-exist`);
    assert.equal(res.status, 404);
    assert.match(res.headers.get('content-type'), /text\/html/);

    const html = await res.text();
    assert.match(html, /This shelf is empty/);
    // A dead end is the whole problem — the 404 must offer a way back.
    assert.match(html, /href="\/women"/);
    assert.match(html, /href="\/"/);
  } finally {
    stopServer();
  }
});

test('.html URLs redirect to their canonical clean path', async () => {
  await startServer();
  try {
    for (const [ugly, clean] of [
      ['/about.html', '/about'],
      ['/faq.html', '/faq'],
      ['/size-guide.html', '/size-guide']
    ]) {
      const res = await fetch(base() + ugly, { redirect: 'manual' });
      assert.equal(res.status, 301, `${ugly} should redirect permanently`);
      assert.equal(res.headers.get('location'), clean);
    }
  } finally {
    stopServer();
  }
});

test('source directories are not served to the public', async () => {
  await startServer();
  try {
    for (const secret of ['/partials/footer.html', '/data/products.json', '/tests/pages-and-seo.test.js']) {
      const res = await fetch(base() + secret);
      assert.equal(res.status, 404, `${secret} must not be readable`);
    }
  } finally {
    stopServer();
  }
});

test('responses carry security headers and sensible caching', async () => {
  await startServer();
  try {
    const page = await fetch(`${base()}/about`);
    assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(page.headers.get('x-frame-options'), 'SAMEORIGIN');
    assert.match(page.headers.get('cache-control'), /must-revalidate/);

    // Images are stable, so they may be cached hard.
    const asset = await fetch(`${base()}/assets/logo.jpeg`);
    assert.match(asset.headers.get('cache-control'), /max-age=604800/);
  } finally {
    stopServer();
  }
});

test('every page links back into the rest of the site', async () => {
  await startServer();
  try {
    const pages = ['/', '/shop', '/about', '/contact', '/delivery', '/faq', '/size-guide'];
    for (const page of pages) {
      const html = await (await fetch(base() + page)).text();
      // The shared footer puts the whole site one click away from anywhere.
      for (const link of ['/women', '/men', '/kids', '/delivery', '/faq', '/contact', '/about']) {
        assert.match(html, new RegExp(`href="${link}"`), `${page} should link to ${link}`);
      }
    }
  } finally {
    stopServer();
  }
});

test('pages declare a canonical URL on the live domain', async () => {
  await startServer();
  try {
    for (const [route, expected] of [
      ['/', `${SITE}/`],
      ['/about', `${SITE}/about`],
      ['/contact', `${SITE}/contact`],
      ['/delivery', `${SITE}/delivery`],
      ['/faq', `${SITE}/faq`],
      ['/size-guide', `${SITE}/size-guide`]
    ]) {
      const html = await (await fetch(base() + route)).text();
      assert.match(html, new RegExp(`<link rel="canonical" href="${expected}">`), `${route} canonical`);
    }
  } finally {
    stopServer();
  }
});

test('robots.txt hides the admin panel and points at the sitemap', async () => {
  await startServer();
  try {
    const robots = await (await fetch(`${base()}/robots.txt`)).text();
    assert.match(robots, /Disallow: \/admin\.html/);
    assert.match(robots, /Disallow: \/api\//);
    assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap\\.xml`));
  } finally {
    stopServer();
  }
});

test('sitemap lists every indexable page and nothing private', async () => {
  await startServer();
  try {
    const xml = await (await fetch(`${base()}/sitemap.xml`)).text();
    for (const route of ['/', '/women', '/men', '/kids', '/shop', '/about', '/delivery', '/faq', '/size-guide', '/contact']) {
      assert.ok(xml.includes(`<loc>${SITE}${route}</loc>`), `sitemap should list ${route}`);
    }
    assert.ok(!xml.includes('admin'), 'sitemap must not expose the admin page');
  } finally {
    stopServer();
  }
});

test('structured data on every page is valid JSON', async () => {
  await startServer();
  try {
    for (const route of ['/', '/about', '/contact', '/delivery', '/faq', '/size-guide']) {
      const html = await (await fetch(base() + route)).text();
      const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
      assert.ok(blocks.length > 0, `${route} should carry structured data`);
      for (const [, json] of blocks) {
        assert.doesNotThrow(() => JSON.parse(json), `${route} has invalid JSON-LD`);
      }
    }
  } finally {
    stopServer();
  }
});

test('the shared partials are in sync across all pages', async () => {
  // Guards against someone editing one page's footer by hand and letting the
  // others drift. Re-running the build must be a no-op.
  const before = fs.readdirSync(ROOT)
    .filter(f => f.endsWith('.html'))
    .map(f => [f, fs.readFileSync(path.join(ROOT, f), 'utf8')]);

  const { execFileSync } = require('node:child_process');
  execFileSync(process.execPath, [path.join(ROOT, 'build-partials.js')], { cwd: ROOT });

  for (const [file, content] of before) {
    assert.equal(
      fs.readFileSync(path.join(ROOT, file), 'utf8'),
      content,
      `${file} is out of sync — run "npm run build" and commit the result`
    );
  }
});

test('scroll-reveal can never leave a section permanently invisible', async () => {
  // A whole section of the homepage once rendered as a blank gap: the markup
  // carried class="reveal" (opacity:0 until observed), but the observer both
  // skipped anything already marked and never matched the section's own
  // selector, so it was never revealed. These three assertions cover each
  // link in that chain.
  const css = fs.readFileSync(path.join(ROOT, 'index.css'), 'utf8');
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  const head = fs.readFileSync(path.join(ROOT, 'partials', 'head-common.html'), 'utf8');

  // 1. Hiding is opt-in, so a browser that cannot animate still shows content.
  assert.match(css, /\.reveal-enabled \.reveal\s*\{/, 'reveal styles must be gated on .reveal-enabled');
  assert.ok(!/^\.reveal\s*\{/m.test(css), 'an ungated ".reveal { opacity: 0 }" would hide content for good');

  // 2. The gate is withdrawn if the script that reveals never reports in.
  assert.match(head, /reveal-enabled/, 'the head partial must set the opt-in class');
  assert.match(head, /revealReady/, 'the head partial needs the failsafe that un-hides on script failure');
  assert.match(app, /dataset\.revealReady/, 'app.js must report that reveals are running');

  // 3. Sections marked in the markup are observed rather than skipped.
  const observed = app.match(/root\.querySelectorAll\('([^']*reveal[^']*)'\)/);
  assert.ok(observed, 'observeReveals should query for .reveal');
  assert.match(observed[1], /(^|,\s*)\.reveal(,|$)/, '.reveal itself must be in the observed selector list');

  // 4. Nothing in the shipped markup is hidden by a class the observer ignores.
  for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
    const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
    if (/class="[^"]*\breveal\b/.test(html)) {
      assert.match(html, /reveal-enabled/,
        `${file} hides content with .reveal but never ships the opt-in gate`);
    }
  }
});

test('module scripts never emit inline event handlers', async () => {
  // app.js ships as <script type="module">, so its top-level functions are
  // scoped to the module and never reach `window`. Any onclick="foo(...)"
  // it writes into generated markup therefore throws ReferenceError the
  // moment a shopper clicks it — this is exactly how the cart's +, - and
  // Remove buttons, the wishlist buttons and the Style Matcher results all
  // ended up doing nothing at all. Delegated listeners are the fix.
  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');

  for (const page of ['index.html', 'shop.html']) {
    const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
    assert.match(html, /<script src="app\.js" type="module">/,
      `${page} is expected to load app.js as a module`);
  }

  // `this.style...` is safe (no scope lookup). A bare identifier call is not.
  const handlers = [...app.matchAll(/\son([a-z]+)="([^"]*)"/g)]
    .filter(([, , body]) => /(^|[;\s])[A-Za-z_$][\w$]*\s*\(/.test(body.replace(/this\.[\w.]+/g, '')));

  assert.deepEqual(
    handlers.map(([, evt, body]) => `on${evt}="${body.slice(0, 60)}"`),
    [],
    'these inline handlers cannot resolve from module scope — use a delegated listener'
  );
});

test('the shopping bag follows the shopper onto the content pages', async () => {
  await startServer();
  try {
    // Content pages skip app.js, so the bag has to be reachable from their
    // own header — otherwise clicking "Delivery" mid-shop looks like the
    // order was lost.
    for (const route of ['/about', '/delivery', '/faq', '/size-guide', '/contact']) {
      const html = await (await fetch(base() + route)).text();
      assert.match(html, /id="cart-toggle-link"/, `${route} should show the bag`);
      assert.match(html, /href="\/#cart"/, `${route}'s bag should link to the drawer`);
      assert.match(html, /id="cart-count"/, `${route} should show the item count`);
    }

    // page.js fills that badge from storage, and the storefront opens the
    // drawer when it is handed the #cart hash.
    const pageJs = fs.readFileSync(path.join(ROOT, 'page.js'), 'utf8');
    assert.match(pageJs, /tacey_cart/, 'page.js must read the saved bag');
    assert.match(pageJs, /cart-count/, 'page.js must fill the badge');

    const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
    assert.match(app, /location\.hash === '#cart'/, 'the storefront must honour the #cart handoff');
  } finally {
    stopServer();
  }
});

test('the site does not depend on third-party asset hosts', async () => {
  // A texture in body's background pointed at a stranger's Vercel demo. It
  // 404'd, so the grain never rendered — and every visitor's browser hit
  // that third party on every page load to find out. Fonts are the one
  // deliberate exception.
  const ALLOWED = ['fonts.googleapis.com', 'fonts.gstatic.com'];
  const files = ['index.css', 'app.js', 'page.js',
    ...fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))];

  for (const file of files) {
    const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
    // url(...) references in CSS, and src/href attributes in markup.
    const linkTags = [...src.matchAll(/<link\b[^>]*>/g)].map(m => m[0])
      // canonical/alternate/manifest carry URLs but fetch no third-party asset
      .filter(tag => /rel="(?:stylesheet|preload|icon|apple-touch-icon)"/.test(tag))
      .map(tag => tag.match(/href="(https?:\/\/[^"]+)"/)?.[1])
      .filter(Boolean);
    const refs = [
      ...[...src.matchAll(/url\(\s*['"]?(https?:\/\/[^)'"]+)/g)].map(m => m[1]),
      ...[...src.matchAll(/<(?:img|script)\b[^>]+src="(https?:\/\/[^"]+)"/g)].map(m => m[1]),
      ...linkTags
    ];
    for (const ref of refs) {
      const host = new URL(ref).hostname;
      assert.ok(ALLOWED.includes(host),
        `${file} loads an asset from ${host} — self-host it instead (${ref.slice(0, 70)})`);
    }
  }
});

test('the M-Pesa paybill is published, consistent, and single-sourced', async () => {
  // Money moves on these two numbers. If one page drifts out of sync with
  // another — a typo, a half-finished edit — a customer pays a stranger and
  // it is not recoverable. So: one source (partials/paybill.html), and every
  // other mention on the site has to agree with it digit for digit.
  const PAYBILL = '714888';
  const ACCOUNT = '47046';

  const partial = fs.readFileSync(path.join(ROOT, 'partials', 'paybill.html'), 'utf8');
  assert.match(partial, new RegExp(`<dd>${PAYBILL}</dd>`), 'the partial must carry the paybill');
  assert.match(partial, new RegExp(`<dd>${ACCOUNT}</dd>`), 'the partial must carry the account number');

  const app = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8');
  assert.match(app, new RegExp(`paybill: '${PAYBILL}'`), 'the chat must quote the same paybill');
  assert.match(app, new RegExp(`account: '${ACCOUNT}'`), 'the chat must quote the same account');

  await startServer();
  try {
    // The pages a customer actually reads before paying.
    for (const route of ['/delivery', '/faq']) {
      const html = await (await fetch(base() + route)).text();
      assert.ok(html.includes(PAYBILL), `${route} should publish the paybill`);
      assert.ok(html.includes(ACCOUNT), `${route} should publish the account number`);
    }

    // Nothing anywhere may quote a *different* paybill.
    for (const file of fs.readdirSync(ROOT).filter(f => f.endsWith('.html'))) {
      const html = fs.readFileSync(path.join(ROOT, file), 'utf8');
      for (const [, near] of html.matchAll(/[Pp]aybill[^0-9]{0,40}(\d{5,7})/g)) {
        assert.equal(near, PAYBILL, `${file} quotes paybill ${near}, but the real one is ${PAYBILL}`);
      }
      for (const [, near] of html.matchAll(/[Aa]ccount number[^0-9]{0,40}(\d{4,7})/g)) {
        assert.equal(near, ACCOUNT, `${file} quotes account ${near}, but the real one is ${ACCOUNT}`);
      }
    }
  } finally {
    stopServer();
  }
});

test('admin image uploads are compressed before they are stored', async () => {
  // Product images are inlined into products.json as data URLs, and that
  // JSON is what every shopper downloads from /api/products. An unedited
  // phone photo is 3-5 MB and base64 adds a third; a catalogue of twenty
  // unresized photos would be ~100 MB per visitor. Verified in a browser:
  // a 5.7 MB 4032x3024 upload comes out 367 KB at 1200x900.
  const admin = fs.readFileSync(path.join(ROOT, 'admin.html'), 'utf8');

  assert.match(admin, /async function compressImage\(file\)/, 'the resize helper must exist');
  assert.match(admin, /IMAGE_MAX_EDGE\s*=\s*(\d+)/, 'a maximum edge length must be set');

  const maxEdge = Number(admin.match(/IMAGE_MAX_EDGE\s*=\s*(\d+)/)[1]);
  assert.ok(maxEdge > 0 && maxEdge <= 2000,
    `IMAGE_MAX_EDGE is ${maxEdge}px — large enough to defeat the point of resizing`);

  // Every file-picker handler has to go through it, not straight to the raw read.
  const handlers = [...admin.matchAll(/(?:handleProductImageUpload[\s\S]{0,700}?|new-image-file'\)\.addEventListener[\s\S]{0,700}?)showToast/g)]
    .map(m => m[0]);
  assert.ok(handlers.length >= 2, 'expected both upload paths (existing product, and new product)');
  for (const handler of handlers) {
    assert.match(handler, /await compressImage\(file\)/,
      'an upload path still stores the raw file — it must call compressImage first');
  }
});
