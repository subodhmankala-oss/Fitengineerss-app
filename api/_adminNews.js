// Daily muscle-building + nutrition news for the super-admin's dashboard rail
// (NewsRail.jsx). Served from api/data-read.js (resource=admin-news) because
// main is at the Vercel Hobby 12-function cap — this file is underscore-
// prefixed so Vercel never deploys it as its own function.
//
// Flow: the first dashboard open of the day (Asia/Kolkata) finds the cached
// row stale, fetches the feeds below, keeps only muscle/nutrition stories,
// grabs each article's preview image, asks Groq for one coach takeaway per
// story (a single call for the whole batch), and saves the result to
// public.admin_news_cache. Every other open that day reads the saved row.
// If Groq fails the news is still saved and shown — takeaways are retried
// on a later open, at most once an hour.

// Patient-population trials (cancer, dialysis, stroke rehab…) aren't useful
// to a coach of healthy fat-loss / muscle-building clients.
const CLINICAL_EXCLUDE = ' NOT (cancer[tiab] OR tumor[tiab] OR dialysis[tiab] OR haemodialysis[tiab] OR hemodialysis[tiab] OR "kidney disease"[tiab] OR "heart failure"[tiab] OR COPD[tiab] OR stroke[tiab] OR surgery[tiab] OR "intensive care"[tiab] OR rats[tiab] OR rat[ti] OR mice[tiab] OR mouse[tiab] OR rodent*[tiab] OR "in vitro"[tiab])';

// The journals that matter most for muscle building and sports nutrition
// (PubMed journal abbreviations).
const TOP_JOURNALS = '("Sports Med"[ta] OR "Med Sci Sports Exerc"[ta] OR "Br J Sports Med"[ta] OR "J Int Soc Sports Nutr"[ta] OR "Am J Clin Nutr"[ta] OR "J Appl Physiol (1985)"[ta] OR "J Strength Cond Res"[ta] OR "Eur J Sport Sci"[ta] OR "Int J Sport Nutr Exerc Metab"[ta])';
const TRAINING_TERMS = '(hypertrophy[tiab] OR "resistance training"[tiab] OR "resistance exercise"[tiab] OR "strength training"[tiab] OR "muscle mass"[tiab] OR "muscle strength"[tiab] OR "lean mass"[tiab])';
const NUTRITION_TERMS = '("protein intake"[tiab] OR "dietary protein"[tiab] OR "protein supplementation"[tiab] OR creatine[tiab] OR "fat loss"[tiab] OR "weight loss"[tiab] OR "energy restriction"[tiab] OR "caloric restriction"[tiab] OR diet[ti] OR supplement*[ti])';

export const NEWS_FEEDS = [
  { source: 'ScienceDaily', kind: 'rss', url: 'https://www.sciencedaily.com/rss/health_medicine/fitness.xml', filter: true },
  { source: 'ScienceDaily', kind: 'rss', url: 'https://www.sciencedaily.com/rss/health_medicine/nutrition.xml', filter: true },
  { source: 'BJSM blog', kind: 'rss', url: 'https://blogs.bmj.com/bjsm/feed/', filter: true },
  { source: 'Stronger by Science', kind: 'rss', url: 'https://www.strongerbyscience.com/feed/', filter: false },
  // Main source since 2026-11-09: new papers from the top sports-science and
  // sports-nutrition journals (~1–2 on-topic a day). No publication-type
  // filter — PubMed tags RCT/meta-analysis weeks after listing, so that
  // filter only ever surfaced old papers.
  { source: 'PubMed', kind: 'pubmed', term: `${TOP_JOURNALS} AND ${TRAINING_TERMS}${CLINICAL_EXCLUDE}` },
  { source: 'PubMed', kind: 'pubmed', term: `${TOP_JOURNALS} AND ${NUTRITION_TERMS}${CLINICAL_EXCLUDE}` }
];

export const MAX_ITEMS = 8;
// Per-source slots out of MAX_ITEMS: the top-journal papers lead; the
// plain-English sources fill in around them.
const MAX_PER_SOURCE = 3;
const SOURCE_CAPS = { PubMed: 5 };
const capFor = (source) => SOURCE_CAPS[source] ?? MAX_PER_SOURCE;
// 10 days: older stories pushed this week's out (2026-11-09 list ran 3–21
// days old with fresher ScienceDaily/PubMed items skipped). A slow week now
// shows fewer than 8 rather than padding with old posts.
const MAX_AGE_DAYS = 10;
const SUMMARY_CHARS = 320;
const FETCH_TIMEOUT_MS = 8000;
const IMAGE_TIMEOUT_MS = 6000;
const AI_TIMEOUT_MS = 25000;
const AI_RETRY_MS = 60 * 60 * 1000;
const FORCE_MIN_MS = 30 * 60 * 1000;
const GROQ_MODEL = 'openai/gpt-oss-120b';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const UA = 'Mozilla/5.0 (compatible; FitEngineersNews/1.0)';

// ─── Text helpers ───

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'", hellip: '…', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—' };

function decodeEntities(text) {
  return text
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z0-9#]+);/gi, (m, name) => ENTITIES[name.toLowerCase()] ?? m);
}

// Feed text → plain text: unwrap CDATA, decode entities, drop any HTML the
// field carried (decoded first — some feeds escape their markup).
export function cleanText(raw) {
  if (!raw) return '';
  const unwrapped = String(raw).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1');
  return decodeEntities(decodeEntities(unwrapped).replace(/<[^>]*>/g, ' '))
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, 'i'));
  return m ? m[1] : '';
}

export function shorten(text, max) {
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 0 ? space : max).replace(/[\s,.;:]+$/, '')}…`;
}

// ─── Topic rules ───
// ScienceDaily's "fitness" and "nutrition" feeds and the BJSM blog are broad
// (diabetes drugs, concussion, tendon surgery…). Only stories whose HEADLINE
// mentions training/muscle or diet terms are kept — summaries mention
// exercise in passing too often to be a signal. Bare "protein" doesn't count
// (ScienceDaily means the molecule as often as the food). Stronger by Science
// and the PubMed searches are on-topic by construction.

const MUSCLE_RE = /\b(muscle|muscles|muscular|strength|resistance training|weight training|weightlifting|lifting|hypertroph\w*|sarcopenia|exercise|exercising|workout|training|athlet\w*|fitness|squat|physical activity)\b/i;
const NUTRITION_RE = /\b(diet|diets|dietary|nutrition\w*|high-protein|dietary protein|protein (?:intake|supplement\w*|powder|shakes?|swap)|creatine|supplement\w*|calori\w*|meal|meals|fasting|carb\w*|whey|leucine|ultra-processed|food|foods|eating|vitamin\w*|fiber|fibre|dairy|weight loss|fat loss)\b/i;

export function isOnTopic(text) {
  return MUSCLE_RE.test(text) || NUTRITION_RE.test(text);
}

// Animal / cell studies aren't actionable for coaching people (e.g. the
// mouse "Super HGF" story on 2026-11-09). Checked on headline + summary
// because press releases often only say "in mice" further down.
const ANIMAL_RE = /\b(mice|mouse|murine|rats?|rodents?|zebrafish|fruit fl(?:y|ies)|nematodes?|worms|primates|monkeys|piglets?|in vitro|cell cultures?|animal (?:study|studies|model|models|experiments?))\b/i;

export function isAnimalStudy(text) {
  return ANIMAL_RE.test(text);
}

// PubMed → research; otherwise nutrition when the headline is about food and
// not about training, else muscle.
export function topicFor(item) {
  if (item.source === 'PubMed') return 'research';
  const title = item.title || '';
  if (NUTRITION_RE.test(title) && !MUSCLE_RE.test(title)) return 'nutrition';
  if (MUSCLE_RE.test(title)) return 'muscle';
  return NUTRITION_RE.test(item.summary || '') ? 'nutrition' : 'muscle';
}

// ─── Parsers ───

// One RSS 2.0 document → [{ title, link, summary, publishedAt, source }].
// Items with no title, no http(s) link or no parseable date are skipped.
export function parseRssItems(xml, feed) {
  const items = [];
  for (const [, block] of String(xml || '').matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const title = cleanText(tag(block, 'title'));
    const link = cleanText(tag(block, 'link')) || cleanText(tag(block, 'guid'));
    const published = Date.parse(cleanText(tag(block, 'pubDate')));
    if (!title || !/^https?:\/\//i.test(link) || Number.isNaN(published)) continue;
    const summary = shorten(cleanText(tag(block, 'description')), SUMMARY_CHARS);
    if (feed.filter && !isOnTopic(title)) continue;
    if (isAnimalStudy(`${title} ${summary}`)) continue;
    items.push({ title, link, summary, publishedAt: new Date(published).toISOString(), source: feed.source });
  }
  return items;
}

// PubMed efetch XML → items. Date = the day PubMed listed it (entrez), so a
// paper with a far-future issue date still sorts as "new this week". Summary
// prefers the CONCLUSIONS section of a structured abstract.
export function parsePubmedArticles(xml) {
  const items = [];
  for (const [, block] of String(xml || '').matchAll(/<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g)) {
    const pmid = cleanText(tag(block, 'PMID'));
    const title = cleanText(tag(block, 'ArticleTitle')).replace(/\.$/, '');
    const journal = cleanText(tag(tag(block, 'Journal'), 'Title'));
    const entrez = block.match(/<PubMedPubDate PubStatus="entrez">\s*<Year>(\d+)<\/Year>\s*<Month>(\d+)<\/Month>\s*<Day>(\d+)<\/Day>/);
    if (!pmid || !title || !entrez) continue;
    const sections = [...block.matchAll(/<AbstractText([^>]*)>([\s\S]*?)<\/AbstractText>/g)]
      .map(([, attrs, body]) => ({ label: (attrs.match(/Label="([^"]*)"/) || [])[1] || '', text: cleanText(body) }));
    const conclusion = sections.find((s) => /conclusion/i.test(s.label)) || sections[sections.length - 1];
    const [, y, m, d] = entrez;
    items.push({
      title,
      link: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      summary: shorten(conclusion?.text || '', SUMMARY_CHARS),
      publishedAt: new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))).toISOString(),
      source: 'PubMed',
      journal: journal || null
    });
  }
  return items;
}

export function extractOgImage(html, pageUrl) {
  const m = String(html || '').match(/<meta[^>]+(?:property|name)=["']og:image["'][^>]*>/i);
  const content = m && (m[0].match(/content=["']([^"']+)["']/i) || [])[1];
  if (!content) return null;
  try {
    const url = new URL(decodeEntities(content), pageUrl);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// ─── Selection ───

// Newest first, within MAX_AGE_DAYS, at most capFor(source) per source so one
// busy feed can't fill the rail, and the same story (same link or title —
// e.g. one ScienceDaily release in both its feeds) only once.
export function mergeNewsItems(lists, now = Date.now(), max = MAX_ITEMS) {
  const cutoff = now - MAX_AGE_DAYS * 86400000;
  const all = lists.flat()
    .filter((i) => Date.parse(i.publishedAt) >= cutoff)
    .sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const seen = new Set();
  const perSource = {};
  const out = [];
  for (const item of all) {
    const keys = [item.link, item.title.toLowerCase()];
    if (keys.some((k) => seen.has(k))) continue;
    if ((perSource[item.source] || 0) >= capFor(item.source)) continue;
    keys.forEach((k) => seen.add(k));
    perSource[item.source] = (perSource[item.source] || 0) + 1;
    out.push({ ...item, id: `n${out.length}`, topic: topicFor(item), image: null, takeaway: null });
    if (out.length >= max) break;
  }
  return out;
}

// "Today" is the coach's day in India, so the rail turns over at local
// midnight rather than 5:30 am.
export function istDay(ms) {
  return new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);
}

export function isStale(row, now = Date.now()) {
  if (!row || !Array.isArray(row.items) || !row.items.length) return true;
  return istDay(Date.parse(row.fetched_at)) !== istDay(now);
}

// ─── Fetchers ───

async function fetchText(url, timeoutMs = FETCH_TIMEOUT_MS, accept = '*/*') {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': UA, Accept: accept } });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return await resp.text();
  } finally {
    clearTimeout(timer);
  }
}

// NCBI allows 3 requests/second without an API key and answers 429 beyond
// that, so every PubMed request goes through one queue, ≥400 ms apart.
let ncbiQueue = Promise.resolve();
function ncbiFetch(url) {
  const run = ncbiQueue.then(() => fetchText(url));
  ncbiQueue = run.catch(() => {}).then(() => new Promise((r) => setTimeout(r, 400)));
  return run;
}

async function fetchPubmed(feed) {
  const base = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  const search = await ncbiFetch(
    // No sort param = PubMed's default "most recent", i.e. by the date the
    // paper was added. (sort=pub_date ordered by the journal's issue date,
    // which skipped papers added this week to older or future issues.)
    `${base}/esearch.fcgi?db=pubmed&retmode=json&retmax=8&datetype=edat&reldate=${MAX_AGE_DAYS}&term=${encodeURIComponent(feed.term)}`
  );
  const ids = JSON.parse(search)?.esearchresult?.idlist || [];
  if (!ids.length) return [];
  return parsePubmedArticles(await ncbiFetch(`${base}/efetch.fcgi?db=pubmed&retmode=xml&id=${ids.join(',')}`));
}

async function fetchFeed(feed) {
  if (feed.kind === 'pubmed') return fetchPubmed(feed);
  return parseRssItems(await fetchText(feed.url, FETCH_TIMEOUT_MS, 'application/rss+xml, application/xml, text/xml'), feed);
}

// PubMed pages have no useful preview image — the rail shows a topic tile.
async function attachImages(items) {
  await Promise.all(items.map(async (item) => {
    if (item.source === 'PubMed') return;
    try {
      item.image = extractOgImage(await fetchText(item.link, IMAGE_TIMEOUT_MS, 'text/html'), item.link);
    } catch {
      item.image = null;
    }
  }));
}

// ─── AI takeaways ───

export function buildTakeawayPrompt(items) {
  const list = items.map((i, n) => `${n}. [${i.source}${i.journal ? `, ${i.journal}` : ''}] ${i.title}\n   ${i.summary || '(no summary)'}`).join('\n');
  return [
    'You help an online fitness coach in India whose clients mostly want fat loss or muscle building.',
    'For each news item below, write ONE plain-English "coach takeaway": what it practically means for coaching clients.',
    'Rules: at most 22 words; no hype; if it is an animal, cell or very small study, or not really about training/nutrition, say so briefly; never give medical advice.',
    'Reply with JSON only: {"takeaways":[{"i":0,"t":"..."}]} — one entry per item, using the item numbers.',
    '',
    list
  ].join('\n');
}

export function applyTakeaways(items, rawJson) {
  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return 0;
  }
  let applied = 0;
  for (const entry of Array.isArray(parsed?.takeaways) ? parsed.takeaways : []) {
    const item = items[Number(entry?.i)];
    const text = typeof entry?.t === 'string' ? entry.t.trim() : '';
    if (item && text) {
      item.takeaway = shorten(text, 200);
      applied += 1;
    }
  }
  return applied;
}

async function addTakeaways(items, apiKey) {
  const pending = items.filter((i) => !i.takeaway);
  if (!apiKey || !pending.length) return;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    const resp = await fetch(GROQ_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'user', content: buildTakeawayPrompt(pending) }],
        response_format: { type: 'json_object' },
        temperature: 0.3
      })
    });
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      console.warn('admin-news: Groq error', resp.status, data?.error?.message);
      return;
    }
    applyTakeaways(pending, data?.choices?.[0]?.message?.content || '');
  } catch (e) {
    console.warn('admin-news: Groq call failed', e?.message || e);
  } finally {
    clearTimeout(timer);
  }
}

// ─── Handler ───

// deps: { readRow(), saveRow(row), groqKey } — injected by data-read.js so
// the auth + service-role plumbing stays in one place.
export async function getAdminNews({ readRow, saveRow, groqKey, force = false, now = Date.now() }) {
  let row = await readRow().catch((e) => {
    console.error('admin-news: cache read failed', e?.message || e);
    return null;
  });

  const age = row ? now - Date.parse(row.fetched_at) : Infinity;
  if (isStale(row, now) || (force && age > FORCE_MIN_MS)) {
    const results = await Promise.allSettled(NEWS_FEEDS.map(fetchFeed));
    results.forEach((r, i) => {
      if (r.status === 'rejected') console.error('admin-news feed failed:', NEWS_FEEDS[i].url || 'pubmed', r.reason?.message || r.reason);
    });
    const items = mergeNewsItems(results.filter((r) => r.status === 'fulfilled').map((r) => r.value), now);
    if (items.length) {
      await Promise.all([attachImages(items), addTakeaways(items, groqKey)]);
      row = { id: 'latest', items, fetched_at: new Date(now).toISOString(), ai_attempted_at: new Date(now).toISOString() };
      await saveRow(row).catch((e) => console.error('admin-news: cache save failed', e?.message || e));
    }
  } else if (row.items.some((i) => !i.takeaway) && (!row.ai_attempted_at || now - Date.parse(row.ai_attempted_at) > AI_RETRY_MS)) {
    await addTakeaways(row.items, groqKey);
    row = { ...row, ai_attempted_at: new Date(now).toISOString() };
    await saveRow(row).catch((e) => console.error('admin-news: cache save failed', e?.message || e));
  }

  if (!row || !Array.isArray(row.items) || !row.items.length) return null;
  return { items: row.items, fetchedAt: row.fetched_at };
}
