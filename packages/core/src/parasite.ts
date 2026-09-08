/**
 * Antiparasitic treatment.
 *
 * Kept apart from vaccination because it behaves differently: the cadence is short, it
 * runs from the last dose rather than from a calendar grid, and it tightens while the
 * animal is young. Like vaccination, everything here is a reminder default the owner and
 * the veterinarian override.
 */

import { ageInMonths, type BirthDatePrecision, normaliseBirthDate } from './age';
import { addWeeks, type IsoDate, maxDate } from './date';
import { addInterval, type AfterCompletionRule, type RecurrenceUnit } from './recurrence';
import type { Species } from './species';

export type ParasiteTarget = 'internal' | 'external' | 'both';

export interface ParasiteInterval {
  interval: number;
  unit: RecurrenceUnit;
}

export interface ParasiteProtocol {
  code: string;
  species: Species;
  target: ParasiteTarget;
  /** Age at which treatment starts. */
  startAgeWeeks: number;
  /**
   * Tighter cadences while the animal is growing, ordered by increasing age. A puppy is
   * wormed fortnightly, then monthly, then falls back to the adult interval.
   */
  juvenile: readonly (ParasiteInterval & { untilAgeMonths: number })[];
  adult: ParasiteInterval;
  /** Which published guidance the default follows. */
  guidance: string;
}

export interface ParasiteContext {
  lastGivenOn?: IsoDate | undefined;
  birthDate?: IsoDate | undefined;
  birthPrecision?: BirthDatePrecision | undefined;
  today: IsoDate;
}

/** The cadence that applies at a given age; the first phase the animal has not outgrown. */
export function intervalForAge(protocol: ParasiteProtocol, ageMonths: number): ParasiteInterval {
  for (const phase of protocol.juvenile) {
    if (ageMonths < phase.untilAgeMonths) return { interval: phase.interval, unit: phase.unit };
  }
  return protocol.adult;
}

/**
 * When the next treatment is due.
 *
 * With no history the answer is "now" for an animal already old enough, and the start age
 * for one that is not — an adult rescue arriving without records needs treating today, not
 * on some anniversary it does not have.
 */
export function nextParasiteDue(
  protocol: ParasiteProtocol,
  context: ParasiteContext,
): { dueOn: IsoDate; interval: ParasiteInterval } {
  const ageAt = (date: IsoDate): number =>
    context.birthDate === undefined
      ? Number.POSITIVE_INFINITY
      : ageInMonths(context.birthDate, context.birthPrecision ?? 'exact', date);

  if (context.lastGivenOn === undefined) {
    const earliest =
      context.birthDate === undefined
        ? context.today
        : maxDate(
            addWeeks(
              normaliseBirthDate(context.birthDate, context.birthPrecision ?? 'exact'),
              protocol.startAgeWeeks,
            ),
            context.today,
          );
    return { dueOn: earliest, interval: intervalForAge(protocol, ageAt(earliest)) };
  }

  const interval = intervalForAge(protocol, ageAt(context.lastGivenOn));
  return {
    dueOn: addInterval(context.lastGivenOn, interval.interval, interval.unit),
    interval,
  };
}

/**
 * The protocol expressed as a recurrence rule, so the calendar schedules antiparasitic
 * treatment through the same machinery as everything else — and inherits the
 * after-completion behaviour, which is the whole point.
 */
export function toRecurrenceRule(
  protocol: ParasiteProtocol,
  context: ParasiteContext,
): AfterCompletionRule {
  const { dueOn, interval } = nextParasiteDue(protocol, context);
  return {
    kind: 'after_completion',
    interval: interval.interval,
    unit: interval.unit,
    anchor: dueOn,
  };
}
