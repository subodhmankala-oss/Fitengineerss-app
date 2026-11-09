import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const getAdminNews = vi.fn();
vi.mock('../../services/databaseService', () => ({ getAdminNews: (...a) => getAdminNews(...a) }));

import NewsRail from './NewsRail';
import { NewsRoleTab } from './RoleTab';
import { resetAdminNewsCache } from './useAdminNews';

const item = (id, topic, extra = {}) => ({
  id, topic, title: `Story ${id}`, link: `https://x.test/${id}`, summary: `Summary ${id}`,
  publishedAt: new Date(Date.now() - 3 * 3600000).toISOString(), source: topic === 'research' ? 'PubMed' : 'ScienceDaily',
  image: null, takeaway: `Takeaway ${id}`, ...extra
});

describe('NewsRail', () => {
  afterEach(cleanup);
  beforeEach(() => {
    resetAdminNewsCache();
    localStorage.clear();
    getAdminNews.mockReset();
    getAdminNews.mockResolvedValue({
      fetchedAt: new Date().toISOString(),
      items: [
        item('n0', 'muscle', { image: 'https://x.test/img.jpg' }),
        item('n1', 'nutrition'),
        item('n2', 'research', { journal: 'J Sports Sci' }),
        item('n3', 'muscle'),
        item('n4', 'nutrition', { takeaway: null })
      ]
    });
  });

  it('shows 3 stories first, then the rest on "Show more"', async () => {
    render(<NewsRail />);
    expect(await screen.findByText('Story n0')).toBeTruthy();
    expect(screen.queryByText('Story n3')).toBeNull();
    fireEvent.click(screen.getByText('Show 2 more'));
    expect(screen.getByText('Story n4')).toBeTruthy();
    expect(screen.getByText('Takeaway n0')).toBeTruthy();
  });

  it('filters by topic chip', async () => {
    render(<NewsRail />);
    await screen.findByText('Story n0');
    fireEvent.click(screen.getByRole('tab', { name: 'Nutrition' }));
    expect(screen.getByText('Story n1')).toBeTruthy();
    expect(screen.getByText('Story n4')).toBeTruthy();
    expect(screen.queryByText('Story n0')).toBeNull();
  });

  it('opens the reader with summary, takeaway and article link; Escape closes it', async () => {
    render(<NewsRail />);
    fireEvent.click((await screen.findByText('Story n2')).closest('button'));
    const dialog = screen.getByRole('dialog');
    expect(dialog.textContent).toContain('Summary n2');
    expect(dialog.textContent).toContain('J Sports Sci');
    expect(dialog.textContent).toContain('Coach takeaway:');
    expect(screen.getByText('Read full article').closest('a').getAttribute('href')).toBe('https://x.test/n2');
    fireEvent.keyDown(window, { key: 'Escape' });
    // Slides out first (still mounted, marked closing), then unmounts.
    expect(document.querySelector('.news-reader-backdrop.news-closing')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('the X button also slides out, and a double click does not break it', async () => {
    render(<NewsRail />);
    fireEvent.click((await screen.findByText('Story n0')).closest('button'));
    const x = screen.getByLabelText('Close');
    fireEvent.click(x);
    fireEvent.click(x);
    expect(document.querySelector('.news-closing')).toBeTruthy();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('Story n1').closest('button'));
    expect(screen.getByRole('dialog').textContent).toContain('Summary n1');
    expect(document.querySelector('.news-closing')).toBeNull();
  });

  it('uses the image when present and a topic tile otherwise, swapping to the tile if the image fails', async () => {
    const { container } = render(<NewsRail />);
    await screen.findByText('Story n0');
    const img = container.querySelector('img.news-thumb');
    expect(img.getAttribute('src')).toBe('https://x.test/img.jpg');
    expect(container.querySelectorAll('.news-tile').length).toBe(2);
    fireEvent.error(img);
    expect(container.querySelector('img.news-thumb')).toBeNull();
    expect(container.querySelectorAll('.news-tile').length).toBe(3);
  });

  it('refresh asks the server to re-fetch; a failed first load offers Try again', async () => {
    getAdminNews.mockRejectedValueOnce(new Error('boom'));
    render(<NewsRail />);
    fireEvent.click(await screen.findByText('Try again'));
    await screen.findByText('Story n0');
    fireEvent.click(screen.getByLabelText('Refresh news'));
    await waitFor(() => expect(getAdminNews).toHaveBeenLastCalledWith({ force: true }));
  });

  it('page variant (phone News tab) lists every story, with a back-to-News reader', async () => {
    render(<NewsRail variant="page" />);
    expect(await screen.findByText('Story n4')).toBeTruthy();
    expect(screen.queryByText(/Show \d+ more/)).toBeNull();
    expect(document.body.classList.contains('has-news-rail')).toBe(false);
    fireEvent.click(screen.getByText('Story n1').closest('button'));
    expect(screen.getByText('News', { selector: '.news-back-btn' })).toBeTruthy();
  });

  it('page variant shares through the phone share sheet when available', async () => {
    const share = vi.fn(async () => {});
    Object.defineProperty(navigator, 'share', { value: share, configurable: true });
    render(<NewsRail variant="page" />);
    fireEvent.click((await screen.findByText('Story n0')).closest('button'));
    fireEvent.click(screen.getByText('Share'));
    expect(share).toHaveBeenCalledWith({ title: 'Story n0', text: 'Story n0\nTakeaway n0', url: 'https://x.test/n0' });
    delete navigator.share;
  });

  it('News tab bubble counts unread stories and clears once the news is shown', async () => {
    render(<NewsRoleTab active={false} onClick={() => {}} />);
    expect(await screen.findByText('5')).toBeTruthy();
    render(<NewsRail variant="page" />);
    await screen.findByText('Story n0');
    await waitFor(() => expect(screen.queryByText('5')).toBeNull());
  });

  it('one request is shared between the tab bubble and the news page', async () => {
    render(<><NewsRoleTab active={false} onClick={() => {}} /><NewsRail variant="page" /></>);
    await screen.findByText('Story n0');
    expect(getAdminNews).toHaveBeenCalledTimes(1);
  });
});
