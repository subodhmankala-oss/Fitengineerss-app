import { describe, it, expect, vi, afterEach } from 'vitest';
import { htmlToBlocks, extractArticle, parsePubmedAbstract, getNewsArticle } from './_newsArticle.js';

describe('htmlToBlocks', () => {
  it('keeps headings, paragraphs, list items and quotes in order, as plain text', () => {
    const blocks = htmlToBlocks(`
      <h2>Why it matters</h2>
      <p>First <b>bold</b> para.</p>
      <ul><li><p>Point one</p></li><li>Point two</li></ul>
      <blockquote><p>A quote</p></blockquote>
      <p><script>alert(1)</script>Safe text</p>
      <p>(Visited 3 times, 1 visits today)</p>`);
    expect(blocks).toEqual([
      { type: 'h', text: 'Why it matters' },
      { type: 'p', text: 'First bold para.' },
      { type: 'li', text: 'Point one' },
      { type: 'li', text: 'Point two' },
      { type: 'q', text: 'A quote' },
      { type: 'p', text: expect.stringContaining('Safe text') }
    ]);
  });
});

describe('extractArticle', () => {
  it('pulls the article body out of a full page and drops a handle-only byline', () => {
    const para = (n) => `<p>Paragraph ${n} about protein intake and resistance training in adults, with enough words to count as real content for the reader.</p>`;
    const html = `<!doctype html><html><head><title>Protein study</title><meta name="author" content="bjsm"></head><body>
      <nav><a href="/">Home</a><a href="/x">Menu</a></nav>
      <article><h1>Protein study</h1>${[1, 2, 3, 4, 5, 6].map(para).join('')}</article>
      <footer>Cookie settings</footer></body></html>`;
    const a = extractArticle(html, 'https://x.test/a');
    expect(a.byline).toBeNull();
    expect(a.blocks.length).toBeGreaterThanOrEqual(6);
    expect(a.blocks.some((b) => /Cookie settings|Menu/.test(b.text))).toBe(false);
  });
});

describe('parsePubmedAbstract', () => {
  it('returns every abstract section with readable labels and authors', () => {
    const xml = `<PubmedArticle><ArticleTitle>Whey vs pea.</ArticleTitle><AuthorList>
      <Author><LastName>Smith</LastName><ForeName>Ann</ForeName><Initials>A</Initials></Author>
      <Author><LastName>Lee</LastName><Initials>BK</Initials></Author></AuthorList>
      <Abstract><AbstractText Label="BACKGROUND">Why.</AbstractText><AbstractText Label="CONCLUSIONS">Same gains.</AbstractText></Abstract></PubmedArticle>`;
    expect(parsePubmedAbstract(xml)).toEqual({
      title: 'Whey vs pea',
      byline: 'Smith A, Lee BK',
      blocks: [
        { type: 'h', text: 'Background' }, { type: 'p', text: 'Why.' },
        { type: 'h', text: 'Conclusions' }, { type: 'p', text: 'Same gains.' }
      ]
    });
  });
});

describe('getNewsArticle', () => {
  afterEach(() => vi.unstubAllGlobals());
  const row = { items: [{ link: 'https://x.test/story', title: 'Story', source: 'ScienceDaily' }] };

  it("refuses links that aren't in today's news, without fetching", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    expect(await getNewsArticle({ link: 'https://evil.test/x', readRow: async () => row })).toMatchObject({ ok: false, status: 404 });
    expect(await getNewsArticle({ link: 'http://x.test/story', readRow: async () => row })).toMatchObject({ ok: false, status: 400 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('returns 422 when a page has too little text to show', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, text: async () => '<html><body><p>Hi</p></body></html>' })));
    expect(await getNewsArticle({ link: 'https://x.test/story', readRow: async () => row })).toMatchObject({ ok: false, status: 422 });
  });

  it('returns 502 when the site is down', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503, text: async () => '' })));
    expect(await getNewsArticle({ link: 'https://x.test/story', readRow: async () => row })).toMatchObject({ ok: false, status: 502 });
  });
});
