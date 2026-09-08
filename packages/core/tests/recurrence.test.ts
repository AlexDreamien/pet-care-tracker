import { describe, expect, it } from 'vitest';
import {
  addInterval,
  advanceOnCompletion,
  daysUntil,
  isOverdue,
  nextDue,
  occurrenceAt,
  occurrencesBetween,
  type AfterCompletionRule,
  type FixedCalendarRule,
} from '../src/recurrence';

const annualBooster: FixedCalendarRule = {
  kind: 'fixed_calendar',
  interval: 1,
  unit: 'year',
  anchor: '2026-03-01',
};

const quarterlyWormer: AfterCompletionRule = {
  kind: 'after_completion',
  interval: 3,
  unit: 'month',
  anchor: '2026-01-10',
};

describe('addInterval', () => {
  it('steps in each unit', () => {
    expect(addInterval('2026-01-01', 10, 'day')).toBe('2026-01-11');
    expect(addInterval('2026-01-01', 2, 'week')).toBe('2026-01-15');
    expect(addInterval('2026-01-01', 3, 'month')).toBe('2026-04-01');
    expect(addInterval('2026-01-01', 1, 'year')).toBe('2027-01-01');
  });
});

describe('occurrenceAt', () => {
  it('computes each occurrence from the anchor, not from its predecessor', () => {
    const monthlyFromThe31st: FixedCalendarRule = {
      kind: 'fixed_calendar',
      interval: 1,
      unit: 'month',
      anchor: '2026-01-31',
    };
    // Stepping one month at a time would clamp to the 28th and stay there.
    expect(occurrenceAt(monthlyFromThe31st, 1)).toBe('2026-02-28');
    expect(occurrenceAt(monthlyFromThe31st, 2)).toBe('2026-03-31');
    expect(occurrenceAt(monthlyFromThe31st, 3)).toBe('2026-04-30');
  });

  it('rejects a nonsensical interval', () => {
    expect(() => occurrenceAt({ ...annualBooster, interval: 0 }, 1)).toThrow(/positive integer/);
    expect(() => occurrenceAt({ ...annualBooster, interval: 1.5 }, 1)).toThrow(/positive integer/);
  });
});

describe('nextDue for a fixed-calendar rule', () => {
  it('is the anchor when nothing has been done yet', () => {
    expect(nextDue(annualBooster)).toBe('2026-03-01');
  });

  it('moves to the next point on the grid after a completion', () => {
    expect(nextDue(annualBooster, '2026-03-05')).toBe('2027-03-01');
  });

  it('stays on the grid when the work was done early', () => {
    // Done a fortnight early, the next one is still due in March — not in mid-February.
    expect(nextDue(annualBooster, '2026-02-14')).toBe('2026-03-01');
  });

  it('respects an end date', () => {
    const bounded: FixedCalendarRule = { ...annualBooster, until: '2027-01-01' };
    expect(nextDue(bounded, '2026-03-01')).toBeNull();
  });

  it('respects an occurrence count', () => {
    const threeTimes: FixedCalendarRule = { ...annualBooster, count: 2 };
    expect(nextDue(threeTimes, '2026-03-01')).toBe('2027-03-01');
    expect(nextDue(threeTimes, '2027-03-01')).toBeNull();
  });
});

describe('nextDue for an after-completion rule', () => {
  it('is the anchor before anything has been done', () => {
    expect(nextDue(quarterlyWormer)).toBe('2026-01-10');
  });

  it('counts from when the dose was actually given', () => {
    expect(nextDue(quarterlyWormer, '2026-02-20')).toBe('2026-05-20');
  });

  it('pushes the schedule out when a dose was given late', () => {
    // The whole reason this rule kind exists: protection lapses from the last dose.
    expect(nextDue(quarterlyWormer, '2026-04-15')).toBe('2026-07-15');
  });

  it('clamps to the end of a shorter month', () => {
    expect(nextDue({ ...quarterlyWormer, interval: 1 }, '2026-01-31')).toBe('2026-02-28');
  });
});

describe('advanceOnCompletion', () => {
  it('keeps a fixed-calendar series on its grid when completed early', () => {
    expect(
      advanceOnCompletion(annualBooster, { completedOn: '2026-02-14', scheduledFor: '2026-03-01' }),
    ).toBe('2027-03-01');
  });

  it('keeps a fixed-calendar series on its grid when completed late', () => {
    expect(
      advanceOnCompletion(annualBooster, { completedOn: '2026-05-20', scheduledFor: '2026-03-01' }),
    ).toBe('2027-03-01');
  });

  it('restarts an after-completion series from the day the work happened', () => {
    expect(
      advanceOnCompletion(quarterlyWormer, {
        completedOn: '2026-03-20',
        scheduledFor: '2026-01-10',
      }),
    ).toBe('2026-06-20');
  });
});

describe('occurrencesBetween', () => {
  it('expands a monthly series across end-of-month clamping', () => {
    const monthly: FixedCalendarRule = {
      kind: 'fixed_calendar',
      interval: 1,
      unit: 'month',
      anchor: '2026-01-31',
    };
    expect(occurrencesBetween(monthly, '2026-01-01', '2026-05-01')).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
    ]);
  });

  it('starts inside the window rather than at the anchor', () => {
    const weekly: FixedCalendarRule = {
      kind: 'fixed_calendar',
      interval: 1,
      unit: 'week',
      anchor: '2020-01-06',
    };
    expect(occurrencesBetween(weekly, '2026-09-07', '2026-09-21')).toEqual([
      '2026-09-07',
      '2026-09-14',
      '2026-09-21',
    ]);
  });

  it('returns nothing for an inverted window', () => {
    expect(occurrencesBetween(annualBooster, '2026-12-01', '2026-01-01')).toEqual([]);
  });

  it('yields at most one date for an after-completion rule', () => {
    // The interval runs from a completion that has not happened, so there is nothing
    // beyond the next one to project.
    expect(
      occurrencesBetween(quarterlyWormer, '2026-01-01', '2027-01-01', {
        lastCompletedOn: '2026-02-20',
      }),
    ).toEqual(['2026-05-20']);
  });

  it('omits an after-completion date that falls outside the window', () => {
    expect(
      occurrencesBetween(quarterlyWormer, '2026-01-01', '2026-03-01', {
        lastCompletedOn: '2026-02-20',
      }),
    ).toEqual([]);
  });

  it('stops at the end date', () => {
    const bounded: FixedCalendarRule = {
      kind: 'fixed_calendar',
      interval: 1,
      unit: 'month',
      anchor: '2026-01-15',
      until: '2026-03-31',
    };
    expect(occurrencesBetween(bounded, '2026-01-01', '2026-12-31')).toEqual([
      '2026-01-15',
      '2026-02-15',
      '2026-03-15',
    ]);
  });
});

describe('due-date helpers', () => {
  it('recognises an overdue date', () => {
    expect(isOverdue('2026-09-07', '2026-09-08')).toBe(true);
    expect(isOverdue('2026-09-08', '2026-09-08')).toBe(false);
  });

  it('counts days until a date, negative once past', () => {
    expect(daysUntil('2026-09-15', '2026-09-08')).toBe(7);
    expect(daysUntil('2026-09-01', '2026-09-08')).toBe(-7);
  });
});
