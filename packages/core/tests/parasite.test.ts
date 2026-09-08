import { describe, expect, it } from 'vitest';
import {
  intervalForAge,
  nextParasiteDue,
  toRecurrenceRule,
  type ParasiteProtocol,
} from '../src/parasite';
import { nextDue } from '../src/recurrence';

const worming: ParasiteProtocol = {
  code: 'internal_routine',
  species: 'dog',
  target: 'internal',
  startAgeWeeks: 2,
  juvenile: [
    { untilAgeMonths: 3, interval: 2, unit: 'week' },
    { untilAgeMonths: 6, interval: 1, unit: 'month' },
  ],
  adult: { interval: 3, unit: 'month' },
  guidance: 'test',
};

const fleaAndTick: ParasiteProtocol = {
  code: 'external_routine',
  species: 'dog',
  target: 'external',
  startAgeWeeks: 8,
  juvenile: [],
  adult: { interval: 1, unit: 'month' },
  guidance: 'test',
};

describe('intervalForAge', () => {
  it('picks the first phase the animal has not outgrown', () => {
    expect(intervalForAge(worming, 1)).toEqual({ interval: 2, unit: 'week' });
    expect(intervalForAge(worming, 4)).toEqual({ interval: 1, unit: 'month' });
    expect(intervalForAge(worming, 12)).toEqual({ interval: 3, unit: 'month' });
  });

  it('uses the adult interval when there are no juvenile phases', () => {
    expect(intervalForAge(fleaAndTick, 1)).toEqual({ interval: 1, unit: 'month' });
  });
});

describe('nextParasiteDue with no history', () => {
  it('waits for a puppy to reach the starting age', () => {
    expect(nextParasiteDue(worming, { birthDate: '2026-01-01', today: '2026-01-05' })).toEqual({
      dueOn: '2026-01-15',
      interval: { interval: 2, unit: 'week' },
    });
  });

  it('is due today for an adult that arrives without records', () => {
    // A rescue with no paperwork needs treating now, not on an anniversary it does not have.
    expect(nextParasiteDue(worming, { today: '2026-09-08' })).toEqual({
      dueOn: '2026-09-08',
      interval: { interval: 3, unit: 'month' },
    });
  });

  it('is due today for a pet already past the starting age', () => {
    expect(nextParasiteDue(worming, { birthDate: '2020-01-01', today: '2026-09-08' }).dueOn).toBe(
      '2026-09-08',
    );
  });
});

describe('nextParasiteDue from the last dose', () => {
  it('uses the fortnightly cadence for a very young animal', () => {
    expect(
      nextParasiteDue(worming, {
        birthDate: '2026-01-01',
        lastGivenOn: '2026-01-15',
        today: '2026-01-20',
      }).dueOn,
    ).toBe('2026-01-29');
  });

  it('moves to monthly once past the first phase', () => {
    expect(
      nextParasiteDue(worming, {
        birthDate: '2026-01-01',
        lastGivenOn: '2026-05-01',
        today: '2026-05-02',
      }).dueOn,
    ).toBe('2026-06-01');
  });

  it('settles on the adult interval', () => {
    expect(
      nextParasiteDue(worming, {
        birthDate: '2026-01-01',
        lastGivenOn: '2026-08-01',
        today: '2026-08-02',
      }).dueOn,
    ).toBe('2026-11-01');
  });

  it('pushes the schedule out when a dose was given late', () => {
    const onTime = nextParasiteDue(worming, { lastGivenOn: '2026-06-01', today: '2026-09-08' });
    const late = nextParasiteDue(worming, { lastGivenOn: '2026-06-21', today: '2026-09-08' });
    expect(onTime.dueOn).toBe('2026-09-01');
    expect(late.dueOn).toBe('2026-09-21');
  });

  it('clamps to the end of a shorter month', () => {
    expect(nextParasiteDue(worming, { lastGivenOn: '2026-08-31', today: '2026-09-08' }).dueOn).toBe(
      '2026-11-30',
    );
  });
});

describe('toRecurrenceRule', () => {
  it('produces an after-completion rule, so lateness carries through the calendar', () => {
    const rule = toRecurrenceRule(worming, { lastGivenOn: '2026-06-01', today: '2026-09-08' });
    expect(rule).toEqual({
      kind: 'after_completion',
      interval: 3,
      unit: 'month',
      anchor: '2026-09-01',
    });
    expect(nextDue(rule, '2026-09-20')).toBe('2026-12-20');
  });
});
