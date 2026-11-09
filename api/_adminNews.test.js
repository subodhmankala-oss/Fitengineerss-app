import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  parseRssItems, parsePubmedArticles, extractOgImage, mergeNewsItems, topicFor,
  isOnTopic, isAnimalStudy, isStale, istDay, applyTakeaways, buildTakeawayPrompt, getAdminNews
} from './_adminNews.js';

const rss = (items) => `<rss><channel><title>Feed</title>${items.map(([t, l, d, desc = '']) =>
  `<item><title><![CDATA[${t}]]></title><link>${l}</link><pubDate>${d}</pubDate><description>${desc}</description></item>`).join('')}</channel></rss>`;

describe('parseRssItems', () => {
  it('keeps on-topic headlines from filtered feeds and drops the rest', () => {
    const xml = rss([
      ['Lifting weights builds muscle in older adults', 'https://x.test/a', 'Mon, 02 Nov 2026 10:00:00 GMT'],
      ['A little-known protein could be a major culprit in type 2 diabetes', 'https://x.test/b', 'Mon, 02 Nov 2026 10:00:00 GMT', 'exercise mentioned'],
      ['Full-fat dairy &amp; your heart', 'https://x.test/c', 'Mon, 02 Nov 2026 10:00:00 GMT']
    ]);
    const items = parseRssItems(xml, { source: 'ScienceDaily', filter: true });
    expect(items.map((i) => i.link)).toEqual(['https://x.test/a', 'https://x.test/c']);
    expect(items[1].title).toBe('Full-fat dairy & your heart');
  });

  it('skips items without a link or date, keeps everything from unfiltered feeds', () => {
    const xml = rss([
      ['Anything goes', 'https://x.test/a', 'Mon, 02 Nov 2026 10:00:00 GMT'],
      ['No link', 'not-a-url', 'Mon, 02 Nov 2026 10:00:00 GMT'],
      ['No date', 'https://x.test/c', 'garbage']
    ]);
    expect(parseRssItems(xml, { source: 'SBS', filter: false }).map((i) => i.title)).toEqual(['Anything goes']);
  });
});

describe('isOnTopic', () => {
  it('counts diet protein but not the bare molecule', () => {
    expect(isOnTopic('A simple protein swap for healthy aging')).toBe(true);
    expect(isOnTopic('High-protein diets and kidneys')).toBe(true);
    expect(isOnTopic('A protein linked to inflammation')).toBe(false);
  });
});

describe('parsePubmedArticles', () => {
  const xml = `<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID Version="1">123</PMID><Article><Journal><Title>J Int Soc Sports Nutr</Title></Journal>
    <ArticleTitle>Plant protein vs whey: a meta-analysis.</ArticleTitle><Abstract>
    <AbstractText Label="BACKGROUND">Some background.</AbstractText>
    <AbstractText Label="CONCLUSIONS">Both worked about the same.</AbstractText></Abstract></Article></MedlineCitation>
    <PubmedData><History><PubMedPubDate PubStatus="entrez"><Year>2026</Year><Month>10</Month><Day>29</Day></PubMedPubDate></History></PubmedData></PubmedArticle></PubmedArticleSet>`;

  it('uses the conclusion, entrez date and a pubmed link', () => {
    const [item] = parsePubmedArticles(xml);
    expect(item).toMatchObject({
      title: 'Plant protein vs whey: a meta-analysis',
      link: 'https://pubmed.ncbi.nlm.nih.gov/123/',
      summary: 'Both worked about the same.',
      publishedAt: '2026-10-29T00:00:00.000Z',
      journal: 'J Int Soc Sports Nutr',
      source: 'PubMed'
    });
  });
});

describe('extractOgImage', () => {
  it('reads og:image in either attribute order and only allows https', () => {
    expect(extractOgImage('<meta property="og:image" content="https://a.test/i.jpg">', 'https://a.test/p')).toBe('https://a.test/i.jpg');
    expect(extractOgImage('<meta content="/i.webp" property="og:image" />', 'https://a.test/p')).toBe('https://a.test/i.webp');
    expect(extractOgImage('<meta property="og:image" content="/i.webp" />', 'https://a.test/p')).toBe('https://a.test/i.webp');
    expect(extractOgImage('<meta property="og:image" content="http://a.test/i.jpg">', 'https://a.test/p')).toBe(null);
    expect(extractOgImage('<html></html>', 'https://a.test/p')).toBe(null);
  });
});

describe('mergeNewsItems', () => {
  const now = Date.parse('2026-11-09T06:00:00Z');
  const mk = (source, title, day) => ({ source, title, link: `https://x.test/${source}/${title}`, summary: '', publishedAt: `2026-11-${day}T00:00:00.000Z` });

  it('sorts newest first, caps 3 per source, dedupes titles, drops >21-day-old items, tags topics', () => {
    const lists = [
      [mk('SD', 'Muscle a', '08'), mk('SD', 'Muscle b', '07'), mk('SD', 'Muscle c', '06'), mk('SD', 'Muscle d', '05')],
      [mk('PubMed', 'Study', '04'), { ...mk('SD2', 'muscle a', '03') }],
      [{ ...mk('Old', 'Ancient muscle', '01'), publishedAt: '2026-10-01T00:00:00.000Z' }]
    ];
    const out = mergeNewsItems(lists, now);
    expect(out.map((i) => i.title)).toEqual(['Muscle a', 'Muscle b', 'Muscle c', 'Study']);
    expect(out.map((i) => i.id)).toEqual(['n0', 'n1', 'n2', 'n3']);
    expect(out[3].topic).toBe('research');
    expect(out[0]).toMatchObject({ topic: 'muscle', image: null, takeaway: null });
  });
});

describe('topicFor', () => {
  it('nutrition for food headlines, muscle for training ones', () => {
    expect(topicFor({ source: 'SD', title: 'Full-fat dairy is fine' })).toBe('nutrition');
    expect(topicFor({ source: 'SD', title: 'Creatine and strength training in women' })).toBe('muscle');
    expect(topicFor({ source: 'PubMed', title: 'Diet study' })).toBe('research');
  });
});

describe('isStale / istDay', () => {
  it('turns over at midnight India time', () => {
    const row = { items: [{}], fetched_at: '2026-11-08T18:00:00Z' }; // 23:30 IST on the 8th
    expect(istDay(Date.parse('2026-11-08T18:00:00Z'))).toBe('2026-11-08');
    expect(isStale(row, Date.parse('2026-11-08T18:20:00Z'))).toBe(false); // 23:50 IST
    expect(isStale(row, Date.parse('2026-11-08T18:31:00Z'))).toBe(true); // 00:01 IST on the 9th
    expect(isStale(null)).toBe(true);
    expect(isStale({ items: [], fetched_at: new Date().toISOString() })).toBe(true);
  });
});

describe('takeaways', () => {
  it('applies valid entries by index and ignores junk', () => {
    const items = [{ title: 'a' }, { title: 'b' }];
    expect(applyTakeaways(items, JSON.stringify({ takeaways: [{ i: 1, t: ' Use it. ' }, { i: 7, t: 'x' }, { i: 0, t: '' }] }))).toBe(1);
    expect(items[1].takeaway).toBe('Use it.');
    expect(items[0].takeaway).toBeUndefined();
    expect(applyTakeaways(items, 'not json')).toBe(0);
  });

  it('numbers items in the prompt', () => {
    const prompt = buildTakeawayPrompt([{ source: 'PubMed', journal: 'J', title: 'T', summary: 'S' }]);
    expect(prompt).toContain('0. [PubMed, J] T');
    expect(prompt).toContain('"takeaways"');
  });
});

describe('getAdminNews cache', () => {
  afterEach(() => vi.unstubAllGlobals());
  const now = Date.parse('2026-11-09T06:00:00Z');
  const fresh = { id: 'latest', items: [{ id: 'n0', title: 'x', takeaway: 'ok' }], fetched_at: '2026-11-09T01:00:00Z', ai_attempted_at: '2026-11-09T01:00:00Z' };

  it('serves a same-day row without touching the network', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const saveRow = vi.fn();
    const out = await getAdminNews({ readRow: async () => fresh, saveRow, groqKey: 'k', now });
    expect(out).toEqual({ items: fresh.items, fetchedAt: fresh.fetched_at });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(saveRow).not.toHaveBeenCalled();
  });

  it('ignores force within 30 minutes of the last fetch', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    const row = { ...fresh, fetched_at: new Date(now - 10 * 60000).toISOString() };
    await getAdminNews({ readRow: async () => row, saveRow: vi.fn(), groqKey: 'k', now, force: true });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('keeps yesterday\'s news when every feed fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, text: async () => '' })));
    const old = { ...fresh, fetched_at: '2026-11-07T01:00:00Z' };
    const saveRow = vi.fn();
    const out = await getAdminNews({ readRow: async () => old, saveRow, groqKey: 'k', now });
    expect(out.items).toEqual(old.items);
    expect(saveRow).not.toHaveBeenCalled();
  });

  it('retries missing takeaways at most hourly', async () => {
    const groq = vi.fn(async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: '{"takeaways":[{"i":0,"t":"New line"}]}' } }] }) }));
    vi.stubGlobal('fetch', groq);
    const row = { ...fresh, items: [{ id: 'n0', title: 'x', takeaway: null }], ai_attempted_at: new Date(now - 2 * 3600000).toISOString() };
    const saveRow = vi.fn(async () => {});
    const out = await getAdminNews({ readRow: async () => row, saveRow, groqKey: 'k', now });
    expect(groq).toHaveBeenCalledTimes(1);
    expect(out.items[0].takeaway).toBe('New line');
    expect(saveRow).toHaveBeenCalledTimes(1);

    groq.mockClear();
    const recent = { ...row, items: [{ id: 'n0', title: 'x', takeaway: null }], ai_attempted_at: new Date(now - 10 * 60000).toISOString() };
    await getAdminNews({ readRow: async () => recent, saveRow, groqKey: 'k', now });
    expect(groq).not.toHaveBeenCalled();
  });
});

describe('source quality rules (2026-11-09)', () => {
  const now = Date.parse('2026-11-09T06:00:00Z');
  const mk = (source, n, daysOld) => ({
    source, title: `${source} story ${n}`, link: `https://x.test/${source}/${n}`, summary: '',
    publishedAt: new Date(now - daysOld * 86400000).toISOString()
  });

  it('drops animal and cell studies from news feeds', () => {
    expect(isAnimalStudy('Aging muscles repair themselves — early mouse experiments')).toBe(true);
    expect(isAnimalStudy('Creatine helps rats recover')).toBe(true);
    expect(isAnimalStudy('In vitro work on muscle cells')).toBe(true);
    expect(isAnimalStudy('Full-fat dairy and heart health in adults')).toBe(false);
    const xml = `<rss><channel>
      <item><title>Muscle repair discovery</title><link>https://x.test/a</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><description>Supported by early mouse experiments.</description></item>
      <item><title>Muscle strength in older adults</title><link>https://x.test/b</link><pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate><description>A trial in 120 people.</description></item>
    </channel></rss>`;
    expect(parseRssItems(xml, { source: 'ScienceDaily', filter: true }).map((i) => i.link)).toEqual(['https://x.test/b']);
  });

  it('gives top-journal papers 5 slots and other sources 3', () => {
    const pubmed = [1, 2, 3, 4, 5, 6].map((n) => mk('PubMed', n, 1));
    const sd = [1, 2, 3, 4].map((n) => mk('ScienceDaily', n, 2));
    const out = mergeNewsItems([pubmed, sd], now);
    expect(out.filter((i) => i.source === 'PubMed')).toHaveLength(5);
    expect(out.filter((i) => i.source === 'ScienceDaily')).toHaveLength(3);
  });

  it('keeps only the last 10 days, so a slow week shows fewer stories rather than old ones', () => {
    const out = mergeNewsItems([[mk('BJSM blog', 1, 9), mk('BJSM blog', 2, 11), mk('BJSM blog', 3, 21)]], now);
    expect(out.map((i) => i.title)).toEqual(['BJSM blog story 1']);
  });
});
