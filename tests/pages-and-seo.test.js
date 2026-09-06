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
