// Full-article reader for the founder's news (NewsRail "Read full article").
// Served from api/data-read.js (resource=admin-news-article) — main is at the
// Vercel 12-function cap; underscore-prefixed so this is never its own
// function.
//
// Why not just open the site in the app: tested 2026-11-09 — embedded,
// PubMed shows "cookies must be enabled" and the BJSM blog a full-screen
// cookie wall. So the server fetches the page on demand and returns plain
// text blocks (Mozilla Readability, the Firefox Reader View engine); the app
// renders them in its own styles. Nothing is stored.
//
// Only links in today's cached news (admin_news_cache) are fetched, so this
// can't be used as an open proxy.

import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';

const FETCH_TIMEOUT_MS = 10000;
const MAX_HTML_BYTES = 3 * 1024 * 1024;
const MAX_BLOCKS = 150;
const MIN_BLOCKS = 3;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

// Site chrome Readability sometimes keeps at the very end.
const JUNK_RE = /^\(Visited \d+ times?,|^Share this:?$|^Related posts?:?$|^Like this:?$/i;

// Readability's cleaned article HTML → [{ type: 'h'|'p'|'li'|'q', text }].
// Plain text only, so the app never injects third-party HTML.
export function htmlToBlocks(html) {
  const { document } = parseHTML(`<!doctype html><html><body>${html || ''}</body></html>`);
  const blocks = [];
  for (const el of document.querySelectorAll('h1, h2, h3, h4, p, li, blockquote')) {
    // Skip blocks nested inside another block we already take (p inside li…).
    if (el.parentElement?.closest('p, li, blockquote')) continue;
    const text = clean(el.textContent);
    if (!text || JUNK_RE.test(text)) continue;
    const tag = el.tagName.toLowerCase();
    const type = /^h\d$/.test(tag) ? 'h' : tag === 'li' ? 'li' : tag === 'blockquote' ? 'q' : 'p';
    const prev = blocks[blocks.length - 1];
    if (prev && prev.text === text) continue;
    blocks.push({ type, text });
    if (blocks.length >= MAX_BLOCKS) break;
  }
  return blocks;
}

export function extractArticle(html, url) {
  const { document } = parseHTML(html);
  try {
    // Lets Readability resolve relative links/images against the page.
    const base = document.createElement('base');
    base.setAttribute('href', url);
    document.head?.appendChild(base);
  } catch { /* fine without */ }
  const parsed = new Readability(document).parse();
  if (!parsed) return null;
  const blocks = htmlToBlocks(parsed.content);
  // Readability repeats the headline as the first heading on some sites.
  if (blocks[0]?.type === 'h' && clean(blocks[0].text) === clean(parsed.title)) blocks.shift();
  return {
    title: clean(parsed.title) || null,
    // A one-word byline is a site handle ("bjsm"), not an author.
    byline: /\s/.test(clean(parsed.byline)) ? clean(parsed.byline) : null,
    blocks
  };
}

// PubMed: the whole structured abstract (BACKGROUND / METHODS / RESULTS /
// CONCLUSIONS), straight from NCBI — public data, no page scraping.
export function parsePubmedAbstract(xml) {
  const block = String(xml || '');
  const title = clean(block.match(/<ArticleTitle>([\s\S]*?)<\/ArticleTitle>/)?.[1]?.replace(/<[^>]*>/g, ''));
  const authors = [...block.matchAll(/<Author\b[^>]*>([\s\S]*?)<\/Author>/g)]
    .map(([, a]) => {
      const last = clean(a.match(/<LastName>([^<]*)<\/LastName>/)?.[1]);
      const init = clean(a.match(/<Initials>([^<]*)<\/Initials>/)?.[1]);
      return last ? `${last}${init ? ` ${init}` : ''}` : '';
    })
    .filter(Boolean);
  const blocks = [];
  for (const [, attrs, body] of block.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)) {
    const label = (attrs.match(/Label="([^"]*)"/) || [])[1];
    const text = clean(body.replace(/<[^>]*>/g, ' '));
    if (!text) continue;
    if (label) blocks.push({ type: 'h', text: label.charAt(0) + label.slice(1).toLowerCase() });
    blocks.push({ type: 'p', text });
  }
  return {
    title: title.replace(/\.$/, '') || null,
    byline: authors.length ? (authors.length > 3 ? `${authors.slice(0, 3).join(', ')} et al.` : authors.join(', ')) : null,
    blocks
  };
}

async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8' } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    if (text.length > MAX_HTML_BYTES) throw new Error('page too large');
    return text;
  } finally {
    clearTimeout(timer);
  }
}

// deps: { readRow } (today's admin_news_cache row). Resolves to
// { ok: true, article } | { ok: false, status, error }.
export async function getNewsArticle({ link, readRow }) {
  if (typeof link !== 'string' || !/^https:\/\//.test(link)) {
    return { ok: false, status: 400, error: 'Missing article link.' };
  }
  const row = await readRow();
  const item = (row?.items || []).find((i) => i.link === link);
  if (!item) return { ok: false, status: 404, error: "That story isn't in today's news." };

  try {
    let article;
    const pmid = link.match(/^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?$/)?.[1];
    if (pmid) {
      article = parsePubmedAbstract(await fetchText(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&retmode=xml&id=${pmid}`));
    } else {
      article = extractArticle(await fetchText(link), link);
    }
    if (!article || article.blocks.length < MIN_BLOCKS) {
      return { ok: false, status: 422, error: "This article can't be shown in the app." };
    }
    return {
      ok: true,
      article: {
        link,
        title: article.title || item.title,
        byline: article.byline,
        source: item.source,
        blocks: article.blocks
      }
    };
  } catch (e) {
    console.error('admin-news-article fetch failed:', link, e?.message || e);
    return { ok: false, status: 502, error: "Couldn't load the article right now." };
  }
}
