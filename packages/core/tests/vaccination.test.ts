import { describe, expect, it } from 'vitest';
import {
  isPrimaryCourseComplete,
  nextVaccinationDue,
  planPrimaryCourse,
  type VaccineDefinition,
} from '../src/vaccination';

const combined: VaccineDefinition = {
  code: 'dhppi',
  species: 'dog',
  core: true,
  covers: ['distemper', 'parvovirus'],
  primaryCourse: {
    startAgeWeeks: 8,
    intervalWeeks: 4,
    completeByAgeWeeks: 16,
    firstBoosterAgeMonths: 6,
  },
  boosterInterval: { interval: 3, unit: 'year' },
  guidance: 'test',
};

const rabies: VaccineDefinition = {
  code: 'rabies',
  species: 'dog',
  core: true,
  covers: ['rabies'],
  primaryCourse: {
    startAgeWeeks: 12,
    intervalWeeks: 4,
    completeByAgeWeeks: 12,
    firstBoosterAgeMonths: 12,
  },
  boosterInterval: { interval: 1, unit: 'year' },
  guidance: 'test',
};

describe('planPrimaryCourse', () => {
  it('repeats until the completion age, then closes with an age-based booster', () => {
    expect(planPrimaryCourse(combined, '2026-01-01')).toEqual([
      { dueOn: '2026-02-26', stage: 'primary', index: 0 },
      { dueOn: '2026-03-26', stage: 'primary', index: 1 },
      { dueOn: '2026-04-23', stage: 'primary_final', index: 2 },
      { dueOn: '2026-07-01', stage: 'first_booster', index: 3 },
    ]);
  });

  it('produces a single dose when the course completes at the starting age', () => {
    expect(planPrimaryCourse(rabies, '2026-01-01')).toEqual([
      { dueOn: '2026-03-26', stage: 'primary_final', index: 0 },
      { dueOn: '2027-01-01', stage: 'first_booster', index: 1 },
    ]);
  });

  it('plans from the earliest date a partly known birth date allows', () => {
    const plan = planPrimaryCourse(combined, '2026-03-17', 'year');
    expect(plan[0]?.dueOn).toBe('2026-02-26');
  });
});

describe('nextVaccinationDue', () => {
  it('proposes the first dose for a puppy with no history', () => {
    expect(nextVaccinationDue(combined, { history: [], birthDate: '2026-01-01' })).toEqual({
      dueOn: '2026-02-26',
      stage: 'primary',
    });
  });

  it('has nothing to propose without a history or a birth date', () => {
    expect(nextVaccinationDue(combined, { history: [] })).toBeNull();
  });

  it('walks the plan as doses are recorded', () => {
    expect(
      nextVaccinationDue(combined, { history: ['2026-02-26'], birthDate: '2026-01-01' }),
    ).toEqual({ dueOn: '2026-03-26', stage: 'primary' });
  });

  it('keeps the minimum gap when the course was started late', () => {
    // The plan says 26 March, but the first dose only went in on 1 April; bunching the
    // second dose four days later would be worse than useless.
    expect(
      nextVaccinationDue(combined, { history: ['2026-04-01'], birthDate: '2026-01-01' }),
    ).toEqual({ dueOn: '2026-04-29', stage: 'primary' });
  });

  it('keeps the closing booster on its age, not on a gap', () => {
    expect(
      nextVaccinationDue(rabies, { history: ['2026-03-26'], birthDate: '2026-01-01' }),
    ).toEqual({ dueOn: '2027-01-01', stage: 'first_booster' });
  });

  it('switches to the booster interval once the primary series is done', () => {
    const history = ['2026-02-26', '2026-03-26', '2026-04-23', '2026-07-01'];
    expect(nextVaccinationDue(combined, { history, birthDate: '2026-01-01' })).toEqual({
      dueOn: '2029-07-01',
      stage: 'booster',
    });
  });

  it('falls back to the booster interval for an adult with no birth date', () => {
    expect(nextVaccinationDue(combined, { history: ['2025-05-10'] })).toEqual({
      dueOn: '2028-05-10',
      stage: 'booster',
    });
  });

  it('returns a date in the past rather than hiding an overdue dose', () => {
    const due = nextVaccinationDue(combined, { history: ['2019-01-01'] });
    expect(due?.dueOn).toBe('2022-01-01');
  });

  it('ignores the order the history arrives in', () => {
    const jumbled = ['2026-03-26', '2026-02-26'];
    expect(nextVaccinationDue(combined, { history: jumbled, birthDate: '2026-01-01' })).toEqual({
      dueOn: '2026-04-23',
      stage: 'primary_final',
    });
  });
});

describe('isPrimaryCourseComplete', () => {
  it('is false part way through the plan', () => {
    expect(
      isPrimaryCourseComplete(combined, { history: ['2026-02-26'], birthDate: '2026-01-01' }),
    ).toBe(false);
  });

  it('is true once every planned dose is recorded', () => {
    const history = ['2026-02-26', '2026-03-26', '2026-04-23', '2026-07-01'];
    expect(isPrimaryCourseComplete(combined, { history, birthDate: '2026-01-01' })).toBe(true);
  });
});
