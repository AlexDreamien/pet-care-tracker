/**
 * Calendar dates without a time or a time zone.
 *
 * A birthday, a document expiry and a vaccination date are civil dates: they mean the
 * same thing in Moscow and in Lisbon. Round-tripping them through `Date` attaches a time
 * zone and moves them by a day, so nothing here touches `Date` except where a caller
 * explicitly supplies the current instant.
 */

/** A calendar date as `YYYY-MM-DD`. */
export type IsoDate = string;

export interface CivilDate {
  year: number;
  month: number;
  day: number;
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MONTH_LENGTHS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new RangeError(`month out of range: ${month}`);
  }
  if (month === 2 && isLeapYear(year)) return 29;
  return MONTH_LENGTHS[month - 1] as number;
}

/** Parses `YYYY-MM-DD`, rejecting dates that do not exist such as `2026-02-30`. */
export function parseDate(value: string): CivilDate {
  const match = ISO_DATE.exec(value);
  if (!match) throw new RangeError(`not a YYYY-MM-DD date: ${value}`);

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (month < 1 || month > 12) throw new RangeError(`month out of range in ${value}`);
  if (day < 1 || day > daysInMonth(year, month)) throw new RangeError(`no such day: ${value}`);

  return { year, month, day };
}

export function formatDate(date: CivilDate): IsoDate {
  const month = String(date.month).padStart(2, '0');
  const day = String(date.day).padStart(2, '0');
  return `${String(date.year).padStart(4, '0')}-${month}-${day}`;
}

export function isValidDate(value: string): boolean {
  try {
    parseDate(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Days since 1970-01-01, by Howard Hinnant's civil-date algorithm. Exact for any year in
 * the proleptic Gregorian calendar and free of the floating-point drift that comes from
 * dividing milliseconds.
 */
export function toEpochDay(date: CivilDate): number {
  const y = date.month <= 2 ? date.year - 1 : date.year;
  const era = Math.floor(y / 400);
  const yearOfEra = y - era * 400;
  const shiftedMonth = (date.month + 9) % 12;
  const dayOfYear = Math.floor((153 * shiftedMonth + 2) / 5) + date.day - 1;
  const dayOfEra =
    yearOfEra * 365 + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100) + dayOfYear;
  return era * 146097 + dayOfEra - 719468;
}

export function fromEpochDay(days: number): CivilDate {
  const shifted = days + 719468;
  const era = Math.floor(shifted / 146097);
  const dayOfEra = shifted - era * 146097;
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365,
  );
  const y = yearOfEra + era * 400;
  const dayOfYear =
    dayOfEra - (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100));
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153);
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1;
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9;
  return { year: month <= 2 ? y + 1 : y, month, day };
}

export function addDays(date: IsoDate, days: number): IsoDate {
  return formatDate(fromEpochDay(toEpochDay(parseDate(date)) + days));
}

/**
 * Adds calendar months, clamping to the end of the target month.
 *
 * Three months after 31 August is 30 November, not 1 December. Clamping rather than
 * overflowing is what a person means by "in three months", and it is what keeps a
 * quarterly antiparasitic reminder from creeping forward a day every year.
 */
export function addMonths(date: IsoDate, months: number): IsoDate {
  const { year, month, day } = parseDate(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = zeroBased - targetYear * 12 + 1;
  const clampedDay = Math.min(day, daysInMonth(targetYear, targetMonth));
  return formatDate({ year: targetYear, month: targetMonth, day: clampedDay });
}

/** Adds calendar years. 29 February lands on 28 February in a common year. */
export function addYears(date: IsoDate, years: number): IsoDate {
  return addMonths(date, years * 12);
}

export function addWeeks(date: IsoDate, weeks: number): IsoDate {
  return addDays(date, weeks * 7);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function diffDays(from: IsoDate, to: IsoDate): number {
  return toEpochDay(parseDate(to)) - toEpochDay(parseDate(from));
}

/** Negative when `a` is earlier, positive when later, zero when equal. */
export function compareDates(a: IsoDate, b: IsoDate): number {
  const left = toEpochDay(parseDate(a));
  const right = toEpochDay(parseDate(b));
  return left < right ? -1 : left > right ? 1 : 0;
}

export function minDate(a: IsoDate, b: IsoDate): IsoDate {
  return compareDates(a, b) <= 0 ? a : b;
}

export function maxDate(a: IsoDate, b: IsoDate): IsoDate {
  return compareDates(a, b) >= 0 ? a : b;
}

export function isBefore(a: IsoDate, b: IsoDate): boolean {
  return compareDates(a, b) < 0;
}

export function isAfter(a: IsoDate, b: IsoDate): boolean {
  return compareDates(a, b) > 0;
}

export function startOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseDate(date);
  return formatDate({ year, month, day: 1 });
}

export function endOfMonth(date: IsoDate): IsoDate {
  const { year, month } = parseDate(date);
  return formatDate({ year, month, day: daysInMonth(year, month) });
}

/** ISO weekday: 1 is Monday through 7 is Sunday. */
export function weekday(date: IsoDate): number {
  const epochDay = toEpochDay(parseDate(date));
  // 1970-01-01 was a Thursday, ISO weekday 4.
  return ((((epochDay + 3) % 7) + 7) % 7) + 1;
}

/**
 * The civil date at `instant` in `timeZone`.
 *
 * The current instant is a parameter rather than a `new Date()` call so that everything
 * downstream stays deterministic and testable.
 */
export function todayIn(instant: Date, timeZone: string): IsoDate {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);

  const value = (type: string): string => parts.find((part) => part.type === type)?.value ?? '';

  return `${value('year')}-${value('month')}-${value('day')}`;
}

/**
 * The next occurrence of a month-and-day anniversary on or after `from`.
 *
 * A 29 February birthday is observed on 28 February in a common year — the same clamping
 * rule as `addMonths`, so a pet born in a leap year still has a birthday every year.
 */
export function nextAnniversary(anniversary: IsoDate, from: IsoDate): IsoDate {
  const { month, day } = parseDate(anniversary);
  const fromDate = parseDate(from);

  const inYear = (year: number): IsoDate =>
    formatDate({ year, month, day: Math.min(day, daysInMonth(year, month)) });

  const thisYear = inYear(fromDate.year);
  return compareDates(thisYear, from) >= 0 ? thisYear : inYear(fromDate.year + 1);
}
