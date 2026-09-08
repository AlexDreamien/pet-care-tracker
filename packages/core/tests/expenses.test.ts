import { describe, expect, it } from 'vitest';
import { type ExpenseEntry, summariseExpenses } from '../src/expenses';

const entry = (over: Partial<ExpenseEntry>): ExpenseEntry => ({
  id: 'e',
  petId: 'p1',
  category: 'food',
  amount: 100,
  currency: 'RUB',
  spentOn: '2026-09-01',
  source: 'expense',
  ...over,
});

const window = { from: '2026-01-01', to: '2026-12-31', currency: 'RUB' };

describe('summariseExpenses', () => {
  it('totals and groups by category, month and pet', () => {
    const summary = summariseExpenses(
      [
        entry({ id: 'a', category: 'food', amount: 3000, spentOn: '2026-01-15' }),
        entry({ id: 'b', category: 'vet', amount: 5400, spentOn: '2026-02-03', source: 'visit' }),
        entry({ id: 'c', category: 'food', amount: 3200, spentOn: '2026-02-20', petId: 'p2' }),
      ],
      window,
    );

    expect(summary.total).toBe(11_600);
    expect(summary.byCategory[0]).toEqual({ category: 'food', total: 6200, count: 2 });
    expect(summary.byMonth).toEqual([
      { month: '2026-01', total: 3000 },
      { month: '2026-02', total: 8600 },
    ]);
    expect(summary.byPet.map((row) => row.petId)).toEqual(['p1', 'p2']);
  });

  it('keeps a household-wide expense that belongs to no pet', () => {
    const summary = summariseExpenses([entry({ petId: null, amount: 500 })], window);
    expect(summary.byPet).toEqual([{ petId: null, total: 500 }]);
  });

  it('ignores anything outside the window', () => {
    const summary = summariseExpenses(
      [entry({ spentOn: '2025-12-31' }), entry({ spentOn: '2027-01-01' })],
      window,
    );
    expect(summary.total).toBe(0);
  });

  it('sets another currency aside rather than inventing a rate', () => {
    // Converting would silently change what the number means.
    const summary = summariseExpenses(
      [entry({ amount: 1000 }), entry({ id: 'eur', amount: 40, currency: 'EUR' })],
      window,
    );

    expect(summary.total).toBe(1000);
    expect(summary.excluded).toHaveLength(1);
    expect(summary.excluded[0]?.currency).toBe('EUR');
  });

  it('does not leave floating-point dust on a total', () => {
    const summary = summariseExpenses(
      [
        entry({ amount: 1234.56 }),
        entry({ id: 'b', amount: 0.1 }),
        entry({ id: 'c', amount: 0.2 }),
      ],
      window,
    );
    expect(summary.total).toBe(1234.86);
  });

  it('is empty, not broken, with nothing to summarise', () => {
    const summary = summariseExpenses([], window);
    expect(summary).toMatchObject({ total: 0, byCategory: [], byMonth: [], byPet: [] });
  });
});
