#!/usr/bin/env node
/**
 * evaluate-app.js
 * Evaluates a single HTML app file for SEO and quality criteria.
 * Usage: node scripts/evaluate-app.js <path-to-file>
 * Outputs JSON result.
 */

import fs from 'fs';
import path from 'path';

const PASS_THRESHOLD = 75;

const CHECKS = [
  {
    id: 'doctype',
    label: 'Has <!DOCTYPE html>',
    weight: 10,
    test: html => /<!DOCTYPE\s+html>/i.test(html),
  },
  {
    id: 'html_lang',
    label: 'Has <html lang="...">',
    weight: 5,
    test: html => /<html[^>]+lang\s*=\s*["'][a-z-]+["']/i.test(html),
  },
  {
    id: 'meta_viewport',
    label: 'Has meta viewport',
    weight: 5,
    test: html => /<meta[^>]+name\s*=\s*["']viewport["']/i.test(html),
  },
  {
    id: 'meta_description',
    label: 'Has meta description > 50 chars',
    weight: 10,
    test: html => {
      const m = html.match(/<meta[^>]+name\s*=\s*["']description["'][^>]+content\s*=\s*["']([^"']+)["']/i)
                || html.match(/<meta[^>]+content\s*=\s*["']([^"']+)["'][^>]+name\s*=\s*["']description["']/i);
      return m ? m[1].trim().length > 50 : false;
    },
  },
  {
    id: 'title',
    label: 'Has <title> > 10 chars',
    weight: 8,
    test: html => {
      const m = html.match(/<title>([^<]+)<\/title>/i);
      return m ? m[1].trim().length > 10 : false;
    },
  },
  {
    id: 'og_title',
    label: 'Has og:title',
    weight: 5,
    test: html => /<meta[^>]+property\s*=\s*["']og:title["']/i.test(html)
               || /<meta[^>]+og:title/i.test(html),
  },
  {
    id: 'og_description',
    label: 'Has og:description',
    weight: 5,
    test: html => /<meta[^>]+property\s*=\s*["']og:description["']/i.test(html)
               || /<meta[^>]+og:description/i.test(html),
  },
  {
    id: 'no_external_cdn',
    label: 'No external script/link CDN tags',
    weight: 10,
    test: html => {
      // Disallow script src or link href pointing to http/https external domains
      const externalScript = /<script[^>]+src\s*=\s*["']https?:\/\//i.test(html);
      const externalLink = /<link[^>]+href\s*=\s*["']https?:\/\//i.test(html);
      return !externalScript && !externalLink;
    },
  },
  {
    id: 'semantic_html',
    label: 'Has semantic HTML (main, section, or article)',
    weight: 7,
    test: html => /<(main|section|article)[\s>]/i.test(html),
  },
  {
    id: 'has_script',
    label: 'Has <script> tag (functionality)',
    weight: 10,
    test: html => /<script[\s>]/i.test(html),
  },
  {
    id: 'file_size',
    label: 'File size > 5000 bytes',
    weight: 10,
    test: html => Buffer.byteLength(html, 'utf8') > 5000,
  },
  {
    id: 'json_ld',
    label: 'Has JSON-LD structured data',
    weight: 10,
    test: html => /<script[^>]+type\s*=\s*["']application\/ld\+json["']/i.test(html),
  },
  {
    id: 'no_preamble',
    label: 'No visible preamble text before DOCTYPE',
    weight: 5,
    test: html => {
      const trimmed = html.trimStart();
      return /^<!DOCTYPE\s+html>/i.test(trimmed);
    },
  },
];

// ── Functional checks — detect fake/impossible apps ───────────────────────
const FUNCTIONAL_CHECKS = [
  {
    id: 'has_event_listeners',
    label: 'Has interactive event listeners (click, input, change, submit)',
    weight: 10,
    test: html => /addEventListener\s*\(\s*['"](?:click|input|change|submit|keyup|keydown)/i.test(html)
               || /on(?:click|input|change|submit)\s*=/i.test(html),
  },
  {
    id: 'has_dom_manipulation',
    label: 'Has DOM manipulation (getElementById, querySelector, innerHTML, textContent)',
    weight: 8,
    test: html => /(?:getElementById|querySelector|innerHTML|textContent|innerText|\.value\s*[=!])/i.test(html),
  },
  {
    id: 'not_all_hardcoded',
    label: 'Has computation logic (Math, parseFloat, parseInt, ternary, if/else with variables)',
    weight: 10,
    test: html => {
      const scriptMatch = html.match(/<script[\s\S]*?>([\s\S]*?)<\/script>/gi);
      if (!scriptMatch) return false;
      const scripts = scriptMatch.join(' ');
      // Must have actual computation, not just display logic
      const hasComputation = /(?:Math\.|parseFloat|parseInt|Number\(|\.toFixed|reduce\(|\.map\(|\.filter\(|new Date|RegExp)/i.test(scripts);
      const hasConditionals = /if\s*\(|switch\s*\(|\?\s*[^:]+\s*:/i.test(scripts);
      return hasComputation || hasConditionals;
    },
  },
  {
    id: 'no_impossible_features',
    label: 'Does not claim backend features impossible in single-file HTML',
    weight: 15,
    test: html => {
      // These patterns indicate the app claims to do things a single HTML file can't actually do
      const impossiblePatterns = [
        /connects?\s+to\s+(?:your|a|the)\s+(?:api|database|server|backend)/i,
        /(?:real[- ]?time|live)\s+(?:data|feed|stream|update)\s+from/i,
        /(?:scrapes?|crawls?|monitors?|scan(?:s|ning)?)\s+(?:reddit|twitter|linkedin|hacker\s*news|websites?|social)/i,
        /(?:uploads?\s+to|saves?\s+to|syncs?\s+with)\s+(?:cloud|server|database)/i,
        /(?:analyze|scan|monitor)\s+(?:reddit|twitter|social\s+media)/i,
        /(?:pull|fetch|get)s?\s+(?:data|results|listings)\s+from\s+(?:api|server|reddit|twitter)/i,
        /chrome\s+extension/i,
        /browser\s+extension/i,
        /crowdsourc/i,
        /community[- ]sourced/i,
        /user[- ]submitted\s+(?:data|content|reviews|prices)/i,
      ];
      // Check head section AND meta content (first 3000 chars covers all meta tags)
      const head = html.slice(0, 3000);
      for (const pat of impossiblePatterns) {
        if (pat.test(head)) return false;
      }
      return true;
    },
  },
  {
    id: 'has_user_input',
    label: 'Has input elements (input, textarea, select, or contenteditable)',
    weight: 8,
    test: html => /<(?:input|textarea|select)\b/i.test(html)
               || /contenteditable\s*=\s*["']true["']/i.test(html),
  },
  {
    id: 'has_output_display',
    label: 'Has designated output area (result, output, or dynamic content region)',
    weight: 5,
    test: html => /id\s*=\s*["'](?:result|output|display|answer|calculation|preview)/i.test(html)
               || /class\s*=\s*["'][^"']*(?:result|output|display|answer)[^"']*["']/i.test(html),
  },
];

const ALL_CHECKS = [...CHECKS, ...FUNCTIONAL_CHECKS];
const TOTAL_WEIGHT = ALL_CHECKS.reduce((sum, c) => sum + c.weight, 0);

function evaluate(filePath) {
  const absPath = path.resolve(filePath);

  if (!fs.existsSync(absPath)) {
    return { error: `File not found: ${absPath}` };
  }

  const html = fs.readFileSync(absPath, 'utf8');
  const fileSize = Buffer.byteLength(html, 'utf8');

  const checks = ALL_CHECKS.map(check => {
    let passed = false;
    try {
      passed = check.test(html);
    } catch (_) {}
    return {
      id: check.id,
      label: check.label,
      weight: check.weight,
      passed,
    };
  });

  const earnedWeight = checks.filter(c => c.passed).reduce((sum, c) => sum + c.weight, 0);
  const score = Math.round((earnedWeight / TOTAL_WEIGHT) * 100);
  const passed = score >= PASS_THRESHOLD;

  let recommendation;
  if (score >= 85) recommendation = 'approve';
  else if (score >= PASS_THRESHOLD) recommendation = 'approve';
  else if (score >= 50) recommendation = 'rework';
  else recommendation = 'reject';

  return {
    file: filePath,
    fileSize,
    score,
    passed,
    recommendation,
    checks,
  };
}

// Main
const filePath = process.argv[2];
if (!filePath) {
  console.error('Usage: node scripts/evaluate-app.js <path-to-html-file>');
  process.exit(1);
}

const result = evaluate(filePath);
console.log(JSON.stringify(result, null, 2));

if (!result.passed && !result.error) {
  process.exit(2); // non-zero exit for failed evals (useful in CI)
}
