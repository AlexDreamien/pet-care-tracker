/**
 * Age from a birth date that may be only partly known.
 *
 * A rescued animal often arrives with "about two years old" or "born in spring 2023".
 * Storing that as an exact date and quietly presenting it as one is a lie the interface
 * would keep repeating, so the precision travels with the date and narrows what the age
 * is allowed to claim.
 */

import {
  addYears,
  compareDates,
  daysInMonth,
  diffDays,
  formatDate,
  type IsoDate,
  parseDate,
} from './date';

export type BirthDatePrecision = 'exact' | 'month' | 'year' | 'approximate';

export interface Age {
  years: number;
  months: number;
  /** Whole days past the last whole month; always 0 when the day of birth is unknown. */
  days: number;
  /** True when the underlying date is not exact, so the age must be shown hedged. */
  approximate: boolean;
  /** The finest unit the precision supports. */
  resolution: 'day' | 'month' | 'year';
}

/**
 * Narrows a birth date to the earliest date consistent with its precision: a month-only
 * date becomes the first of that month, a year-only date becomes 1 January. Reading the
 * range from its start keeps the reported age from ever overstating the animal's age.
 */
export function normaliseBirthDate(birthDate: IsoDate, precision: BirthDatePrecision): IsoDate {
  const { year, month } = parseDate(birthDate);
  switch (precision) {
    case 'year':
      return formatDate({ year, month: 1, day: 1 });
    case 'month':
      return formatDate({ year, month, day: 1 });
    case 'exact':
    case 'approximate':
      return birthDate;
  }
}

export function computeAge(birthDate: IsoDate, precision: BirthDatePrecision, today: IsoDate): Age {
  const start = parseDate(normaliseBirthDate(birthDate, precision));
  const now = parseDate(today);

  if (compareDates(formatDate(start), today) > 0) {
    throw new RangeError(`birth date ${birthDate} is after ${today}`);
  }

  let months = (now.year - start.year) * 12 + (now.month - start.month);
  if (now.day < Math.min(start.day, daysInMonth(now.year, now.month))) months -= 1;

  const years = Math.floor(months / 12);
  const remainingMonths = months - years * 12;

  const anchorYear = start.year + Math.floor((start.month - 1 + months) / 12);
  const anchorMonth = ((start.month - 1 + months) % 12) + 1;
  const anchor = formatDate({
    year: anchorYear,
    month: anchorMonth,
    day: Math.min(start.day, daysInMonth(anchorYear, anchorMonth)),
  });
  const days = diffDays(anchor, today);

  switch (precision) {
    case 'year':
      return { years, months: 0, days: 0, approximate: true, resolution: 'year' };
    case 'month':
      return { years, months: remainingMonths, days: 0, approximate: true, resolution: 'month' };
    case 'approximate':
      return { years, months: remainingMonths, days, approximate: true, resolution: 'day' };
    case 'exact':
      return { years, months: remainingMonths, days, approximate: false, resolution: 'day' };
  }
}

/** Age in whole months — the unit that matters for a puppy's vaccination schedule. */
export function ageInMonths(
  birthDate: IsoDate,
  precision: BirthDatePrecision,
  today: IsoDate,
): number {
  const age = computeAge(birthDate, precision, today);
  return age.years * 12 + age.months;
}

/** Age in whole days, from the earliest date the precision allows. */
export function ageInDays(
  birthDate: IsoDate,
  precision: BirthDatePrecision,
  today: IsoDate,
): number {
  return diffDays(normaliseBirthDate(birthDate, precision), today);
}

/**
 * The birthday to celebrate next, or `null` when the birth date is known only by year and
 * there is no day to put in a calendar. A month-precision birth date is observed on the
 * first of that month — a convention, but a defensible one for a reminder.
 */
export function nextBirthday(
  birthDate: IsoDate,
  precision: BirthDatePrecision,
  today: IsoDate,
): IsoDate | null {
  if (precision === 'year') return null;

  const { month, day } = parseDate(normaliseBirthDate(birthDate, precision));
  const from = parseDate(today);

  const inYear = (year: number): IsoDate =>
    formatDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });

  const thisYear = inYear(from.year);
  return compareDates(thisYear, today) >= 0 ? thisYear : inYear(from.year + 1);
}

/** The date the pet turns `years` old, for planning a senior check-up. */
export function dateOfAge(
  birthDate: IsoDate,
  precision: BirthDatePrecision,
  years: number,
): IsoDate {
  return addYears(normaliseBirthDate(birthDate, precision), years);
}
