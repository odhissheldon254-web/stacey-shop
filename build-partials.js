#!/usr/bin/env node
/**
 * Keeps shared chunks of markup (footer, info-page nav, common <head> tags)
 * identical across every page.
 *
 * A page opts in by wrapping a region in markers:
 *
 *   <!-- @partial:footer -->
 *   ...anything here is overwritten...
 *   <!-- /@partial:footer -->
 *
 * Edit the file in partials/, run `npm run build`, and every page picks it up.
 * Output stays plain static HTML, so crawlers and any host see the real links.
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const partialsDir = path.join(root, 'partials');

const partials = Object.fromEntries(
  fs.readdirSync(partialsDir)
    .filter(file => file.endsWith('.html'))
    .map(file => [
      path.basename(file, '.html'),
      fs.readFileSync(path.join(partialsDir, file), 'utf8').replace(/\s+$/, '')
    ])
);

const pages = fs.readdirSync(root).filter(file => file.endsWith('.html'));

let changed = 0;
let injected = 0;
const missing = [];

for (const page of pages) {
  const file = path.join(root, page);
  const original = fs.readFileSync(file, 'utf8');

  const updated = original.replace(
    /([ \t]*)<!-- @partial:([a-z-]+) -->[\s\S]*?<!-- \/@partial:\2 -->/g,
    (whole, indent, name) => {
      const body = partials[name];
      if (body === undefined) {
        missing.push(`${page} → ${name}`);
        return whole;
      }
      injected++;
      return `${indent}<!-- @partial:${name} -->\n${body}\n${indent}<!-- /@partial:${name} -->`;
    }
  );

  if (updated !== original) {
    fs.writeFileSync(file, updated);
    changed++;
    console.log(`  updated  ${page}`);
  }
}

if (missing.length) {
  console.error(`\nUnknown partial referenced:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}

console.log(`\n${injected} region(s) synced across ${pages.length} page(s); ${changed} file(s) rewritten.`);
