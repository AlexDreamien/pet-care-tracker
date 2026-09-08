import { describe, expect, it } from 'vitest';
import { doseProgress, expandMedicationCourse } from '../src/medication';

describe('expandMedicationCourse', () => {
  it('produces every dose of a fixed course', () => {
    const doses = expandMedicationCourse({
      startsOn: '2026-09-08',
      endsOn: '2026-09-10',
      timesPerDay: 2,
    });

    expect(doses).toHaveLength(6);
    expect(doses.slice(0, 3)).toEqual([
      { dueOn: '2026-09-08', sequence: 1 },
      { dueOn: '2026-09-08', sequence: 2 },
      { dueOn: '2026-09-09', sequence: 1 },
    ]);
  });

  it('counts both end days', () => {
    expect(
      expandMedicationCourse({ startsOn: '2026-09-08', endsOn: '2026-09-08', timesPerDay: 1 }),
    ).toEqual([{ dueOn: '2026-09-08', sequence: 1 }]);
  });

  it('gives an open-ended course no checklist', () => {
    // A checklist that never ends would fill the agenda for ever.
    expect(expandMedicationCourse({ startsOn: '2026-09-08', timesPerDay: 3 })).toEqual([]);
  });

  it('gives an inverted range no doses', () => {
    expect(
      expandMedicationCourse({ startsOn: '2026-09-10', endsOn: '2026-09-08', timesPerDay: 1 }),
    ).toEqual([]);
  });

  it('caps a course that would run for years', () => {
    const doses = expandMedicationCourse({
      startsOn: '2026-01-01',
      endsOn: '2030-01-01',
      timesPerDay: 1,
    });
    expect(doses).toHaveLength(365);
  });

  it('rejects a nonsensical frequency', () => {
    expect(() =>
      expandMedicationCourse({ startsOn: '2026-09-08', endsOn: '2026-09-10', timesPerDay: 0 }),
    ).toThrow(/positive integer/);
  });
});

describe('doseProgress', () => {
  it('separates taken, missed and still to come', () => {
    const progress = doseProgress(
      [
        { dueOn: '2026-09-06', takenAt: '2026-09-06T09:00:00Z' },
        { dueOn: '2026-09-07', takenAt: null },
        { dueOn: '2026-09-08', takenAt: null },
        { dueOn: '2026-09-09', takenAt: null },
      ],
      '2026-09-08',
    );

    expect(progress).toEqual({ total: 4, taken: 1, missed: 1, remaining: 3 });
  });

  it('does not call a dose due today missed yet', () => {
    const progress = doseProgress([{ dueOn: '2026-09-08', takenAt: null }], '2026-09-08');
    expect(progress.missed).toBe(0);
  });
});
