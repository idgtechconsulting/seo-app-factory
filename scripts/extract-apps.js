#!/usr/bin/env node
/**
 * extract-apps.js
 * Connects to Paperclip API, fetches issues with Gemma-generated app content,
 * extracts HTML, and saves to apps/staging/.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const STAGING_DIR = path.join(REPO_ROOT, 'apps', 'staging');
const PAPERCLIP_BASE = 'http://localhost:3100';

function slugify(title) {
  // Strip common suffixes before slugifying
  let clean = title
    .replace(/\s*[\|—–]\s*(Professional|Free|Online|Tool|Calculator|Generator|Converter|App|Checker|Analyzer|Builder|Maker|Formatter|Validator)[^$]*/i, '')
    .replace(/^build\s+(?:a\s+|an\s+)?(?:complete\s+)?(?:single-file\s+html\s+app\s+for\s+a\s+)?/i, '')
    .replace(/^(?:build|implement|create)\s+(?:a\s+|an\s+)?(?:complete\s+)?(?:single[- ]file\s+)?(?:html\s+)?app\s+(?:for\s+a?\s*|that\s+|to\s+|where\s+)?/i, '')
    .trim();
  return clean
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function slugFromHtml(html, fallbackTitle) {
  const m = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const src = m ? m[1] : fallbackTitle;
  // Strip subtitle after |, —, –, or " - "
  const base = src.split(/\s*[\|—–]\s*|\s+-\s+/)[0].trim();
  // Strip common trailing filler words
  const clean = base.replace(/\s*[\|—–]\s*(Professional|Free|Online|Tool|Calculator|Generator|Converter|App).*$/i, '').trim();
  return clean
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

function extractHTML(text) {
  // Find the LAST <!DOCTYPE html> (skip any preamble with an earlier one)
  let start = -1;
  let searchFrom = 0;
  while (true) {
    const idx = text.search(new RegExp(`<!DOCTYPE\\s+html`, 'i'));
    // indexOf-style scan
    const next = text.indexOf('<!DOCTYPE', searchFrom);
    if (next === -1) break;
    start = next;
    searchFrom = next + 1;
  }
  if (start === -1) return null;
  const end = text.lastIndexOf('</html>');
  if (end === -1 || end < start) return null;
  return text.slice(start, end + 7);
}

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  return res.json();
}

async function getCompanyId() {
  const companies = await fetchJSON(`${PAPERCLIP_BASE}/api/companies`);
  // Pick the company with the most issues
  const sorted = companies.sort((a, b) => (b.issueCounter || 0) - (a.issueCounter || 0));
  return sorted[0].id;
}

async function main() {
  console.log('Connecting to Paperclip at', PAPERCLIP_BASE);

  let companyId;
  try {
    companyId = await getCompanyId();
    console.log('Using company:', companyId);
  } catch (err) {
    console.error('Failed to connect to Paperclip:', err.message);
    process.exit(1);
  }

  // Fetch all issues
  const issues = await fetchJSON(`${PAPERCLIP_BASE}/api/companies/${companyId}/issues`);

  // Filter: status "in_progress" or "done" and title starts with "Build"
  const appIssues = issues.filter(issue =>
    (issue.status === 'in_progress' || issue.status === 'done') &&
    /^Build\b/i.test(issue.title)
  );

  console.log(`Found ${appIssues.length} candidate issue(s) out of ${issues.length} total.`);

  let extracted = 0;
  let skipped = 0;

  for (const issue of appIssues) {
    // Fetch comments for this issue
    let comments;
    try {
      comments = await fetchJSON(`${PAPERCLIP_BASE}/api/issues/${issue.id}/comments`);
    } catch (err) {
      console.warn(`  [skip] Issue ${issue.id}: failed to fetch comments — ${err.message}`);
      skipped++;
      continue;
    }

    if (!comments || comments.length === 0) {
      console.warn(`  [skip] Issue ${issue.id}: no comments yet.`);
      skipped++;
      continue;
    }

    // Find the comment that contains HTML (search from latest backwards)
    let html = null;
    for (let i = comments.length - 1; i >= 0; i--) {
      const body = comments[i].body || comments[i].content || comments[i].text || '';
      const candidate = extractHTML(body);
      if (candidate) {
        html = candidate;
        break;
      }
    }

    if (!html) {
      console.warn(`  [skip] Issue ${issue.id} ("${issue.title.slice(0, 60)}"): no HTML found in any comment.`);
      skipped++;
      continue;
    }

    const slug = slugFromHtml(html, issue.title);
    const htmlFile = path.join(STAGING_DIR, `${slug}.html`);
    const metaFile = path.join(STAGING_DIR, `${slug}.meta.json`);

    // Avoid overwriting with identical content
    if (fs.existsSync(htmlFile)) {
      const existing = fs.readFileSync(htmlFile, 'utf8');
      if (existing === html) {
        console.log(`  [same] ${slug}.html already up-to-date.`);
        continue;
      }
    }

    fs.writeFileSync(htmlFile, html, 'utf8');

    const meta = {
      issueId: issue.id,
      title: issue.title,
      slug,
      keywordTarget: issue.title.replace(/^Build\s+(?:a\s+|an\s+)?(?:complete\s+)?(?:single-file\s+html\s+app\s+for\s+a\s+)?/i, ''),
      timestamp: new Date().toISOString(),
      sourceIssueUrl: `${PAPERCLIP_BASE}/issues/${issue.id}`,
    };
    fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), 'utf8');

    console.log(`  [ok] Extracted: ${slug}.html (${html.length} bytes)`);
    extracted++;
  }

  console.log(`\nDone. ${extracted} app(s) extracted, ${skipped} skipped → apps/staging/`);
}

main().catch(err => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
