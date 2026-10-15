#!/usr/bin/env node
/**
 * Builds _site/: exactly the files GitHub Pages publishes, nothing else.
 *
 *   npm run build   →  sync partials, then write _site/
 *
 * GitHub Pages serves /women from women.html, so the one department
 * template (shop.html) is written out once per department, each with its
 * own title and canonical URL so search engines index them separately.
 * Source, tests, docs and setup scripts never reach the public site.
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const out = path.join(root, '_site');
const SITE = 'https://tacey.odhis.co.ke';
const DOMAIN = 'tacey.odhis.co.ke';

const PUBLIC_FILES = [
  'index.html', 'shop.html', 'about.html', 'contact.html', 'delivery.html',
  'faq.html', 'size-guide.html', '404.html', 'admin.html',
  'index.css', 'app.js', 'store.js', 'page.js',
  'robots.txt', 'sitemap.xml', 'site.webmanifest'
];
const PUBLIC_DIRS = ['assets'];

const DEPARTMENTS = {
  women: { title: "Women's Collection", desc: 'Heels, gowns, bags and everyday glam — curated for her at Tacey Collections, Kenya.' },
  men:   { title: "Men's Collection",   desc: 'Sharp fits, clean kicks and versatile streetwear — curated for him at Tacey Collections, Kenya.' },
  kids:  { title: "Kids' Corner",       desc: 'Playful, comfy and adorable picks for little trendsetters at Tacey Collections, Kenya.' }
};

function departmentPage(template, key, { title, desc }) {
  const fullTitle = `${title} | Tacey Collections`;
  const url = `${SITE}/${key}`;
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${fullTitle}</title>`)
    .replace(/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`)
    .replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${fullTitle}$2`)
    .replace(/(<meta name="twitter:title" content=")[^"]*(")/, `$1${fullTitle}$2`)
    .replace(/(<meta name="description" content=")[^"]*(")/, `$1${desc}$2`)
    .replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${desc}$2`);
}

function build() {
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out);

  for (const file of PUBLIC_FILES) {
    fs.copyFileSync(path.join(root, file), path.join(out, file));
  }
  for (const dir of PUBLIC_DIRS) {
    fs.cpSync(path.join(root, dir), path.join(out, dir), { recursive: true });
  }

  const template = fs.readFileSync(path.join(root, 'shop.html'), 'utf8');
  for (const [key, meta] of Object.entries(DEPARTMENTS)) {
    fs.writeFileSync(path.join(out, `${key}.html`), departmentPage(template, key, meta));
  }

  fs.writeFileSync(path.join(out, 'CNAME'), `${DOMAIN}\n`);
  fs.writeFileSync(path.join(out, '.nojekyll'), '');

  const count = fs.readdirSync(out, { recursive: true }).length;
  console.log(`_site/ ready: ${count} file(s).`);
}

if (require.main === module) build();
module.exports = { build, PUBLIC_FILES, DEPARTMENTS, out };
