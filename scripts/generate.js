#!/usr/bin/env node
/**
 * JesusSaid Static Site Generator
 * Reads the Red Letter Master Google Sheet → generates:
 *   - public/verses.json
 *   - public/verse/[slug].html (one per teaching)
 *   - public/schedule.json (365-day rotation)
 */

const fs = require('fs');
const path = require('path');

const SHEET_ID = process.env.SHEET_ID || '11fKfDhi8jed11m36GfZWjATQl_UxdylXbL1VJQnz8wo';
const SHEET_TAB = 'compendium';
const OUT_DIR = path.join(__dirname, '..', 'public');
const VERSE_DIR = path.join(OUT_DIR, 'verse');

// Source badge colors
const SOURCE_COLORS = {
  Matthew:   { bg: '#1a56a0', label: 'Matthew' },
  Mark:      { bg: '#1a7a4a', label: 'Mark' },
  Luke:      { bg: '#7a3a1a', label: 'Luke' },
  John:      { bg: '#4a1a7a', label: 'John' },
  Thomas:    { bg: '#b45309', label: 'Gospel of Thomas' },
  Ebionites: { bg: '#6b21a8', label: 'Gospel of the Ebionites' },
  Mary:      { bg: '#be185d', label: 'Gospel of Mary' },
  Peter:     { bg: '#334155', label: 'Gospel of Peter' },
};

const DAY_COLORS = [
  { bg: '#000000', text: '#ffffff' },
  { bg: '#0f172a', text: '#ffffff' },
  { bg: '#1a1a2e', text: '#ffffff' },
  { bg: '#0d1b2a', text: '#ffffff' },
  { bg: '#1a0a0a', text: '#ffffff' },
  { bg: '#0a1a0a', text: '#ffffff' },
  { bg: '#1a1500', text: '#ffffff' },
];

async function fetchSheet() {
  // Local CSV fallback for build environments without Google access
  const localCSV = path.join(__dirname, 'compendium.csv');
  if (process.env.USE_LOCAL_CSV || !process.env.SHEET_ID) {
    if (fs.existsSync(localCSV)) {
      console.log('Using local CSV fallback');
      return fs.readFileSync(localCSV, 'utf-8');
    }
  }
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${SHEET_TAB}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);
  return res.text();
}

function parseCSV(text) {
  const lines = text.split('\n');
  const headers = parseCSVLine(lines[0]).map(h => h.trim());
  return lines.slice(1)
    .filter(l => l.trim())
    .map(line => {
      const vals = parseCSVLine(line);
      const row = {};
      headers.forEach((h, i) => row[h] = (vals[i] || '').trim());
      return row;
    });
}

function parseCSVLine(line) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (c === ',' && !inQuotes) {
      result.push(cur); cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

function slugify(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

function groupRows(rows) {
  const groups = {};
  for (const row of rows) {
    const gid = row.group_id;
    if (!gid) continue;
    // Auto-generate slug if not present in data
    if (!row.slug && row.title) row.slug = slugify(row.title);
    if (!groups[gid]) groups[gid] = [];
    groups[gid].push(row);
  }
  return groups;
}

function renderContext(text) {
  if (!text) return '';
  // Convert *word* to <em>word</em>, preserve paragraph breaks
  return text
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, ' ');
}

function sourceBadge(source) {
  const s = SOURCE_COLORS[source] || { bg: '#334155', label: source };
  return `<span class="source-badge" style="background:${s.bg}">${s.label}</span>`;
}

function buildVerseHTML(group, colorIndex) {
  const primary = group.find(r => r.primary === 'Y');
  if (!primary) return null;
  const parallels = group.filter(r => r.primary !== 'Y');
  const color = DAY_COLORS[colorIndex % DAY_COLORS.length];
  const slug = primary.slug;
  const shareText = primary.pullquote || primary.jesus_words.substring(0, 80);
  const shareUrl = `https://jesussaid.app/verse/${slug}`;
  const shareEncoded = encodeURIComponent(`"${shareText}" — ${primary.reference}\n\n${shareUrl}`);

  const parallelsHTML = parallels.length > 0 ? `
    <section class="parallels">
      <h2 class="parallels-heading">How They All Heard It</h2>
      ${parallels.map(p => `
        <div class="parallel-card">
          ${sourceBadge(p.source)}
          <p class="parallel-ref">${p.reference}</p>
          <blockquote class="parallel-words">${p.jesus_words}</blockquote>
        </div>
      `).join('')}
    </section>
  ` : '';

  const contextHTML = primary.context ? `
    <section class="context-section">
      <h2 class="section-heading">Context</h2>
      <div class="context-body"><p>${renderContext(primary.context)}</p></div>
    </section>
  ` : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${primary.title} — JesusSaid</title>
  <meta name="description" content="${shareText}">
  <meta property="og:title" content="${primary.title} — JesusSaid">
  <meta property="og:description" content="${shareText}">
  <meta property="og:url" content="${shareUrl}">
  <meta property="og:type" content="article">
  <meta name="twitter:card" content="summary">
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" href="/icons/icon-192.png">
  <meta name="theme-color" content="${color.bg}">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: ${color.bg};
      --fg: ${color.text};
      --card-bg: rgba(255,255,255,0.06);
      --radius: 12px;
      --font: 'Helvetica Neue', Helvetica, Arial, sans-serif;
    }
    body {
      font-family: var(--font);
      background: var(--bg);
      color: var(--fg);
      min-height: 100vh;
      padding: 0 0 60px 0;
    }
    .top-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 16px 0;
    }
    .logo { font-size: 14px; font-weight: 700; opacity: 0.7; letter-spacing: 0.05em; text-decoration: none; color: inherit; }
    .hero {
      padding: 32px 16px 24px;
    }
    .source-line {
      font-size: 13px;
      opacity: 0.65;
      margin-bottom: 12px;
      font-weight: 500;
    }
    .teaching-title {
      font-size: 22px;
      font-weight: 900;
      line-height: 1.2;
      margin-bottom: 20px;
    }
    .jesus-words {
      font-size: 20px;
      line-height: 1.6;
      font-weight: 400;
      font-style: italic;
      border-left: 3px solid var(--fg);
      padding-left: 16px;
      opacity: 0.95;
    }
    .core-message {
      font-size: 15px;
      opacity: 0.65;
      line-height: 1.5;
      margin-bottom: 20px;
      font-style: normal;
      letter-spacing: 0.01em;
    }
    .action-bar {
      display: flex;
      gap: 10px;
      padding: 24px 16px 0;
    }
    .btn {
      flex: 1;
      padding: 14px 10px;
      border-radius: 10px;
      font-size: 15px;
      font-weight: 700;
      border: none;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      display: block;
    }
    .btn-primary {
      background: var(--fg);
      color: var(--bg);
    }
    .btn-secondary {
      background: transparent;
      color: var(--fg);
      border: 2px solid var(--fg);
    }
    .divider {
      height: 1px;
      background: var(--fg);
      opacity: 0.15;
      margin: 28px 16px;
    }
    .parallels { padding: 0 16px; }
    .parallels-heading {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.6;
      margin-bottom: 16px;
    }
    .parallel-card {
      background: var(--card-bg);
      border-radius: var(--radius);
      padding: 16px;
      margin-bottom: 12px;
    }
    .source-badge {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #fff;
      padding: 3px 8px;
      border-radius: 4px;
      margin-bottom: 8px;
    }
    .parallel-ref {
      font-size: 12px;
      opacity: 0.6;
      margin-bottom: 8px;
    }
    .parallel-words {
      font-size: 15px;
      line-height: 1.6;
      font-style: italic;
    }
    .section-heading {
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.6;
      margin-bottom: 12px;
    }
    .context-section { padding: 0 16px; }
    .context-body {
      font-size: 15px;
      line-height: 1.7;
      opacity: 0.85;
    }
    .context-body p + p { margin-top: 1em; }
    .next-bar {
      padding: 0 16px 24px;
    }
    .next-btn {
      display: block;
      text-align: center;
    }
    @media (min-width: 600px) {
      .hero, .action-bar, .parallels, .context-section, .core-message, .next-bar { max-width: 600px; margin-left: auto; margin-right: auto; padding-left: 24px; padding-right: 24px; }
    }
  </style>
</head>
<body>
  <div class="top-bar">
    <a href="/" class="logo">JESUSSAID</a>
  </div>

  <div class="hero">
    <p class="source-line">${primary.reference}</p>
    <h1 class="teaching-title">${primary.title}</h1>
    ${primary.core_message ? `<p class="core-message">${primary.core_message}</p>` : ''}
    <blockquote class="jesus-words">${primary.jesus_words}</blockquote>
  </div>

  <div class="action-bar">
    <button class="btn btn-primary" onclick="shareVerse()">Share This</button>
    <a href="/get" class="btn btn-secondary">Get Daily Verse</a>
  </div>

  ${primary.context ? '<div class="divider"></div>' + contextHTML : ''}
  ${parallels.length > 0 ? '<div class="divider"></div>' + parallelsHTML : ''}
  <div class="divider"></div>
  <div class="next-bar">
    <a id="next-link" href="#" class="btn btn-secondary next-btn">Next Verse →</a>
  </div>

  <script>
    function shareVerse() {
      const text = ${JSON.stringify(shareText)};
      const url = window.location.href;
      if (navigator.share) {
        navigator.share({ text: '"' + text + '"', url });
      } else {
        navigator.clipboard.writeText('"' + text + '" ' + url)
          .then(() => alert('Copied to clipboard'));
      }
    }
    // Next verse button — random pick from verses.json
    fetch('/verses.json')
      .then(r => r.json())
      .then(verses => {
        const slugs = verses.filter(v => v.include && v.slug && v.slug !== ${JSON.stringify(slug)}).map(v => v.slug);
        if (slugs.length) {
          const next = slugs[Math.floor(Math.random() * slugs.length)];
          document.getElementById('next-link').href = '/verse/' + next;
        }
      })
      .catch(() => {});
    // Register service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js');
    }
    // Track source param
    const src = new URLSearchParams(location.search).get('src');
    if (src) sessionStorage.setItem('jesussaid_src', src);
  </script>
</body>
</html>`;
}

function buildSchedule(groups) {
  // Get all active group_ids (include=1, primary=Y)
  const active = Object.entries(groups)
    .filter(([, rows]) => {
      const primary = rows.find(r => r.primary === 'Y');
      return primary && (primary.include === '1' || primary.include === undefined || primary.include === '');
    })
    .map(([gid, rows]) => ({
      gid,
      slug: rows.find(r => r.primary === 'Y').slug,
    }));

  // Shuffle deterministically (seeded) — same order every build
  // Simple Fisher-Yates with fixed seed
  const arr = [...active];
  let seed = 42;
  function rand() { seed = (seed * 1664525 + 1013904223) & 0xffffffff; return (seed >>> 0) / 0xffffffff; }
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }

  // Map 365 days starting from Jan 1 2027
  const start = new Date('2027-01-01');
  const schedule = [];
  for (let i = 0; i < 365; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
    schedule.push({ date: dateStr, ...arr[i % arr.length] });
  }
  return schedule;
}

async function main() {
  console.log('Fetching sheet...');
  const csv = await fetchSheet();
  const rows = parseCSV(csv);
  console.log(`Parsed ${rows.length} rows`);

  const groups = groupRows(rows);
  const groupIds = Object.keys(groups);
  console.log(`Found ${groupIds.length} groups`);

  // Build verses.json
  const verses = groupIds.map((gid, i) => {
    const group = groups[gid];
    const primary = group.find(r => r.primary === 'Y');
    if (!primary) return null;
    return {
      group_id: parseInt(gid),
      slug: primary.slug,
      include: primary.include === '1',
      title: primary.title,
      pullquote: primary.pullquote,
      core_message: primary.core_message,
      primary: {
        source: primary.source,
        reference: primary.reference,
        jesus_words: primary.jesus_words,
      },
      parallels: group
        .filter(r => r.primary !== 'Y')
        .map(r => ({
          source: r.source,
          reference: r.reference,
          jesus_words: r.jesus_words,
        })),
      context: primary.context,
      parallels_refs: primary.parallels_refs,
    };
  }).filter(Boolean);

  fs.writeFileSync(
    path.join(OUT_DIR, 'verses.json'),
    JSON.stringify(verses, null, 2)
  );
  console.log(`Wrote verses.json (${verses.length} teachings)`);

  // Build static verse pages
  if (!fs.existsSync(VERSE_DIR)) fs.mkdirSync(VERSE_DIR, { recursive: true });

  let built = 0;
  groupIds.forEach((gid, i) => {
    const group = groups[gid];
    const primary = group.find(r => r.primary === 'Y');
    // include column: '1' in Sheet, or absent in CSV (treat absent as included)
    if (!primary) return;
    if (primary.include !== undefined && primary.include !== '1') return;
    const html = buildVerseHTML(group, i);
    if (!html) return;
    fs.writeFileSync(path.join(VERSE_DIR, `${primary.slug}.html`), html);
    built++;
  });
  console.log(`Built ${built} verse pages`);

  // Build schedule
  const schedule = buildSchedule(groups);
  fs.writeFileSync(
    path.join(OUT_DIR, 'schedule.json'),
    JSON.stringify(schedule, null, 2)
  );
  console.log(`Built schedule.json (${schedule.length} days)`);

  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
