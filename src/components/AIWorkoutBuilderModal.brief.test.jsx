// The AI draft dialog's programming-brief inputs: required level, injury
// tick boxes, the unmatched-injury message, and what goes to the server.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import AIWorkoutBuilderModal from './AIWorkoutBuilderModal';
import AiDraftBriefSummary from './AiDraftBriefSummary';
import databaseService from '../services/databaseService';

vi.mock('../services/databaseService', () => ({
  default: {
    getClientTrainingProfile: vi.fn(),
    getLibraryLevelPref: vi.fn(),
    saveClientTrainingProfile: vi.fn(() => Promise.resolve({ success: true }))
  }
}));

const CLIENT = { id: 'u1', name: 'Zelda Secretname', age: '34', sex: 'female', height: '170', weight: 65, goal: 'Fat Loss' };
const CATALOG = [{ name: 'Leg Press', muscle: 'Quadriceps', category: 'Legs' }];

const open = (onGenerated = vi.fn()) => render(
  <AIWorkoutBuilderModal client={CLIENT} coachId={null} catalog={CATALOG} onClose={() => {}} onGenerated={onGenerated} />
);

let requests;
beforeEach(() => {
  requests = [];
  vi.stubGlobal('fetch', vi.fn(async (_url, init) => {
    requests.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ draft: { programSummary: 'S', days: [] }, brief: { level: 'beginner' }, warnings: [] }), { status: 200 });
  }));
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('AI draft dialog — programming brief inputs', () => {
  it('requires a level when none is saved', async () => {
    databaseService.getClientTrainingProfile.mockResolvedValue(null);
    databaseService.getLibraryLevelPref.mockResolvedValue(null);
    open();
    await waitFor(() => expect(databaseService.getLibraryLevelPref).toHaveBeenCalled());
    expect(screen.getByRole('option', { name: 'Training level (required)' })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Create a 5-day/), { target: { value: 'Full body' } });
    fireEvent.click(screen.getByText(/Generate Draft/));
    expect(await screen.findByText(/Pick a training level/)).toBeTruthy();
    expect(requests).toHaveLength(0);
  });

  it('does not require a level when the library level is saved, and sends it', async () => {
    databaseService.getClientTrainingProfile.mockResolvedValue(null);
    databaseService.getLibraryLevelPref.mockResolvedValue({ level: 'intermediate' });
    open();
    expect(await screen.findByRole('option', { name: 'Training level (Intermediate saved)' })).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Create a 5-day/), { target: { value: 'Full body' } });
    fireEvent.click(screen.getByText(/Generate Draft/));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].level).toBe('intermediate');
    expect(requests[0].client.libraryLevel).toBe('intermediate');
  });

  it('pre-ticks areas from the saved injury note and sends the ticks, sex, and no name', async () => {
    databaseService.getClientTrainingProfile.mockResolvedValue({ experienceLevel: 'Beginner', injuries: 'Left knee pain', equipment: '' });
    databaseService.getLibraryLevelPref.mockResolvedValue(null);
    open();
    const knee = await screen.findByRole('checkbox', { name: 'Knee' });
    await waitFor(() => expect(knee.getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Shoulder' }));
    fireEvent.change(screen.getByPlaceholderText(/Create a 5-day/), { target: { value: 'Full body' } });
    fireEvent.click(screen.getByText(/Generate Draft/));
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests[0].client).toMatchObject({ injuryAreas: ['knee', 'shoulder'], sex: 'female', experienceLevel: 'Beginner' });
    expect(JSON.stringify(requests[0])).not.toMatch(/Zelda|Secretname/);
  });

  it('shows the unmatched message for injury text that names no area, and ticks areas typed in', async () => {
    databaseService.getClientTrainingProfile.mockResolvedValue({ experienceLevel: 'Beginner', injuries: '', equipment: '' });
    databaseService.getLibraryLevelPref.mockResolvedValue(null);
    open();
    const note = screen.getByPlaceholderText('Injuries (optional)');
    fireEvent.change(note, { target: { value: 'old surgery' } });
    expect(screen.getByText("Couldn't match this injury to a body area. Check the exercises yourself.")).toBeTruthy();
    fireEvent.change(note, { target: { value: 'sore lower back' } });
    expect(screen.queryByText(/Couldn't match this injury/)).toBeNull();
    fireEvent.blur(note);
    expect(screen.getByRole('checkbox', { name: 'Lower back' }).getAttribute('aria-checked')).toBe('true');
  });
});

describe('Built for this client summary', () => {
  it('shows level, reps, impact, excluded areas and every warning', () => {
    render(<AiDraftBriefSummary
      brief={{ level: 'beginner', levelSource: 'coachPick', reps: { mainLifts: [10, 15], accessories: [10, 15] }, impactCap: 'none', injuries: ['Knee'], excludedCount: 223 }}
      notes={[
        { kind: 'week', text: 'Chest: 12 sets this week, above the 10-set cap.' },
        { kind: 'profile', text: "Missing from the client's profile: sex." },
        { kind: 'day', day: 'Day 1', text: 'Day 1: removed Leg Press (knee injury).' }
      ]}
    />);
    const box = screen.getByTestId('ai-brief-summary');
    expect(box.textContent).toMatch(/Built for this client/);
    expect(box.textContent).toMatch(/Beginner \(your pick\)/);
    expect(box.textContent).toMatch(/Main 10–15 · accessories 10–15/);
    expect(box.textContent).toMatch(/no impact/);
    expect(box.textContent).toMatch(/Knee/);
    expect(box.textContent).toMatch(/223 exercises from your library left out/);
    const items = [...box.querySelectorAll('li')].map(li => li.textContent);
    expect(items).toEqual([
      "Missing from the client's profile: sex.",
      'Day 1: removed Leg Press (knee injury).',
      'Chest: 12 sets this week, above the 10-set cap.'
    ]);
  });

  it('renders nothing without a brief (older drafts)', () => {
    const { container } = render(<AiDraftBriefSummary brief={null} notes={[]} />);
    expect(container.innerHTML).toBe('');
  });
});
