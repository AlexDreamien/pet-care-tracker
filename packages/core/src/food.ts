/**
 * How long the open bag will last.
 *
 * The useful question is not "how much food is left" but "when do I need to have bought
 * more", and the answer has to arrive before the bag is empty rather than on the morning it
 * is. Running out of a prescription diet on a Sunday is a genuinely bad afternoon.
 */

import { addDays, compareDates, diffDays, type IsoDate } from './date';

export interface FoodBag {
  /** Net weight of the bag, in grams. */
  weightGrams: number;
  /** What the animal eats a day, in grams. */
  dailyGrams: number;
  openedOn: IsoDate;
}

export interface FoodForecast {
  consumedGrams: number;
  remainingGrams: number;
  /** The day the bag runs out. */
  emptyOn: IsoDate;
  /** Days from today until it does; negative once it already has. */
  daysLeft: number;
  /** True once the bag should already have been replaced. */
  empty: boolean;
}

/**
 * A straight-line estimate from the day the bag was opened.
 *
 * It ignores the days the dog was at a sitter or refused breakfast, which is why the
 * interface calls it an estimate — but an estimate that is a few days out is still the
 * difference between noticing and not.
 */
export function forecastFood(bag: FoodBag, today: IsoDate): FoodForecast {
  if (!Number.isFinite(bag.dailyGrams) || bag.dailyGrams <= 0) {
    throw new RangeError(`daily ration must be positive: ${bag.dailyGrams}`);
  }
  if (!Number.isFinite(bag.weightGrams) || bag.weightGrams <= 0) {
    throw new RangeError(`bag weight must be positive: ${bag.weightGrams}`);
  }

  // A bag opened in the future has not started; a negative elapsed count would report more
  // food than the bag holds.
  const elapsed = Math.max(0, diffDays(bag.openedOn, today));
  const consumed = Math.min(bag.weightGrams, elapsed * bag.dailyGrams);
  const remaining = bag.weightGrams - consumed;

  const lastsDays = Math.floor(bag.weightGrams / bag.dailyGrams);
  const emptyOn = addDays(bag.openedOn, lastsDays);

  return {
    consumedGrams: consumed,
    remainingGrams: remaining,
    emptyOn,
    daysLeft: diffDays(today, emptyOn),
    empty: compareDates(emptyOn, today) <= 0,
  };
}

/**
 * When to put "buy more food" on the agenda.
 *
 * `leadDays` before the bag runs out, but never before it was opened — a small bag with a
 * long warning would otherwise be due the day it was bought.
 */
export function foodReminderDate(bag: FoodBag, today: IsoDate, leadDays: number): IsoDate {
  const { emptyOn } = forecastFood(bag, today);
  const warned = addDays(emptyOn, -Math.max(0, leadDays));
  return compareDates(warned, bag.openedOn) < 0 ? bag.openedOn : warned;
}

/** Daily cost, for the expense summary; `null` when the bag's price is unknown. */
export function dailyFoodCost(bag: FoodBag & { price?: number | undefined }): number | null {
  if (bag.price === undefined || !Number.isFinite(bag.price)) return null;
  const lastsDays = bag.weightGrams / bag.dailyGrams;
  return lastsDays > 0 ? bag.price / lastsDays : null;
}
