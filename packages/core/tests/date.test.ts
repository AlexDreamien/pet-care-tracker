import { describe, expect, it } from 'vitest';
import {
  addDays,
  addMonths,
  addYears,
  compareDates,
  daysInMonth,
  diffDays,
  endOfMonth,
  fromEpochDay,
  isLeapYear,
  isValidDate,
  nextAnniversary,
  parseDate,
  todayIn,
  toEpochDay,
  weekday,
  zonedDateTimeToInstant,
} from '../src/date';

describe('parseDate', () => {
  it('accepts a well-formed date', () => {
    expect(parseDate('2026-09-08')).toEqual({ year: 2026, month: 9, day: 8 });
  });

  it('rejects a day the month does not have', () => {
    expect(() => parseDate('2026-02-30')).toThrow(/no such day/);
    expect(() => parseDate('2026-04-31')).toThrow(/no such day/);
  });

  it('accepts 29 February only in a leap year', () => {
    expect(isValidDate('2024-02-29')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
  });

  it('rejects anything that is not YYYY-MM-DD', () => {
    expect(isValidDate('2026-9-8')).toBe(false);
    expect(isValidDate('08.09.2026')).toBe(false);
    expect(isValidDate('2026-09-08T00:00:00Z')).toBe(false);
  });
});

describe('leap years', () => {
  it('follows the Gregorian century rule', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);
    expect(isLeapYear(2000)).toBe(true);
  });

  it('gives February 29 days in a leap year', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2026, 2)).toBe(28);
  });
});

describe('epoch day round trip', () => {
  it('puts the epoch at zero', () => {
    expect(toEpochDay({ year: 1970, month: 1, day: 1 })).toBe(0);
  });

  it('round-trips dates on both sides of the epoch', () => {
    for (const date of ['1900-01-01', '1969-12-31', '1970-01-01', '2026-09-08', '2100-02-28']) {
      expect(fromEpochDay(toEpochDay(parseDate(date)))).toEqual(parseDate(date));
    }
  });
});

describe('addMonths', () => {
  it('clamps to the end of a shorter month', () => {
    expect(addMonths('2026-08-31', 3)).toBe('2026-11-30');
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2024-01-31', 1)).toBe('2024-02-29');
  });

  it('crosses a year boundary in both directions', () => {
    expect(addMonths('2026-11-15', 3)).toBe('2027-02-15');
    expect(addMonths('2026-02-15', -3)).toBe('2025-11-15');
  });

  it('does not accumulate clamping when stepping from a fixed origin', () => {
    // The behaviour that keeps a quarterly reminder anchored to the 31st.
    expect(addMonths('2026-01-31', 1)).toBe('2026-02-28');
    expect(addMonths('2026-01-31', 2)).toBe('2026-03-31');
    expect(addMonths('2026-01-31', 3)).toBe('2026-04-30');
  });
});

describe('addYears', () => {
  it('moves a 29 February date to 28 February in a common year', () => {
    expect(addYears('2024-02-29', 1)).toBe('2025-02-28');
    expect(addYears('2024-02-29', 4)).toBe('2028-02-29');
  });
});

describe('addDays and diffDays', () => {
  it('crosses a leap day', () => {
    expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  it('counts whole days, signed', () => {
    expect(diffDays('2026-01-01', '2026-12-31')).toBe(364);
    expect(diffDays('2026-12-31', '2026-01-01')).toBe(-364);
    expect(diffDays('2024-01-01', '2025-01-01')).toBe(366);
  });
});

describe('comparison and month edges', () => {
  it('orders dates', () => {
    expect(compareDates('2026-01-01', '2026-01-02')).toBe(-1);
    expect(compareDates('2026-01-02', '2026-01-01')).toBe(1);
    expect(compareDates('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('finds the end of a month', () => {
    expect(endOfMonth('2026-02-10')).toBe('2026-02-28');
    expect(endOfMonth('2024-02-10')).toBe('2024-02-29');
  });
});

describe('weekday', () => {
  it('uses ISO numbering with Monday as 1', () => {
    expect(weekday('1970-01-01')).toBe(4); // a Thursday
    expect(weekday('2026-09-08')).toBe(2); // a Tuesday
    expect(weekday('2026-09-13')).toBe(7); // a Sunday
  });
});

describe('todayIn', () => {
  it('resolves the civil date in the given zone', () => {
    // 22:30 UTC is already the next day in Moscow.
    const instant = new Date('2026-09-08T22:30:00Z');
    expect(todayIn(instant, 'UTC')).toBe('2026-09-08');
    expect(todayIn(instant, 'Europe/Moscow')).toBe('2026-09-09');
    expect(todayIn(instant, 'America/Los_Angeles')).toBe('2026-09-08');
  });
});

describe('zonedDateTimeToInstant', () => {
  it('reads a wall-clock time in a fixed-offset zone', () => {
    expect(zonedDateTimeToInstant('2026-09-08', '15:00', 'Europe/Moscow')).toBe(
      '2026-09-08T12:00:00.000Z',
    );
    expect(zonedDateTimeToInstant('2026-09-08', '15:00', 'UTC')).toBe('2026-09-08T15:00:00.000Z');
  });

  it('follows the seasonal offset of a zone that observes daylight saving', () => {
    expect(zonedDateTimeToInstant('2026-01-15', '15:00', 'Europe/Berlin')).toBe(
      '2026-01-15T14:00:00.000Z',
    );
    expect(zonedDateTimeToInstant('2026-07-15', '15:00', 'Europe/Berlin')).toBe(
      '2026-07-15T13:00:00.000Z',
    );
  });

  it('lands on the right side of the clocks going forward', () => {
    // 29 March 2026 is the European spring change; 03:30 local is already summer time.
    expect(zonedDateTimeToInstant('2026-03-29', '03:30', 'Europe/Berlin')).toBe(
      '2026-03-29T01:30:00.000Z',
    );
    expect(zonedDateTimeToInstant('2026-03-29', '00:30', 'Europe/Berlin')).toBe(
      '2026-03-28T23:30:00.000Z',
    );
  });

  it('rejects something that is not a time', () => {
    expect(() => zonedDateTimeToInstant('2026-09-08', '25:00', 'UTC')).toThrow(/HH:MM/);
  });
});

describe('nextAnniversary', () => {
  it('returns today when the anniversary is today', () => {
    expect(nextAnniversary('2020-09-08', '2026-09-08')).toBe('2026-09-08');
  });

  it('rolls into next year once the date has passed', () => {
    expect(nextAnniversary('2020-03-01', '2026-09-08')).toBe('2027-03-01');
  });

  it('observes a 29 February anniversary on the 28th in a common year', () => {
    expect(nextAnniversary('2024-02-29', '2026-01-01')).toBe('2026-02-28');
    expect(nextAnniversary('2024-02-29', '2028-01-01')).toBe('2028-02-29');
  });
});
