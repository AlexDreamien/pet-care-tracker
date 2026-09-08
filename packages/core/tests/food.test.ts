import { describe, expect, it } from 'vitest';
import { dailyFoodCost, foodReminderDate, forecastFood } from '../src/food';

const bag = { weightGrams: 12_000, dailyGrams: 400, openedOn: '2026-09-01' };

describe('forecastFood', () => {
  it('counts what has been eaten since the bag was opened', () => {
    const forecast = forecastFood(bag, '2026-09-08');
    expect(forecast.consumedGrams).toBe(2800);
    expect(forecast.remainingGrams).toBe(9200);
  });

  it('says which day it runs out', () => {
    // 12 kg at 400 g a day is 30 days.
    expect(forecastFood(bag, '2026-09-08').emptyOn).toBe('2026-10-01');
    expect(forecastFood(bag, '2026-09-08').daysLeft).toBe(23);
  });

  it('rounds the last day down rather than promising a part-day', () => {
    const odd = { weightGrams: 10_000, dailyGrams: 300, openedOn: '2026-09-01' };
    // 33.3 days: the 33rd day is the last one with a full ration in the bag.
    expect(forecastFood(odd, '2026-09-01').emptyOn).toBe('2026-10-04');
  });

  it('reports an empty bag rather than a negative amount left', () => {
    const forecast = forecastFood(bag, '2026-11-01');
    expect(forecast.remainingGrams).toBe(0);
    expect(forecast.consumedGrams).toBe(12_000);
    expect(forecast.empty).toBe(true);
    expect(forecast.daysLeft).toBeLessThan(0);
  });

  it('does not credit food eaten before the bag was opened', () => {
    const forecast = forecastFood(bag, '2026-08-20');
    expect(forecast.consumedGrams).toBe(0);
    expect(forecast.remainingGrams).toBe(12_000);
  });

  it('refuses figures that cannot describe a bag', () => {
    expect(() => forecastFood({ ...bag, dailyGrams: 0 }, '2026-09-08')).toThrow(/positive/);
    expect(() => forecastFood({ ...bag, weightGrams: -1 }, '2026-09-08')).toThrow(/positive/);
  });
});

describe('foodReminderDate', () => {
  it('warns the chosen number of days before the bag runs out', () => {
    expect(foodReminderDate(bag, '2026-09-08', 5)).toBe('2026-09-26');
  });

  it('does not warn before the bag was even opened', () => {
    // A three-day bag with a week's warning would otherwise be due before it was bought.
    const small = { weightGrams: 1200, dailyGrams: 400, openedOn: '2026-09-01' };
    expect(foodReminderDate(small, '2026-09-01', 7)).toBe('2026-09-01');
  });
});

describe('dailyFoodCost', () => {
  it('spreads the price across the days the bag lasts', () => {
    expect(dailyFoodCost({ ...bag, price: 3000 })).toBe(100);
  });

  it('has nothing to spread without a price', () => {
    expect(dailyFoodCost(bag)).toBeNull();
  });
});
