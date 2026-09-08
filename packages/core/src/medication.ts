/**
 * Turning a medication course into the doses to tick off.
 *
 * "Twice a day for ten days" is easy to agree to at the clinic and easy to lose track of by
 * day four. Expanding the course into individual doses is what makes "did I give the
 * evening one?" answerable.
 */

import { addDays, compareDates, diffDays, type IsoDate } from './date';

export interface MedicationCourse {
  startsOn: IsoDate;
  /** Absent for an open-ended course, which gets no dose checklist. */
  endsOn?: IsoDate | undefined;
  timesPerDay: number;
}

export interface PlannedMedicationDose {
  dueOn: IsoDate;
  /** Which dose of that day, counting from one. */
  sequence: number;
}

/** A course longer than this is a standing treatment, not something to tick off daily. */
export const MAX_COURSE_DAYS = 365;

/**
 * Every dose of a course.
 *
 * An open-ended course returns nothing: generating a checklist that never ends would fill
 * the agenda for ever with items nobody agreed to.
 */
export function expandMedicationCourse(course: MedicationCourse): PlannedMedicationDose[] {
  if (course.endsOn === undefined) return [];
  if (compareDates(course.endsOn, course.startsOn) < 0) return [];
  if (!Number.isInteger(course.timesPerDay) || course.timesPerDay < 1) {
    throw new RangeError(`timesPerDay must be a positive integer: ${course.timesPerDay}`);
  }

  const days = Math.min(diffDays(course.startsOn, course.endsOn) + 1, MAX_COURSE_DAYS);
  const doses: PlannedMedicationDose[] = [];

  for (let day = 0; day < days; day += 1) {
    const dueOn = addDays(course.startsOn, day);
    for (let sequence = 1; sequence <= course.timesPerDay; sequence += 1) {
      doses.push({ dueOn, sequence });
    }
  }

  return doses;
}

export interface DoseProgress {
  total: number;
  taken: number;
  /** Doses due on or before today that have not been ticked. */
  missed: number;
  remaining: number;
}

export function doseProgress(
  doses: readonly { dueOn: IsoDate; takenAt: string | null }[],
  today: IsoDate,
): DoseProgress {
  const taken = doses.filter((dose) => dose.takenAt !== null).length;
  const missed = doses.filter(
    (dose) => dose.takenAt === null && compareDates(dose.dueOn, today) < 0,
  ).length;

  return { total: doses.length, taken, missed, remaining: doses.length - taken };
}
