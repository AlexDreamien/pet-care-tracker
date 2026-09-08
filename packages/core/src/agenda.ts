/**
 * The one place scheduled events and derived due dates are merged.
 *
 * The application's agenda and the subscribed calendar feed both read from here. Two
 * implementations of this merge would let the calendar on a phone disagree with the screen
 * in the app about when the dog is due a wormer, and the owner would have no way to tell
 * which one was lying.
 *
 * Derived dates — a vaccination's next due, a document's expiry, an antiparasitic
 * interval — are computed, never stored as calendar rows. Materialising them produces
 * duplicates that outlive the record they came from.
 */

import { addDays, compareDates, isBefore, type IsoDate } from './date';
import type { CalendarAlarm, CalendarEvent } from './ics';
import { occurrencesBetween, type RecurrenceRule } from './recurrence';

export type AgendaSource =
  | 'event'
  | 'vaccination'
  | 'parasite_treatment'
  | 'document_expiry'
  | 'medication_dose'
  | 'food_low'
  | 'birthday';

export interface ScheduledEventInput {
  id: string;
  petId: string;
  petName: string;
  /** The `CareEvent` type, passed through for the interface to label and colour. */
  type: string;
  title: string;
  scheduledOn: IsoDate;
  /** UTC instant, for an appointment with a time of day. */
  instant?: string | undefined;
  durationMinutes?: number | undefined;
  recurrence?: RecurrenceRule | undefined;
  /** The most recent completion of the series. */
  lastCompletedOn?: IsoDate | undefined;
  location?: string | undefined;
  notes?: string | undefined;
}

export interface DerivedDueInput {
  id: string;
  petId: string;
  petName: string;
  source: Exclude<AgendaSource, 'event'>;
  title: string;
  dueOn: IsoDate;
  notes?: string | undefined;
}

export interface AgendaInput {
  events: readonly ScheduledEventInput[];
  derived: readonly DerivedDueInput[];
}

/** One logical thing that may recur, before expansion into dates. */
export interface AgendaSeries {
  key: string;
  source: AgendaSource;
  sourceId: string;
  petId: string;
  petName: string;
  type: string;
  title: string;
  start: IsoDate;
  instant?: string | undefined;
  durationMinutes?: number | undefined;
  recurrence?: RecurrenceRule | undefined;
  lastCompletedOn?: IsoDate | undefined;
  location?: string | undefined;
  notes?: string | undefined;
}

export interface AgendaItem {
  /** Stable across regenerations; used verbatim as the calendar UID. */
  key: string;
  source: AgendaSource;
  sourceId: string;
  petId: string;
  petName: string;
  type: string;
  title: string;
  date: IsoDate;
  instant?: string | undefined;
  durationMinutes?: number | undefined;
  location?: string | undefined;
  notes?: string | undefined;
  completed: boolean;
  overdue: boolean;
}

export interface AgendaWindow {
  from: IsoDate;
  to: IsoDate;
}

/**
 * Normalises both kinds of input into one list of series. This is the merge; everything
 * downstream is a projection of it.
 */
export function collectSeries(input: AgendaInput): AgendaSeries[] {
  const fromEvents = input.events.map<AgendaSeries>((event) => ({
    key: `event-${event.id}`,
    source: 'event',
    sourceId: event.id,
    petId: event.petId,
    petName: event.petName,
    type: event.type,
    title: event.title,
    start: event.scheduledOn,
    instant: event.instant,
    durationMinutes: event.durationMinutes,
    recurrence: event.recurrence,
    lastCompletedOn: event.lastCompletedOn,
    location: event.location,
    notes: event.notes,
  }));

  const fromDerived = input.derived.map<AgendaSeries>((due) => ({
    key: `${due.source}-${due.id}`,
    source: due.source,
    sourceId: due.id,
    petId: due.petId,
    petName: due.petName,
    type: due.source,
    title: due.title,
    start: due.dueOn,
    notes: due.notes,
  }));

  return [...fromEvents, ...fromDerived];
}

/**
 * How far back an unmet date is still worth carrying forward. Two years covers a lapsed
 * annual booster; beyond that the record, not the agenda, is the place to look.
 */
export const OVERDUE_LOOKBACK_DAYS = 730;

/**
 * Every date a series contributes to the window.
 *
 * Anything still owed from before the window is carried into it. An agenda that started at
 * today would hide exactly the things that need doing — a vaccination that lapsed in March
 * is not less due in September — and the screen would look reassuringly empty while being
 * wrong.
 *
 * A recurring series carries at most **one** overdue occurrence: a monthly chore skipped
 * since spring is one job to do, not six.
 */
function datesInWindow(series: AgendaSeries, window: AgendaWindow): IsoDate[] {
  if (!series.recurrence) {
    if (compareDates(series.start, window.to) > 0) return [];
    if (compareDates(series.start, window.from) >= 0) return [series.start];
    return isCompleted(series, series.start) ? [] : [series.start];
  }

  const inWindow = occurrencesBetween(series.recurrence, window.from, window.to, {
    lastCompletedOn: series.lastCompletedOn,
  });

  const earlier = occurrencesBetween(
    series.recurrence,
    addDays(window.from, -OVERDUE_LOOKBACK_DAYS),
    addDays(window.from, -1),
    { lastCompletedOn: series.lastCompletedOn },
  ).filter((date) => !isCompleted(series, date));

  const carried = earlier.length > 0 ? [earlier[earlier.length - 1] as IsoDate] : [];
  return [...carried, ...inWindow];
}

/**
 * An occurrence counts as done when the series has been completed on or after its date.
 * A recurring chore does not keep a tick per occurrence; the last completion is what the
 * record holds, and everything up to it is behind us.
 */
function isCompleted(series: AgendaSeries, date: IsoDate): boolean {
  return series.lastCompletedOn !== undefined && compareDates(date, series.lastCompletedOn) <= 0;
}

/** The merged, expanded, date-ordered agenda. */
export function buildAgenda(
  input: AgendaInput,
  window: AgendaWindow,
  today: IsoDate,
): AgendaItem[] {
  const items = collectSeries(input).flatMap((series) =>
    datesInWindow(series, window).map<AgendaItem>((date) => {
      const completed = isCompleted(series, date);
      return {
        key: series.recurrence ? `${series.key}@${date}` : series.key,
        source: series.source,
        sourceId: series.sourceId,
        petId: series.petId,
        petName: series.petName,
        type: series.type,
        title: series.title,
        date,
        instant: series.instant,
        durationMinutes: series.durationMinutes,
        location: series.location,
        notes: series.notes,
        completed,
        overdue: !completed && isBefore(date, today),
      };
    }),
  );

  return items.sort(
    (a, b) =>
      compareDates(a.date, b.date) ||
      a.petName.localeCompare(b.petName) ||
      a.title.localeCompare(b.title),
  );
}

export interface CalendarMappingOptions {
  /** Applied to every event; the household's reminder preference. */
  alarm?: CalendarAlarm | undefined;
}

/**
 * The same series, shaped for the calendar feed.
 *
 * Recurrence is handed to the iCalendar layer rather than expanded here, so a rule that
 * survives translation to an `RRULE` stays one compact component. The feed and the agenda
 * therefore describe the same schedule by construction.
 */
export function buildCalendarEvents(
  input: AgendaInput,
  options: CalendarMappingOptions = {},
): CalendarEvent[] {
  return collectSeries(input).map<CalendarEvent>((series) => ({
    uid: series.key,
    summary: `${series.petName}: ${series.title}`,
    description: series.notes,
    location: series.location,
    start:
      series.instant === undefined
        ? { kind: 'date', date: series.start }
        : {
            kind: 'instant',
            instant: series.instant,
            durationMinutes: series.durationMinutes ?? 60,
          },
    recurrence: series.recurrence,
    alarm: options.alarm,
  }));
}
