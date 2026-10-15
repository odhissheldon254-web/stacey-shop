/**
 * Local preview server — not used in production.
 *
 * The live shop is plain files on GitHub Pages; the catalogue and Stacey's
 * login are Supabase (see store.js). This serves the built _site/ folder
 * with the same rules GitHub Pages uses, so what you see on localhost is
 * what goes live:
 *   /women       → women.html   (extensionless URLs)
 *   unknown path → 404.html with status 404
 *
 *   npm run build && npm start   →  http://localhost:3000
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

const siteDir = path.join(__dirname, '_site');
const port = Number(process.env.PORT) || 3000;
const host = process.env.HOST || '127.0.0.1';

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
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.woff2': 'font/woff2'
};

function resolveFile(urlPath) {
  let rel = decodeURIComponent(urlPath).replace(/^\/+/, '');
  if (rel === '' || rel.endsWith('/')) rel += 'index.html';
  const candidates = path.extname(rel) ? [rel] : [`${rel}.html`, path.join(rel, 'index.html')];
  for (const candidate of candidates) {
    const full = path.resolve(siteDir, candidate);
    if (!full.startsWith(siteDir + path.sep)) return null;
    if (fs.existsSync(full) && fs.statSync(full).isFile()) return full;
  }
  return null;
}

function send(res, status, file) {
  res.writeHead(status, {
    'Content-Type': MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream'
  });
  fs.createReadStream(file).pipe(res);
}

if (!fs.existsSync(siteDir)) {
  console.error('No _site/ folder yet — run `npm run build` first.');
  process.exit(1);
}

http.createServer((req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const file = resolveFile(url.pathname);
    if (file) send(res, 200, file);
    else send(res, 404, path.join(siteDir, '404.html'));
  } catch {
    res.writeHead(400).end();
  }
}).listen(port, host, () => {
  console.log(`Tacey Collections preview on http://${host}:${port}`);
});
