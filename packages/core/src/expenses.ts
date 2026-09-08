/**
 * What the animal costs.
 *
 * Money already recorded elsewhere — a visit's fee, a bag of food's price — is folded into
 * the summary by computation rather than copied into an expense row. A copy would go stale
 * the moment the original was corrected, and would double the total if anyone entered both.
 */

import { compareDates, type IsoDate } from './date';

export type ExpenseCategory =
  | 'food'
  | 'vet'
  | 'medication'
  | 'grooming'
  | 'accessories'
  | 'insurance'
  | 'training'
  | 'boarding'
  | 'other';

export const EXPENSE_CATEGORIES: readonly ExpenseCategory[] = [
  'food',
  'vet',
  'medication',
  'grooming',
  'accessories',
  'insurance',
  'training',
  'boarding',
  'other',
];

export interface ExpenseEntry {
  id: string;
  petId: string | null;
  category: ExpenseCategory;
  amount: number;
  currency: string;
  spentOn: IsoDate;
  /** Where the figure came from, so the interface can link back to it. */
  source: 'expense' | 'visit' | 'food';
  note?: string | undefined;
}

export interface CategoryTotal {
  category: ExpenseCategory;
  total: number;
  count: number;
}

export interface MonthTotal {
  /** `YYYY-MM`. */
  month: string;
  total: number;
}

export interface ExpenseSummary {
  total: number;
  currency: string;
  byCategory: CategoryTotal[];
  byMonth: MonthTotal[];
  byPet: { petId: string | null; total: number }[];
  /** Entries in another currency, which are counted separately rather than converted. */
  excluded: ExpenseEntry[];
}

/**
 * Totals for a window, in one currency.
 *
 * There is no exchange rate here and there should not be: inventing one would silently
 * change what the numbers mean. Anything in another currency is reported separately so it
 * is visible rather than quietly dropped.
 */
export function summariseExpenses(
  entries: readonly ExpenseEntry[],
  options: { from: IsoDate; to: IsoDate; currency: string },
): ExpenseSummary {
  const inWindow = entries.filter(
    (entry) =>
      compareDates(entry.spentOn, options.from) >= 0 &&
      compareDates(entry.spentOn, options.to) <= 0,
  );

  const counted = inWindow.filter((entry) => entry.currency === options.currency);
  const excluded = inWindow.filter((entry) => entry.currency !== options.currency);

  const categories = new Map<ExpenseCategory, CategoryTotal>();
  const months = new Map<string, number>();
  const pets = new Map<string | null, number>();
  let total = 0;

  for (const entry of counted) {
    total += entry.amount;

    const category = categories.get(entry.category) ?? {
      category: entry.category,
      total: 0,
      count: 0,
    };
    category.total += entry.amount;
    category.count += 1;
    categories.set(entry.category, category);

    const month = entry.spentOn.slice(0, 7);
    months.set(month, (months.get(month) ?? 0) + entry.amount);
    pets.set(entry.petId, (pets.get(entry.petId) ?? 0) + entry.amount);
  }

  return {
    total: round(total),
    currency: options.currency,
    byCategory: [...categories.values()]
      .map((entry) => ({ ...entry, total: round(entry.total) }))
      .sort((a, b) => b.total - a.total),
    byMonth: [...months.entries()]
      .map(([month, sum]) => ({ month, total: round(sum) }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byPet: [...pets.entries()]
      .map(([petId, sum]) => ({ petId, total: round(sum) }))
      .sort((a, b) => b.total - a.total),
    excluded,
  };
}

/** Money in two decimal places; floating-point sums otherwise show 1234.5600000000001. */
function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
