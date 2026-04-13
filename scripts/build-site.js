#!/usr/bin/env node
/**
 * build-site.js — Builds the deployed/ site from apps/approved/
 *
 * - Injects nav bar, analytics, favicon, and "More Tools" into each tool page
 * - Generates deployed/index.html (landing page with cards, categories, FAQ)
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
const BASE_URL = 'https://freetoolbox.tools';
const GA_ID = 'G-XXXXXXXXXX'; // Replace with real Measurement ID

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
 * Derive a clean, short slug — max 40 chars, strips subtitle after pipe/dash/colon
 */
function titleToSlug(title) {
  // Strip everything after |, —, or " - " (subtitles)
  const base = title.split(/\s*[|—]\s*|\s+-\s+/)[0].trim();
  return base
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 40)
    .replace(/-$/, '');
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function escHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Pick N random items from an array, excluding a given slug */
function randomOthers(apps, excludeSlug, n = 4) {
  const pool = apps.filter(a => a.slug !== excludeSlug);
  const shuffled = pool.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/** Infer a broad category from the app title/description */
function inferCategory(title, description = '') {
  const text = (title + ' ' + description).toLowerCase();
  if (/calculat|estimat|convert|metric|unit|rate|cost|price|tax|salary|budget|finance|percent|margin/.test(text)) return 'calculators';
  if (/generat|creat|build|maker|builder|writer|templat/.test(text)) return 'generators';
  if (/analyz|checker|audit|validator|test|debug|inspect|scan/.test(text)) return 'analyzers';
  if (/track|monitor|manager|organiz|planner|schedule|calendar/.test(text)) return 'productivity';
  if (/format|encode|decode|convert|transform|parse|minif/.test(text)) return 'converters';
  if (/seo|keyword|rank|search|traffic|sitemap/.test(text)) return 'seo';
  return 'other';
}

// ── snippets injected into every tool page ────────────────────────────────────

const FAVICON_TAG = `<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🧰</text></svg>">`;

const ANALYTICS_TAGS = `<!-- Google Analytics -->
<script async src="https://www.googletagmanager.com/gtag/js?id=${GA_ID}"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${GA_ID}');</script>`;

const NAV_BAR = `<nav style="background:#1a1a2e;padding:10px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid #2a2d3e;font-family:system-ui,sans-serif;font-size:14px">
  <a href="${BASE_URL}/" style="color:#7c3aed;text-decoration:none;font-weight:700">← Free Online Tools</a>
  <span style="color:#444">|</span>
  <a href="${BASE_URL}/" style="color:#888;text-decoration:none">Browse All Tools</a>
</nav>`;

function moreToolsSection(others) {
  const links = others.map(a =>
    `<a href="${BASE_URL}/apps/${a.slug}.html" style="display:block;padding:8px 12px;background:#1a1d27;border:1px solid #2a2d3e;border-radius:8px;color:#e2e4f0;text-decoration:none;font-size:13px;transition:border-color .2s" onmouseover="this.style.borderColor='#6c63ff'" onmouseout="this.style.borderColor='#2a2d3e'">${escHtml(a.title)}</a>`
  ).join('\n    ');

  return `
<section style="background:#0f1117;border-top:1px solid #2a2d3e;padding:24px 20px;font-family:system-ui,sans-serif">
  <div style="max-width:860px;margin:0 auto">
    <h3 style="color:#8b8fa8;font-size:13px;text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px">More Free Tools</h3>
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
    ${links}
    </div>
    <div style="margin-top:14px;text-align:center">
      <a href="${BASE_URL}/" style="color:#6c63ff;text-decoration:none;font-size:13px">Browse all ${0} tools →</a>
    </div>
  </div>
</section>`;
}

/** Inject nav, favicon, analytics, and more-tools into a tool's HTML */
function injectIntoTool(html, others, totalCount) {
  let out = html;

  // 1. Favicon — insert before </head> if not already present
  if (!out.includes('rel="icon"') && !out.includes("rel='icon'")) {
    out = out.replace(/<\/head>/i, `  ${FAVICON_TAG}\n</head>`);
  }

  // 2. Analytics — insert before </head>
  if (!out.includes('googletagmanager')) {
    out = out.replace(/<\/head>/i, `  ${ANALYTICS_TAGS}\n</head>`);
  }

  // 3. Nav bar — insert immediately after <body...>
  if (!out.includes('Free Online Tools') || !out.includes('Browse All Tools')) {
    out = out.replace(/(<body[^>]*>)/i, `$1\n${NAV_BAR}`);
  }

  // 4. More Tools section — insert before </body>
  const moreHtml = moreToolsSection(others).replace('Browse all 0 tools', `Browse all ${totalCount} tools`);
  if (!out.includes('More Free Tools')) {
    out = out.replace(/<\/body>/i, `${moreHtml}\n</body>`);
  }

  return out;
}

// ── main ─────────────────────────────────────────────────────────────────────

function main() {
  ensureDir(DEPLOYED_APPS_DIR);

  const sourceFiles = fs.readdirSync(APPROVED_DIR).filter(f => f.endsWith('.html'));
  if (sourceFiles.length === 0) {
    console.error('No approved apps found in', APPROVED_DIR);
    process.exit(1);
  }

  // First pass — build apps metadata list
  const apps = [];
  const slugsSeen = new Set();

  for (const filename of sourceFiles) {
    const srcPath = path.join(APPROVED_DIR, filename);
    const html = fs.readFileSync(srcPath, 'utf8');
    const { title, description } = extractMeta(html);

    let slug = title ? titleToSlug(title) : path.basename(filename, '.html').slice(0, 40);
    if (!slug) slug = path.basename(filename, '.html').slice(0, 40);

    if (slugsSeen.has(slug)) {
      let i = 2;
      while (slugsSeen.has(`${slug}-${i}`)) i++;
      slug = `${slug}-${i}`;
    }
    slugsSeen.add(slug);

    const category = inferCategory(title || '', description || '');
    apps.push({ slug, title: title || slug, description: description || '', filename, category, srcPath, html });
  }

  apps.sort((a, b) => a.title.localeCompare(b.title));

  // Second pass — inject nav/analytics/more-tools and write deployed files
  for (const app of apps) {
    const others = randomOthers(apps, app.slug, 4);
    const patchedHtml = injectIntoTool(
      app.html
        .replace(/(<link\s+rel=["']canonical["']\s+href=["'])[^"']*["']/gi, `$1${BASE_URL}/apps/${app.slug}.html"`)
        .replace(/(<meta\s+property=["']og:url["']\s+content=["'])[^"']*["']/gi, `$1${BASE_URL}/apps/${app.slug}.html"`)
        .replace(/(<meta\s+content=["'])[^"']*["'](\s+property=["']og:url["'])/gi, `$1${BASE_URL}/apps/${app.slug}.html"$2`),
      others,
      apps.length
    );

    const destPath = path.join(DEPLOYED_APPS_DIR, `${app.slug}.html`);
    fs.writeFileSync(destPath, patchedHtml, 'utf8');
    console.log(`  [ok] ${app.slug}.html  ← ${app.filename}`);
  }

  // ── Category groupings ────────────────────────────────────────────────────
  const categoryOrder = ['calculators', 'generators', 'analyzers', 'converters', 'productivity', 'seo', 'other'];
  const categoryLabels = {
    calculators: '🧮 Calculators',
    generators: '✨ Generators',
    analyzers: '🔍 Analyzers & Checkers',
    converters: '🔄 Converters & Formatters',
    productivity: '📅 Productivity & Planning',
    seo: '📈 SEO Tools',
    other: '🛠️ Other Tools'
  };

  const byCategory = {};
  for (const app of apps) {
    if (!byCategory[app.category]) byCategory[app.category] = [];
    byCategory[app.category].push(app);
  }

  const categorySections = categoryOrder
    .filter(cat => byCategory[cat] && byCategory[cat].length > 0)
    .map(cat => {
      const catApps = byCategory[cat];
      const catCards = catApps.map(app => `
        <article class="card">
          <h2><a href="apps/${app.slug}.html">${escHtml(app.title)}</a></h2>
          <p>${escHtml(app.description)}</p>
          <a class="btn" href="apps/${app.slug}.html">Open Tool →</a>
        </article>`).join('');
      return `
  <section class="category-section" id="cat-${cat}">
    <h2 class="cat-heading">${categoryLabels[cat]} <span class="cat-count">${catApps.length}</span></h2>
    <div class="grid">${catCards}
    </div>
  </section>`;
    }).join('\n');

  const allCards = apps.map(app => `
      <article class="card" data-category="${app.category}">
        <h2><a href="apps/${app.slug}.html">${escHtml(app.title)}</a></h2>
        <p>${escHtml(app.description)}</p>
        <a class="btn" href="apps/${app.slug}.html">Open Tool →</a>
      </article>`).join('\n');

  // ── FAQ ───────────────────────────────────────────────────────────────────
  const faqItems = [
    { q: 'Are these tools really free?', a: 'Yes, all tools are completely free to use with no sign-up, no ads, and no data collection.' },
    { q: 'Do these tools work offline?', a: 'Most tools run entirely in your browser using JavaScript. Once the page loads, many will work without an internet connection.' },
    { q: 'Is my data safe?', a: 'All processing happens in your browser. No data is sent to any server. We cannot see what you enter.' },
    { q: 'Can I use these tools on mobile?', a: 'Yes. Every tool is designed to be fully responsive and works on smartphones and tablets.' },
    { q: 'How often are new tools added?', a: 'We add new tools regularly based on user demand. Check back often or bookmark this page.' }
  ];

  const faqSchema = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqItems.map(f => ({
      '@type': 'Question',
      name: f.q,
      acceptedAnswer: { '@type': 'Answer', text: f.a }
    }))
  });

  const faqHtml = `
<section class="faq-section">
  <h2 class="section-heading">Frequently Asked Questions</h2>
  <div class="faq-list">
    ${faqItems.map(f => `
    <details class="faq-item">
      <summary>${escHtml(f.q)}</summary>
      <p>${escHtml(f.a)}</p>
    </details>`).join('')}
  </div>
</section>`;

  // ── index.html ────────────────────────────────────────────────────────────
  const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Free Online Tools — Calculators, Converters &amp; Generators | FreeToolbox</title>
  <meta name="description" content="${apps.length} free online tools: calculators, converters, generators, and more. No sign-up, no data collection, runs entirely in your browser.">
  <link rel="canonical" href="${BASE_URL}/">
  ${FAVICON_TAG}

  <!-- Open Graph -->
  <meta property="og:type" content="website">
  <meta property="og:url" content="${BASE_URL}/">
  <meta property="og:title" content="Free Online Tools — Calculators, Converters &amp; Generators">
  <meta property="og:description" content="${apps.length} free tools that run in your browser. No sign-up required.">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary">
  <meta name="twitter:title" content="Free Online Tools | FreeToolbox">
  <meta name="twitter:description" content="Calculators, converters, generators &amp; more — all free, no sign-up.">

  <!-- JSON-LD: WebSite -->
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "name": "FreeToolbox",
    "url": "${BASE_URL}/",
    "description": "Free online tools including calculators, converters, and generators. No sign-up required.",
    "potentialAction": {
      "@type": "SearchAction",
      "target": "${BASE_URL}/?q={search_term_string}",
      "query-input": "required name=search_term_string"
    }
  }
  </script>

  <!-- JSON-LD: FAQ -->
  <script type="application/ld+json">${faqSchema}</script>

  ${ANALYTICS_TAGS}

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3e;
      --accent: #6c63ff; --accent-hover: #857dff;
      --text: #e2e4f0; --muted: #8b8fa8; --radius: 12px;
    }
    body { background:var(--bg); color:var(--text); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; line-height:1.6; min-height:100vh; }

    header { padding:3rem 1.5rem 2rem; text-align:center; border-bottom:1px solid var(--border); }
    header h1 { font-size:clamp(1.75rem,5vw,3rem); font-weight:700; background:linear-gradient(135deg,#fff 0%,var(--accent-hover) 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; background-clip:text; }
    .tagline { margin-top:.5rem; color:var(--muted); font-size:1.05rem; max-width:540px; margin-left:auto; margin-right:auto; }
    .intro-para { margin:.75rem auto 0; max-width:600px; color:#a0a3b5; font-size:.95rem; }
    .badge { display:inline-block; margin-top:1rem; background:var(--surface); border:1px solid var(--border); border-radius:999px; padding:.3rem 1rem; font-size:.85rem; color:var(--muted); }
    .search-wrap { max-width:480px; margin:1.5rem auto 0; }
    #search { width:100%; padding:.75rem 1rem; background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); color:var(--text); font-size:1rem; outline:none; transition:border-color .2s; }
    #search:focus { border-color:var(--accent); }
    #search::placeholder { color:var(--muted); }

    main { max-width:1200px; margin:2.5rem auto; padding:0 1.5rem; }

    .section-heading { font-size:1.25rem; font-weight:700; color:var(--text); margin-bottom:1.25rem; padding-bottom:.5rem; border-bottom:1px solid var(--border); }
    .cat-heading { font-size:1.1rem; font-weight:600; color:var(--accent-hover); margin:2rem 0 1rem; display:flex; align-items:center; gap:.5rem; }
    .cat-count { background:var(--surface); border:1px solid var(--border); border-radius:999px; padding:.1rem .6rem; font-size:.75rem; color:var(--muted); font-weight:400; }
    .category-section { margin-bottom:2rem; }

    .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(280px,1fr)); gap:1.25rem; }
    .card { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); padding:1.5rem; display:flex; flex-direction:column; gap:.75rem; transition:border-color .2s,transform .15s; }
    .card:hover { border-color:var(--accent); transform:translateY(-2px); }
    .card h2 { font-size:1rem; font-weight:600; line-height:1.4; }
    .card h2 a { color:var(--text); text-decoration:none; }
    .card h2 a:hover { color:var(--accent-hover); }
    .card p { font-size:.875rem; color:var(--muted); flex:1; display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
    .btn { display:inline-block; margin-top:auto; padding:.5rem 1rem; background:var(--accent); color:#fff; border-radius:8px; text-decoration:none; font-size:.85rem; font-weight:500; text-align:center; transition:background .2s; }
    .btn:hover { background:var(--accent-hover); }

    #no-results { display:none; text-align:center; color:var(--muted); padding:3rem; grid-column:1/-1; }

    /* FAQ */
    .faq-section { margin-top:3rem; padding-top:2rem; border-top:1px solid var(--border); }
    .faq-list { display:flex; flex-direction:column; gap:.75rem; max-width:760px; }
    .faq-item { background:var(--surface); border:1px solid var(--border); border-radius:var(--radius); overflow:hidden; }
    .faq-item summary { padding:1rem 1.25rem; cursor:pointer; font-weight:500; color:var(--text); list-style:none; display:flex; justify-content:space-between; align-items:center; }
    .faq-item summary::-webkit-details-marker { display:none; }
    .faq-item summary::after { content:'＋'; color:var(--accent); font-size:1.1rem; }
    .faq-item[open] summary::after { content:'－'; }
    .faq-item p { padding:.75rem 1.25rem 1rem; color:var(--muted); font-size:.9rem; border-top:1px solid var(--border); }

    footer { text-align:center; padding:2rem 1rem; color:var(--muted); font-size:.85rem; border-top:1px solid var(--border); }

    /* Search mode: hide category headings, show flat grid */
    body.searching .category-section { display:none; }
    body.searching #search-results { display:block; }
    #search-results { display:none; }
  </style>
</head>
<body>

<header>
  <h1>Free Online Tools</h1>
  <p class="tagline">Calculators, converters, generators &amp; more — instant, free, no sign-up.</p>
  <p class="intro-para">Free, instant web tools that run entirely in your browser. No sign-up, no data collection, no ads. Just open and use.</p>
  <span class="badge">${apps.length} tools available</span>
  <div class="search-wrap">
    <input id="search" type="search" placeholder="Search tools..." autocomplete="off">
  </div>
</header>

<main>

  <!-- Search results (hidden until query entered) -->
  <div id="search-results">
    <div class="grid" id="results-grid">
${allCards}
      <p id="no-results">No tools match your search.</p>
    </div>
  </div>

  <!-- Category sections (shown when not searching) -->
${categorySections}

${faqHtml}

</main>

<footer>
  <p>All tools run in your browser — no data is sent to any server.</p>
</footer>

<script>
  const searchInput = document.getElementById('search');
  const resultsGrid = document.getElementById('results-grid');
  const searchResults = document.getElementById('search-results');
  const allCards = Array.from(resultsGrid.querySelectorAll('.card'));
  const noRes = document.getElementById('no-results');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    if (q) {
      document.body.classList.add('searching');
      let visible = 0;
      allCards.forEach(card => {
        const show = card.textContent.toLowerCase().includes(q);
        card.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      noRes.style.display = visible === 0 ? 'block' : 'none';
    } else {
      document.body.classList.remove('searching');
      allCards.forEach(card => card.style.display = '');
      noRes.style.display = 'none';
    }
  });
</script>

</body>
</html>
`;

  fs.writeFileSync(path.join(DEPLOYED_DIR, 'index.html'), indexHtml, 'utf8');
  console.log(`\n  [ok] deployed/index.html  (${apps.length} tools, ${Object.keys(byCategory).length} categories)`);

  // ── sitemap.xml ───────────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10);
  const urlEntries = [
    `  <url><loc>${BASE_URL}/</loc><lastmod>${today}</lastmod><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    ...apps.map(app =>
      `  <url><loc>${BASE_URL}/apps/${app.slug}.html</loc><lastmod>${today}</lastmod><changefreq>monthly</changefreq><priority>0.8</priority></url>`
    )
  ].join('\n');

  fs.writeFileSync(path.join(DEPLOYED_DIR, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urlEntries}\n</urlset>\n`, 'utf8');
  console.log('  [ok] deployed/sitemap.xml');

  // ── robots.txt ────────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(DEPLOYED_DIR, 'robots.txt'),
    `User-agent: *\nAllow: /\n\nSitemap: ${BASE_URL}/sitemap.xml\n`, 'utf8');
  console.log('  [ok] deployed/robots.txt');

  // ── 404.html ──────────────────────────────────────────────────────────────
  fs.writeFileSync(path.join(DEPLOYED_DIR, '404.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tool Not Found | FreeToolbox</title>
  ${FAVICON_TAG}
  <style>
    body{background:#0f1117;color:#e2e4f0;font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;text-align:center;padding:2rem}
    h1{font-size:4rem;color:#6c63ff;margin-bottom:1rem}p{color:#8b8fa8;margin-bottom:2rem}
    a{display:inline-block;padding:.75rem 1.5rem;background:#6c63ff;color:#fff;border-radius:8px;text-decoration:none;font-weight:600}
    a:hover{background:#857dff}
  </style>
</head>
<body><div><h1>404</h1><p>That tool doesn't exist — or may have moved.</p><a href="${BASE_URL}/">Browse all tools →</a></div></body>
</html>`, 'utf8');
  console.log('  [ok] deployed/404.html');

  console.log(`\nBuild complete. ${apps.length} apps deployed to deployed/apps/\n`);
}

main();
