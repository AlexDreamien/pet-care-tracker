/**
 * Two kinds of recurrence, and they are not interchangeable.
 *
 * `fixed_calendar` repeats on a grid anchored to a date: an annual booster is due every
 * March whether or not last March's was given on time. `after_completion` repeats from
 * the moment the thing was actually done: a wormer given three weeks late pushes the next
 * one three weeks out, because what protects the animal is the interval since the last
 * dose, not the interval since a plan was made.
 *
 * Modelling antiparasitic treatment or a nail trim as `fixed_calendar` silently produces
 * a schedule that is wrong in exactly the cases where it matters.
 */

import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  compareDates,
  diffDays,
  type IsoDate,
  isAfter,
} from './date';

export type RecurrenceUnit = 'day' | 'week' | 'month' | 'year';

export interface FixedCalendarRule {
  kind: 'fixed_calendar';
  interval: number;
  unit: RecurrenceUnit;
  /** The first occurrence of the series. */
  anchor: IsoDate;
  /** Inclusive last date the series may reach. */
  until?: IsoDate | undefined;
  /** Total number of occurrences, counting the anchor. */
  count?: number | undefined;
}

export interface AfterCompletionRule {
  kind: 'after_completion';
  interval: number;
  unit: RecurrenceUnit;
  /** When the first one is due, before anything has been completed. */
  anchor: IsoDate;
  until?: IsoDate | undefined;
}

export type RecurrenceRule = FixedCalendarRule | AfterCompletionRule;

/** Guards against an expansion that would run away over a wide window. */
const MAX_OCCURRENCES = 1000;

const APPROXIMATE_DAYS_PER_UNIT: Record<RecurrenceUnit, number> = {
  day: 1,
  week: 7,
  month: 30.436875,
  year: 365.2425,
};

export function addInterval(date: IsoDate, interval: number, unit: RecurrenceUnit): IsoDate {
  switch (unit) {
    case 'day':
      return addDays(date, interval);
    case 'week':
      return addWeeks(date, interval);
    case 'month':
      return addMonths(date, interval);
    case 'year':
      return addYears(date, interval);
  }
}

function assertValid(rule: RecurrenceRule): void {
  if (!Number.isInteger(rule.interval) || rule.interval < 1) {
    throw new RangeError(`recurrence interval must be a positive integer: ${rule.interval}`);
  }
  if (rule.kind === 'fixed_calendar' && rule.count !== undefined && rule.count < 1) {
    throw new RangeError(`recurrence count must be at least 1: ${rule.count}`);
  }
}

/**
 * The `index`-th occurrence of a fixed-calendar series, counting the anchor as zero.
 *
 * Each occurrence is computed from the anchor rather than from its predecessor. Stepping
 * one interval at a time would let end-of-month clamping accumulate: a series anchored on
 * 31 January would walk 28 February, 28 March, 28 April and never return to the 31st.
 */
export function occurrenceAt(rule: FixedCalendarRule, index: number): IsoDate {
  assertValid(rule);
  if (index < 0) throw new RangeError(`occurrence index must not be negative: ${index}`);
  return addInterval(rule.anchor, rule.interval * index, rule.unit);
}

function withinBounds(rule: RecurrenceRule, date: IsoDate, index: number): boolean {
  if (rule.until !== undefined && isAfter(date, rule.until)) return false;
  if (rule.kind === 'fixed_calendar' && rule.count !== undefined && index >= rule.count) {
    return false;
  }
  return true;
}

/** The lowest occurrence index whose date is on or after `from`, without walking from zero. */
function firstIndexOnOrAfter(rule: FixedCalendarRule, from: IsoDate): number {
  const stepDays = rule.interval * APPROXIMATE_DAYS_PER_UNIT[rule.unit];
  const estimate = Math.floor(diffDays(rule.anchor, from) / stepDays) - 2;

  let index = Math.max(0, estimate);
  while (index > 0 && compareDates(occurrenceAt(rule, index), from) >= 0) index -= 1;
  while (compareDates(occurrenceAt(rule, index), from) < 0) index += 1;
  return index;
}

/**
 * When the next one is due.
 *
 * `lastCompletedOn` is the date the event was last marked done, if ever. For a
 * fixed-calendar series it only moves the cursor along an existing grid; for an
 * after-completion series it *is* the schedule.
 */
export function nextDue(rule: RecurrenceRule, lastCompletedOn?: IsoDate): IsoDate | null {
  assertValid(rule);

  if (rule.kind === 'after_completion') {
    const due =
      lastCompletedOn === undefined
        ? rule.anchor
        : addInterval(lastCompletedOn, rule.interval, rule.unit);
    return withinBounds(rule, due, 0) ? due : null;
  }

  if (lastCompletedOn === undefined) {
    return withinBounds(rule, rule.anchor, 0) ? rule.anchor : null;
  }

  const index = firstIndexOnOrAfter(rule, addDays(lastCompletedOn, 1));
  const due = occurrenceAt(rule, index);
  return withinBounds(rule, due, index) ? due : null;
}

/**
 * Where the series goes once an occurrence is marked done.
 *
 * `scheduledFor` is the date the completed occurrence was planned for. A fixed-calendar
 * series continues on its own grid from that date, so doing a checkup a fortnight early
 * does not pull the whole series forward; an after-completion series restarts from the
 * day the work actually happened.
 */
export function advanceOnCompletion(
  rule: RecurrenceRule,
  completion: { completedOn: IsoDate; scheduledFor: IsoDate },
): IsoDate | null {
  assertValid(rule);

  if (rule.kind === 'after_completion') {
    const due = addInterval(completion.completedOn, rule.interval, rule.unit);
    return withinBounds(rule, due, 0) ? due : null;
  }

  const index = firstIndexOnOrAfter(rule, addDays(completion.scheduledFor, 1));
  const due = occurrenceAt(rule, index);
  return withinBounds(rule, due, index) ? due : null;
}

/**
 * Every occurrence in `[from, to]`.
 *
 * An after-completion rule yields at most one date: an interval measured from a
 * completion that has not happened yet cannot be projected further without inventing when
 * the owner will get round to it.
 */
export function occurrencesBetween(
  rule: RecurrenceRule,
  from: IsoDate,
  to: IsoDate,
  options: { lastCompletedOn?: IsoDate | undefined } = {},
): IsoDate[] {
  assertValid(rule);
  if (compareDates(from, to) > 0) return [];

  if (rule.kind === 'after_completion') {
    const due = nextDue(rule, options.lastCompletedOn);
    if (due === null) return [];
    return compareDates(due, from) >= 0 && compareDates(due, to) <= 0 ? [due] : [];
  }

  const dates: IsoDate[] = [];
  let index = firstIndexOnOrAfter(rule, from);

  while (dates.length < MAX_OCCURRENCES) {
    const date = occurrenceAt(rule, index);
    if (compareDates(date, to) > 0) break;
    if (!withinBounds(rule, date, index)) break;
    dates.push(date);
    index += 1;
  }

  return dates;
}

export function isOverdue(dueOn: IsoDate, today: IsoDate): boolean {
  return compareDates(dueOn, today) < 0;
}

/** Negative when the date is already past. */
export function daysUntil(dueOn: IsoDate, today: IsoDate): number {
  return diffDays(today, dueOn);
}

/**
 * Describes a rule in the units the interface shows, without committing to a language.
 * The web layer turns this into text; pluralisation is not the core's business.
 */
export function describeRule(rule: RecurrenceRule): {
  kind: RecurrenceRule['kind'];
  interval: number;
  unit: RecurrenceUnit;
} {
  return { kind: rule.kind, interval: rule.interval, unit: rule.unit };
}
