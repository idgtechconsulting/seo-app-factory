#!/usr/bin/env node
/**
 * build-site.js — Builds the deployed/ site from apps/approved/
 *
 * - Copies approved apps to deployed/apps/{slug}.html
 * - Generates deployed/index.html (landing page with cards)
 * - Generates deployed/sitemap.xml
 * - Generates deployed/robots.txt
 * - Generates deployed/404.html
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const APPROVED_DIR = path.join(__dirname, '..', 'apps', 'approved');
const DEPLOYED_DIR = path.join(__dirname, '..', 'deployed');
const DEPLOYED_APPS_DIR = path.join(DEPLOYED_DIR, 'apps');
const BASE_URL = 'https://idgtechconsulting.github.io/seo-app-factory';

// ── helpers ──────────────────────────────────────────────────────────────────

function extractMeta(html) {
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const descMatch = html.match(/<meta\s+name=["']description["']\s+content=["']([^"']+)["']/i)
                 || html.match(/<meta\s+content=["']([^"']+)["']\s+name=["']description["']/i);

  const title = titleMatch ? titleMatch[1].trim() : null;
  const description = descMatch ? descMatch[1].trim() : null;
  return { title, description };
}

/**
 * Derive a clean, short slug from the title.
 * Falls back to the source filename (without extension).
 */
function titleToSlug(title) {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/-$/, '');
}

// Ensure a directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  ensureDir(DEPLOYED_APPS_DIR);

  const sourceFiles = fs.readdirSync(APPROVED_DIR).filter(f => f.endsWith('.html'));
  if (sourceFiles.length === 0) {
    console.error('No approved apps found in', APPROVED_DIR);
    process.exit(1);
  }

  const apps = [];
  const slugsSeen = new Set();

  for (const filename of sourceFiles) {
    const srcPath = path.join(APPROVED_DIR, filename);
    const html = fs.readFileSync(srcPath, 'utf8');
    const { title, description } = extractMeta(html);

    // Derive slug
    let slug = title ? titleToSlug(title) : path.basename(filename, '.html').slice(0, 60);

    // De-duplicate slugs
    if (slugsSeen.has(slug)) {
      let i = 2;
      while (slugsSeen.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    slugsSeen.add(slug);

    const destPath = path.join(DEPLOYED_APPS_DIR, `${slug}.html`);

    // Patch canonical / OG URL in the HTML so they point to the real deployed URL
    const appUrl = `${BASE_URL}/apps/${slug}.html`;
    let patchedHtml = html
      .replace(/(<link\s+rel=["']canonical["']\s+href=["'])[^"']*["']/gi, `$1${appUrl}"`)
      .replace(/(<meta\s+property=["']og:url["']\s+content=["'])[^"']*["']/gi, `$1${appUrl}"`)
      .replace(/(<meta\s+content=["'])[^"']*["'](\s+property=["']og:url["'])/gi, `$1${appUrl}"$2`);

    fs.writeFileSync(destPath, patchedHtml, 'utf8');

    apps.push({ slug, title: title || slug, description: description || '', filename });
    console.log(`  [ok] ${slug}.html  ← ${filename}`);
  }

  // Sort alphabetically by title
  apps.sort((a, b) => a.title.localeCompare(b.title));

  // ── index.html ────────────────────────────────────────────────────────────

  const cards = apps.map(app => `
      <article class="card">
        <h2><a href="apps/${app.slug}.html">${escHtml(app.title)}</a></h2>
        <p>${escHtml(app.description)}</p>
        <a class="btn" href="apps/${app.slug}.html">Open Tool →</a>
      </article>`).join('\n');

  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Free Online Tools - Calculators, Converters &amp; Generators</title>
  <meta name="description" content="A collection of ${apps.length} free online tools: calculators, converters, generators, and more. No sign-up required.">

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${BASE_URL}/">
  <meta property="og:title" content="Free Online Tools - Calculators, Converters &amp; Generators">
  <meta property="og:description" content="A collection of ${apps.length} free online tools: calculators, converters, generators, and more.">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Free Online Tools">
  <meta name="twitter:description" content="Calculators, converters, generators &amp; more — all free, no sign-up.">

  <link rel="canonical" href="${BASE_URL}/">

  <!-- JSON-LD -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "Free Online Tools",
    "url": "${BASE_URL}/",
    "description": "A collection of free online tools including calculators, converters, and generators.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "${BASE_URL}/?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  </script>

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --border: #2a2d3e;
      --accent: #6c63ff;
      --accent-hover: #857dff;
      --text: #e2e4f0;
      --muted: #8b8fa8;
      --radius: 12px;
    }

    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      line-height: 1.6;
      min-height: 100vh;
    }

    header {
      padding: 3rem 1.5rem 2rem;
      text-align: center;
      border-bottom: 1px solid var(--border);
    }

    header h1 {
      font-size: clamp(1.75rem, 5vw, 3rem);
      font-weight: 700;
      background: linear-gradient(135deg, #fff 0%, var(--accent-hover) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    header p {
      margin-top: 0.75rem;
      color: var(--muted);
      font-size: 1.1rem;
      max-width: 540px;
      margin-left: auto;
      margin-right: auto;
    }

    .badge {
      display: inline-block;
      margin-top: 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 999px;
      padding: 0.3rem 1rem;
      font-size: 0.85rem;
      color: var(--muted);
    }

    /* Search */
    .search-wrap {
      max-width: 480px;
      margin: 1.5rem auto 0;
    }
    #search {
      width: 100%;
      padding: 0.75rem 1rem;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }
    #search:focus { border-color: var(--accent); }
    #search::placeholder { color: var(--muted); }

    main {
      max-width: 1200px;
      margin: 2.5rem auto;
      padding: 0 1.5rem;
    }

    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 1.25rem;
    }

    .card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      transition: border-color 0.2s, transform 0.15s;
    }
    .card:hover {
      border-color: var(--accent);
      transform: translateY(-2px);
    }

    .card h2 {
      font-size: 1rem;
      font-weight: 600;
      line-height: 1.4;
    }
    .card h2 a {
      color: var(--text);
      text-decoration: none;
    }
    .card h2 a:hover { color: var(--accent-hover); }

    .card p {
      font-size: 0.875rem;
      color: var(--muted);
      flex: 1;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .btn {
      display: inline-block;
      margin-top: auto;
      padding: 0.5rem 1rem;
      background: var(--accent);
      color: #fff;
      border-radius: 8px;
      text-decoration: none;
      font-size: 0.85rem;
      font-weight: 500;
      text-align: center;
      transition: background 0.2s;
    }
    .btn:hover { background: var(--accent-hover); }

    #no-results {
      display: none;
      text-align: center;
      color: var(--muted);
      padding: 3rem;
      grid-column: 1 / -1;
    }

    footer {
      text-align: center;
      padding: 2rem 1rem;
      color: var(--muted);
      font-size: 0.85rem;
      border-top: 1px solid var(--border);
    }
  </style>
</head>
<body>

<header>
  <h1>Free Online Tools</h1>
  <p>Calculators, converters, generators &amp; more — instant, free, no sign-up.</p>
  <span class="badge">${apps.length} tools available</span>
  <div class="search-wrap">
    <input id="search" type="search" placeholder="Search tools..." autocomplete="off">
  </div>
</header>

<main>
  <div class="grid" id="grid">
${cards}
    <p id="no-results">No tools match your search.</p>
  </div>
</main>

<footer>
  <p>All tools run in your browser — no data is sent to any server.</p>
</footer>

<script>
  const search = document.getElementById('search');
  const cards  = Array.from(document.querySelectorAll('.card'));
  const noRes  = document.getElementById('no-results');

  search.addEventListener('input', () => {
    const q = search.value.toLowerCase().trim();
    let visible = 0;
    cards.forEach(card => {
      const text = card.textContent.toLowerCase();
      const show = !q || text.includes(q);
      card.style.display = show ? '' : 'none';
      if (show) visible++;
    });
    noRes.style.display = visible === 0 ? 'block' : 'none';
  });
</script>

</body>
</html>
`;

  fs.writeFileSync(path.join(DEPLOYED_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`\n  [ok] deployed/index.html  (${apps.length} cards)`);

  // ── sitemap.xml ───────────────────────────────────────────────────────────

  const today = new Date().toISOString().slice(0, 10);
  const urlEntries = [
    `  <url><loc>${BASE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...apps.map(app =>
      `  <url><loc>${BASE_URL}/apps/${app.slug}.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    )
  ].join('\n');

  const sitemapXml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;
  fs.writeFileSync(path.join(DEPLOYED_DIR, 'sitemap.xml'), sitemapXml, 'utf8');
  console.log('  [ok] deployed/sitemap.xml');

  // ── robots.txt ────────────────────────────────────────────────────────────

  const robotsTxt = `User-agent: *
Allow: /

Sitemap: ${BASE_URL}/sitemap.xml
`;
  fs.writeFileSync(path.join(DEPLOYED_DIR, 'robots.txt'), robotsTxt, 'utf8');
  console.log('  [ok] deployed/robots.txt');

  // ── 404.html ──────────────────────────────────────────────────────────────

  const notFoundHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tool Not Found | Free Online Tools</title>
  <style>
    body { background:#0f1117; color:#e2e4f0; font-family:system-ui,sans-serif;
           display:flex; align-items:center; justify-content:center;
           min-height:100vh; text-align:center; padding:2rem; }
    h1 { font-size:4rem; color:#6c63ff; margin-bottom:1rem; }
    p  { color:#8b8fa8; margin-bottom:2rem; }
    a  { display:inline-block; padding:.75rem 1.5rem; background:#6c63ff;
         color:#fff; border-radius:8px; text-decoration:none; font-weight:600; }
    a:hover { background:#857dff; }
  </style>
</head>
<body>
  <div>
    <h1>404</h1>
    <p>That tool doesn't exist — or may have moved.</p>
    <a href="${BASE_URL}/">Browse all tools →</a>
  </div>
</body>
</html>
`;
  fs.writeFileSync(path.join(DEPLOYED_DIR, '404.html'), notFoundHtml, 'utf8');
  console.log('  [ok] deployed/404.html');

  console.log(`\nBuild complete. ${apps.length} apps deployed to deployed/apps/\n`);
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

main();
