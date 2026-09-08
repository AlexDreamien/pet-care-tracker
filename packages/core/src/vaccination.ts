/**
 * Turning a vaccination history into a next due date.
 *
 * Everything here computes over a `VaccineDefinition` supplied by the caller; the defaults
 * themselves live in `@pet-care-tracker/catalog`. A schedule produced here is a **reminder
 * default**, not a prescription: local law, the product leaflet and the veterinarian all
 * override it, and the interface must let the owner edit any date it proposes.
 */

import { type BirthDatePrecision, normaliseBirthDate } from './age';
import { addMonths, addWeeks, compareDates, type IsoDate, maxDate } from './date';
import { addInterval, type RecurrenceUnit } from './recurrence';
import type { Species } from './species';

export type DoseStage = 'primary' | 'primary_final' | 'first_booster' | 'booster';

export interface PrimaryCourse {
  /** Age at the first dose. */
  startAgeWeeks: number;
  /** Gap between doses of the primary series. */
  intervalWeeks: number;
  /** Doses repeat until the animal is at least this old. */
  completeByAgeWeeks: number;
  /** Age of the dose that closes the primary series, or `null` where guidance has none. */
  firstBoosterAgeMonths: number | null;
}

export interface VaccineDefinition {
  code: string;
  species: Species;
  /** Core vaccines are recommended for every animal; the rest depend on exposure. */
  core: boolean;
  /** Disease codes the vaccine covers; the web layer turns these into names. */
  covers: readonly string[];
  primaryCourse: PrimaryCourse;
  /** Interval between boosters once the primary series is complete. */
  boosterInterval: { interval: number; unit: RecurrenceUnit };
  /** Which published guidance the default follows. Shown next to any proposed date. */
  guidance: string;
}

export interface PlannedDose {
  dueOn: IsoDate;
  stage: DoseStage;
  /** Position in the primary plan, counting from zero. */
  index: number;
}

/** Stops a malformed definition from generating an unbounded plan. */
const MAX_PRIMARY_DOSES = 12;

/**
 * The primary series for an animal of known age: the first dose, the repeats up to the age
 * at which maternal antibodies stop interfering, and the dose that closes the series.
 */
export function planPrimaryCourse(
  definition: VaccineDefinition,
  birthDate: IsoDate,
  precision: BirthDatePrecision = 'exact',
): PlannedDose[] {
  const course = definition.primaryCourse;
  const start = normaliseBirthDate(birthDate, precision);
  const doses: PlannedDose[] = [];

  let ageWeeks = course.startAgeWeeks;
  while (doses.length < MAX_PRIMARY_DOSES) {
    const isFinal = ageWeeks >= course.completeByAgeWeeks;
    doses.push({
      dueOn: addWeeks(start, ageWeeks),
      stage: isFinal ? 'primary_final' : 'primary',
      index: doses.length,
    });
    if (isFinal) break;
    ageWeeks += course.intervalWeeks;
  }

  if (course.firstBoosterAgeMonths !== null) {
    doses.push({
      dueOn: addMonths(start, course.firstBoosterAgeMonths),
      stage: 'first_booster',
      index: doses.length,
    });
  }

  return doses;
}

export interface VaccinationContext {
  /** Dates already administered, in any order. */
  history: readonly IsoDate[];
  birthDate?: IsoDate | undefined;
  birthPrecision?: BirthDatePrecision | undefined;
  /** Lets an unvaccinated adult be told to start now rather than years ago. */
  today?: IsoDate | undefined;
}

/**
 * The planned dose the animal has not had yet.
 *
 * Chosen by date rather than by how many rows exist. Counting would misread the common
 * case of an adult whose owner entered only the latest booster: one record against a
 * four-dose puppy plan would look like a primary course still in progress, and the app
 * would propose a second puppy dose for a six-year-old dog.
 */
function nextPlannedDose(
  plan: readonly PlannedDose[],
  lastAdministered: IsoDate,
): PlannedDose | null {
  return plan.find((dose) => compareDates(dose.dueOn, lastAdministered) > 0) ?? null;
}

/**
 * When the next dose is due.
 *
 * Returns `null` only when there is nothing to compute from — no history and no birth
 * date. A date already in the past is otherwise returned as it stands: overdue is a state
 * the interface needs to show, not an error.
 */
export function nextVaccinationDue(
  definition: VaccineDefinition,
  context: VaccinationContext,
): { dueOn: IsoDate; stage: DoseStage } | null {
  const history = [...context.history].sort(compareDates);
  const last = history[history.length - 1];

  const plan =
    context.birthDate === undefined
      ? []
      : planPrimaryCourse(definition, context.birthDate, context.birthPrecision ?? 'exact');

  if (last === undefined) {
    const first = plan[0];
    // Without a birth date and without a history there is no anchor to schedule from.
    if (!first) return null;

    const lastPlanned = plan[plan.length - 1] as PlannedDose;
    // An adult that has never been vaccinated starts the course now, not in the year it
    // was born.
    if (context.today !== undefined && compareDates(lastPlanned.dueOn, context.today) < 0) {
      return { dueOn: context.today, stage: 'primary' };
    }
    return { dueOn: first.dueOn, stage: first.stage };
  }

  const planned = nextPlannedDose(plan, last);
  if (planned) {
    // An age-based dose keeps its age; a repeat of the primary series must also respect
    // the minimum gap, so a course started late does not bunch its doses together.
    const dueOn =
      planned.stage === 'first_booster'
        ? planned.dueOn
        : maxDate(planned.dueOn, addWeeks(last, definition.primaryCourse.intervalWeeks));
    return { dueOn, stage: planned.stage };
  }

  return {
    dueOn: addInterval(last, definition.boosterInterval.interval, definition.boosterInterval.unit),
    stage: 'booster',
  };
}

/** Whether the animal is past every dose of the primary series. */
export function isPrimaryCourseComplete(
  definition: VaccineDefinition,
  context: VaccinationContext,
): boolean {
  const history = [...context.history].sort(compareDates);
  const last = history[history.length - 1];
  if (last === undefined) return false;
  if (context.birthDate === undefined) return true;

  const plan = planPrimaryCourse(definition, context.birthDate, context.birthPrecision ?? 'exact');
  return nextPlannedDose(plan, last) === null;
}
