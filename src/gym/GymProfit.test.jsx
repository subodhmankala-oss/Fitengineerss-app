// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import GymProfit from './GymProfit';

afterEach(cleanup);

const TODAY = '2026-11-28';
const biz = {
  payments: [{ id: 'p1', amount_inr: 100000, paid_on: '2026-11-05' }, { id: 'p2', amount_inr: 30000, paid_on: '2026-10-05' }],
  expenses: [
    { id: '11111111-2222-3333-4444-555555555555', category: 'rent', amount_inr: 60000, spent_on: '2026-10-01', monthly: true, stopped_on: null },
    { id: '21111111-2222-3333-4444-555555555555', category: 'equipment', amount_inr: 10000, spent_on: '2026-11-12', monthly: false, stopped_on: null }
  ],
  payouts: []
};

describe('Profit section', () => {
  it('shows this month’s profit and switches to a loss month', () => {
    render(<GymProfit biz={biz} today={TODAY} service={{}} onChanged={() => {}} />);
    expect(screen.getByTestId('profit-tile').textContent).toMatch(/Profit.*30,000/);
    fireEvent.click(screen.getByRole('button', { name: 'Oct' }));
    expect(screen.getByTestId('profit-tile').textContent).toMatch(/Loss.*30,000/);
  });

  it('adds a monthly rent expense', async () => {
    const service = { gymExpense: vi.fn().mockResolvedValue({ success: true }) };
    const onChanged = vi.fn();
    render(<GymProfit biz={biz} today={TODAY} service={service} onChanged={onChanged} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Electricity' }));
    fireEvent.change(screen.getByPlaceholderText('80000'), { target: { value: '17000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    await waitFor(() => expect(service.gymExpense).toHaveBeenCalledWith({ op: 'add', category: 'electricity', amountInr: 17000, spentOn: TODAY, note: null, monthly: true }));
    expect(onChanged).toHaveBeenCalled();
  });

  it('a one-off kind starts as not repeating, and an empty amount is refused', () => {
    const service = { gymExpense: vi.fn() };
    render(<GymProfit biz={biz} today={TODAY} service={service} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Add expense' }));
    fireEvent.click(screen.getByRole('button', { name: 'Equipment' }));
    expect(screen.getByRole('switch', { name: 'Repeats every month' }).getAttribute('aria-checked')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Save expense' }));
    expect(screen.getByRole('alert').textContent).toContain('whole rupees');
    expect(service.gymExpense).not.toHaveBeenCalled();
  });

  it('stops a monthly expense and removes a one-off', async () => {
    const service = { gymExpense: vi.fn().mockResolvedValue({ success: true }) };
    render(<GymProfit biz={biz} today={TODAY} service={service} onChanged={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Stop after this month' }));
    await waitFor(() => expect(service.gymExpense).toHaveBeenCalledWith({ op: 'stop', expenseId: biz.expenses[0].id }));
    fireEvent.click(screen.getByRole('button', { name: /Remove Equipment/ }));
    await waitFor(() => expect(service.gymExpense).toHaveBeenCalledWith({ op: 'delete', expenseId: biz.expenses[1].id }));
  });
});
