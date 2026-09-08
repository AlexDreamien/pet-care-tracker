/**
 * Gathering what the household has spent.
 *
 * Three sources, one list: expense rows the owner entered, the fee on a vet visit, and the
 * price of a bag of food. The latter two are read where they already live rather than
 * copied into an expense row — a copy goes stale the moment the original is corrected, and
 * doubles the total if anyone enters both.
 */

import type { ExpenseCategory, ExpenseEntry, IsoDate } from '@pet-care-tracker/core';
import { and, eq, gte, inArray, isNotNull, lte } from 'drizzle-orm';
import type { Database } from '../db/client';
import { expenses, foodBags, pets, visits } from '../db/schema';

export interface MoneyWindow {
  householdId: string;
  from: IsoDate;
  to: IsoDate;
  /** The household's currency, used for anything a record did not name one for. */
  currency: string;
  petId?: string | undefined;
}

export function collectExpenseEntries(database: Database, window: MoneyWindow): ExpenseEntry[] {
  const householdPets = database.db
    .select({ id: pets.id })
    .from(pets)
    .where(eq(pets.householdId, window.householdId))
    .all()
    .map((row) => row.id);

  const petIds = window.petId ? householdPets.filter((id) => id === window.petId) : householdPets;
  const entries: ExpenseEntry[] = [];

  for (const row of database.db
    .select()
    .from(expenses)
    .where(
      and(
        eq(expenses.householdId, window.householdId),
        gte(expenses.spentOn, window.from),
        lte(expenses.spentOn, window.to),
      ),
    )
    .all()) {
    // A household-wide expense has no pet and is kept even when one pet is selected only
    // if no pet filter is on — otherwise "the cat's costs" would include a shared carrier.
    if (window.petId !== undefined && row.petId !== window.petId) continue;
    entries.push({
      id: row.id,
      petId: row.petId,
      category: row.category as ExpenseCategory,
      amount: row.amount,
      currency: row.currency,
      spentOn: row.spentOn,
      source: 'expense',
      note: row.note ?? undefined,
    });
  }

  if (petIds.length > 0) {
    for (const row of database.db
      .select()
      .from(visits)
      .where(
        and(
          inArray(visits.petId, petIds),
          isNotNull(visits.cost),
          gte(visits.visitedOn, window.from),
          lte(visits.visitedOn, window.to),
        ),
      )
      .all()) {
      entries.push({
        id: row.id,
        petId: row.petId,
        category: 'vet',
        amount: row.cost as number,
        currency: row.currency ?? window.currency,
        spentOn: row.visitedOn,
        source: 'visit',
        note: row.reason,
      });
    }

    // A bag is paid for on the day it is opened, which is close enough to when it was
    // bought and is the only date the record actually has.
    for (const row of database.db
      .select()
      .from(foodBags)
      .where(
        and(
          inArray(foodBags.petId, petIds),
          isNotNull(foodBags.price),
          gte(foodBags.openedOn, window.from),
          lte(foodBags.openedOn, window.to),
        ),
      )
      .all()) {
      entries.push({
        id: row.id,
        petId: row.petId,
        category: 'food',
        amount: row.price as number,
        currency: row.currency ?? window.currency,
        spentOn: row.openedOn,
        source: 'food',
        note: row.brand ? `${row.brand} ${row.name}` : row.name,
      });
    }
  }

  return entries;
}
