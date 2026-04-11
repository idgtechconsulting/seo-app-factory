#!/usr/bin/env node
/**
 * generate-sitemap.js
 * Reads all HTML files in deployed/ and generates:
 *   - deployed/sitemap.xml
 *   - deployed/index.html (links to all apps)
 * Usage: BASE_URL=https://example.com node scripts/generate-sitemap.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const DEPLOYED_DIR = path.join(REPO_ROOT, 'deployed');
const BASE_URL = process.env.BASE_URL || 'https://example.com';

function escape(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function extractTitle(html) {
  const m = html.match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].trim() : null;
}

function extractDescription(html) {
  const m = html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']+)["']/i)
           || html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']description["']/i);
  return m ? m[1].trim() : '';
}

function main() {
  if (!fs.existsSync(DEPLOYED_DIR)) {
    fs.mkdirSync(DEPLOYED_DIR, { recursive: true });
  }

  const allFiles = fs.readdirSync(DEPLOYED_DIR).filter(f =>
    f.endsWith('.html') && f !== 'index.html'
  );

  console.log(`Found ${allFiles.length} deployed app(s).`);

  const now = new Date().toISOString().split('T')[0];

  // Build sitemap entries
  const urlEntries = allFiles.map(file => {
    const loc = `${BASE_URL}/${file}`;
    return `  <url>\n    <loc>${escape(loc)}</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>0.8</priority>\n  </url>`;
  });

  // Add root
  urlEntries.unshift(
    `  <url>\n    <loc>${escape(BASE_URL)}/</loc>\n    <lastmod>${now}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>1.0</priority>\n  </url>`
  );

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries.join('\n')}\n</urlset>\n`;

  fs.writeFileSync(path.join(DEPLOYED_DIR, 'sitemap.xml'), sitemap, 'utf8');
  console.log('Written: deployed/sitemap.xml');

  // Build index.html
  const appItems = allFiles.map(file => {
    const html = fs.readFileSync(path.join(DEPLOYED_DIR, file), 'utf8');
    const title = extractTitle(html) || file.replace('.html', '');
    const desc = extractDescription(html);
    return `    <li><a href="${escape(file)}">${escape(title)}</a>${desc ? ` — ${escape(desc)}` : ''}</li>`;
  }).join('\n');

  const indexHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="A collection of free, fast, single-page web tools.">
  <title>Web Tools Index</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; }
    h1 { font-size: 1.8rem; }
    ul { list-style: none; padding: 0; }
    li { margin: 0.75rem 0; }
    a { color: #2563eb; text-decoration: none; font-weight: 500; }
    a:hover { text-decoration: underline; }
    small { color: #6b7280; }
  </style>
</head>
<body>
  <h1>Web Tools</h1>
  <p>Free, fast, no-dependency tools that run entirely in your browser.</p>
  <ul>
${appItems || '    <li>No apps deployed yet.</li>'}
  </ul>
  <footer>
    <small>Generated on ${now} &mdash; <a href="sitemap.xml">Sitemap</a></small>
  </footer>
</body>
</html>
`;

  fs.writeFileSync(path.join(DEPLOYED_DIR, 'index.html'), indexHTML, 'utf8');
  console.log('Written: deployed/index.html');
}

main();
