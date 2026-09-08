import { describe, expect, it } from 'vitest';
import {
  ageInDays,
  ageInMonths,
  computeAge,
  dateOfAge,
  nextBirthday,
  normaliseBirthDate,
} from '../src/age';

describe('computeAge with an exact birth date', () => {
  it('reports whole years on the birthday', () => {
    expect(computeAge('2020-09-08', 'exact', '2026-09-08')).toEqual({
      years: 6,
      months: 0,
      days: 0,
      approximate: false,
      resolution: 'day',
    });
  });

  it('reports the day before the birthday as one day short', () => {
    const age = computeAge('2020-09-09', 'exact', '2026-09-08');
    expect(age.years).toBe(5);
    expect(age.months).toBe(11);
    expect(age.days).toBe(30);
  });

  it('handles a birthday at the end of a long month', () => {
    // One month after 31 January is 28 February, so on 28 February the pet is one month old.
    const age = computeAge('2026-01-31', 'exact', '2026-02-28');
    expect(age.years).toBe(0);
    expect(age.months).toBe(1);
    expect(age.days).toBe(0);
  });

  it('handles a leap-day birth date', () => {
    expect(computeAge('2024-02-29', 'exact', '2026-02-28').years).toBe(2);
    expect(computeAge('2024-02-29', 'exact', '2026-03-01').years).toBe(2);
  });

  it('refuses a birth date in the future', () => {
    expect(() => computeAge('2027-01-01', 'exact', '2026-09-08')).toThrow(/after/);
  });
});

describe('computeAge with a partly known birth date', () => {
  it('reports only years when the year alone is known', () => {
    expect(computeAge('2019-06-15', 'year', '2026-03-01')).toEqual({
      years: 7,
      months: 0,
      days: 0,
      approximate: true,
      resolution: 'year',
    });
  });

  it('reports years and months when the month is known', () => {
    const age = computeAge('2023-04-20', 'month', '2026-09-08');
    expect(age).toEqual({
      years: 3,
      months: 5,
      days: 0,
      approximate: true,
      resolution: 'month',
    });
  });

  it('marks a full but estimated date as approximate', () => {
    const age = computeAge('2020-09-08', 'approximate', '2026-09-08');
    expect(age.years).toBe(6);
    expect(age.approximate).toBe(true);
    expect(age.resolution).toBe('day');
  });

  it('narrows a partial date to the earliest it could be', () => {
    expect(normaliseBirthDate('2019-06-15', 'year')).toBe('2019-01-01');
    expect(normaliseBirthDate('2019-06-15', 'month')).toBe('2019-06-01');
    expect(normaliseBirthDate('2019-06-15', 'exact')).toBe('2019-06-15');
  });
});

describe('age in single units', () => {
  it('counts whole months, which is what a puppy schedule needs', () => {
    expect(ageInMonths('2026-06-01', 'exact', '2026-09-08')).toBe(3);
    expect(ageInMonths('2026-06-10', 'exact', '2026-09-08')).toBe(2);
  });

  it('counts whole days', () => {
    expect(ageInDays('2026-09-01', 'exact', '2026-09-08')).toBe(7);
  });
});

describe('nextBirthday', () => {
  it('returns null when only the year is known', () => {
    expect(nextBirthday('2019-06-15', 'year', '2026-09-08')).toBeNull();
  });

  it('observes a leap-day birthday on 28 February in a common year', () => {
    expect(nextBirthday('2020-02-29', 'exact', '2026-01-01')).toBe('2026-02-28');
    expect(nextBirthday('2020-02-29', 'exact', '2028-01-01')).toBe('2028-02-29');
  });

  it('rolls into next year once the birthday has passed', () => {
    expect(nextBirthday('2020-03-01', 'exact', '2026-09-08')).toBe('2027-03-01');
  });

  it('falls on the first of the month when only the month is known', () => {
    expect(nextBirthday('2020-11-17', 'month', '2026-09-08')).toBe('2026-11-01');
  });
});

describe('dateOfAge', () => {
  it('finds when the pet reaches a given age', () => {
    expect(dateOfAge('2019-06-15', 'exact', 7)).toBe('2026-06-15');
    expect(dateOfAge('2019-06-15', 'year', 7)).toBe('2026-01-01');
  });
});
