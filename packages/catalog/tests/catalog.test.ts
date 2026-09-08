import { describe, expect, it } from 'vitest';
import { nextVaccinationDue, planPrimaryCourse } from '@pet-care-tracker/core';
import {
  BCS_SCALES,
  findParasiteProtocol,
  findVaccine,
  PARASITE_PROTOCOLS,
  parasiteProtocolsFor,
  VACCINES,
  vaccinesFor,
} from '../src/index';

describe('lookup', () => {
  it('returns the defaults for a supported species', () => {
    expect(vaccinesFor('dog').map((v) => v.code)).toContain('rabies');
    expect(vaccinesFor('cat').map((v) => v.code)).toContain('fvrcp');
    expect(parasiteProtocolsFor('cat').map((p) => p.code)).toEqual([
      'internal_routine',
      'external_routine',
    ]);
  });

  it('offers nothing for a species without published guidance', () => {
    // Better an empty list than a dog's schedule applied to a rabbit.
    expect(vaccinesFor('other')).toEqual([]);
    expect(parasiteProtocolsFor('other')).toEqual([]);
  });

  it('finds an entry by species and code, and nothing across species', () => {
    expect(findVaccine('dog', 'dhppi')?.core).toBe(true);
    expect(findVaccine('cat', 'dhppi')).toBeNull();
    expect(findParasiteProtocol('dog', 'internal_routine')?.target).toBe('internal');
  });
});

describe('every definition is internally consistent', () => {
  it('has a course that can terminate and a sane booster interval', () => {
    for (const vaccine of VACCINES) {
      const course = vaccine.primaryCourse;
      expect(course.completeByAgeWeeks).toBeGreaterThanOrEqual(course.startAgeWeeks);
      expect(course.intervalWeeks).toBeGreaterThan(0);
      expect(vaccine.boosterInterval.interval).toBeGreaterThan(0);
      expect(vaccine.covers.length).toBeGreaterThan(0);
      expect(vaccine.guidance).not.toBe('');
    }
  });

  it('keeps codes unique within a species', () => {
    for (const species of ['dog', 'cat'] as const) {
      const codes = vaccinesFor(species).map((v) => v.code);
      expect(new Set(codes).size).toBe(codes.length);
    }
  });

  it('orders antiparasitic juvenile phases by increasing age', () => {
    for (const protocol of PARASITE_PROTOCOLS) {
      const ages = protocol.juvenile.map((phase) => phase.untilAgeMonths);
      expect([...ages].sort((a, b) => a - b)).toEqual(ages);
      expect(protocol.adult.interval).toBeGreaterThan(0);
    }
  });

  it('produces a finite plan for every vaccine', () => {
    for (const vaccine of VACCINES) {
      const plan = planPrimaryCourse(vaccine, '2026-01-01');
      expect(plan.length).toBeGreaterThan(0);
      expect(plan.length).toBeLessThanOrEqual(6);
      expect(plan.at(-1)?.stage).toMatch(/primary_final|first_booster/);
    }
  });
});

describe('a worked example', () => {
  it('schedules a puppy born on new year through its first year', () => {
    const dhppi = findVaccine('dog', 'dhppi');
    expect(dhppi).not.toBeNull();

    const plan = planPrimaryCourse(dhppi!, '2026-01-01');
    expect(plan.map((dose) => dose.dueOn)).toEqual([
      '2026-02-26',
      '2026-03-26',
      '2026-04-23',
      '2026-07-01',
    ]);

    const afterTheCourse = nextVaccinationDue(dhppi!, {
      history: plan.map((dose) => dose.dueOn),
      birthDate: '2026-01-01',
    });
    expect(afterTheCourse).toEqual({ dueOn: '2029-07-01', stage: 'booster' });
  });
});

describe('body condition scales', () => {
  it('covers all nine points for both species', () => {
    for (const species of ['dog', 'cat'] as const) {
      const scale = BCS_SCALES[species];
      expect(scale).toHaveLength(9);
      expect(scale.filter((level) => level.meaning === 'ideal').map((l) => l.score)).toEqual([
        4, 5,
      ]);
      expect(scale[0]?.labelKey).toBe(`bcs.${species}.1`);
    }
  });
});
