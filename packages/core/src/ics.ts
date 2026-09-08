/**
 * iCalendar output, per RFC 5545.
 *
 * This is the channel reminders actually arrive through. A subscribed calendar keeps
 * working when the application has not been opened for six months, on a phone that never
 * granted a notification permission, which no amount of web push can promise.
 *
 * Pure string generation: no I/O, and the current instant arrives as a parameter.
 */

import { addDays, type IsoDate, parseDate } from './date';
import { occurrencesBetween, type RecurrenceRule, type RecurrenceUnit } from './recurrence';

const CRLF = '\r\n';
const PRODID = '-//pet-care-tracker//EN';

export interface CalendarAlarm {
  /** Days before the event the reminder fires. */
  leadDays: number;
  /** Hour of the day, 0–23, the reminder fires on that earlier day. */
  hour: number;
  description: string;
}

export type CalendarStart =
  { kind: 'date'; date: IsoDate } | { kind: 'instant'; instant: string; durationMinutes: number };

export interface CalendarEvent {
  /**
   * Stable across regenerations: a calendar client uses it to update rather than
   * duplicate. The domain is appended by `buildCalendar`, so this is the local part only.
   */
  uid: string;
  summary: string;
  description?: string | undefined;
  location?: string | undefined;
  start: CalendarStart;
  recurrence?: RecurrenceRule | undefined;
  alarm?: CalendarAlarm | undefined;
}

export interface CalendarOptions {
  name: string;
  /** Generation time, stamped on every event. */
  now: Date;
  /** Window used when a recurrence has to be written out as separate dated events. */
  window: { from: IsoDate; to: IsoDate };
  /** Appended to every UID, as RFC 5545 expects a globally unique identifier. */
  uidDomain?: string;
}

/** RFC 5545 §3.3.11: backslash, semicolon, comma and newline carry meaning in TEXT values. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r\n|\r|\n/g, '\\n');
}

/**
 * RFC 5545 §3.1: content lines are folded at 75 **octets**, with continuation lines
 * beginning with a single space that counts towards the next line's budget.
 *
 * Counting octets rather than characters is what keeps Cyrillic summaries — two bytes per
 * letter — from producing lines twice the legal length, and iterating by code point keeps a
 * fold from landing inside a character.
 */
export function foldLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let current = '';
  let bytes = 0;
  let limit = 75;

  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > limit) {
      parts.push(current);
      current = '';
      bytes = 0;
      limit = 74; // the leading space of a continuation line counts
    }
    current += char;
    bytes += size;
  }
  parts.push(current);

  return parts.map((part, index) => (index === 0 ? part : ` ${part}`)).join(CRLF);
}

function pad(value: number, width = 2): string {
  return String(value).padStart(width, '0');
}

/** `YYYYMMDD`, the DATE form. */
export function formatIcsDate(date: IsoDate): string {
  const { year, month, day } = parseDate(date);
  return `${pad(year, 4)}${pad(month)}${pad(day)}`;
}

/** `YYYYMMDDTHHMMSSZ`, the UTC DATE-TIME form. */
export function formatIcsInstant(instant: Date | string): string {
  const date = typeof instant === 'string' ? new Date(instant) : instant;
  if (Number.isNaN(date.getTime())) throw new RangeError(`not a valid instant: ${String(instant)}`);
  return (
    `${pad(date.getUTCFullYear(), 4)}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}` +
    `T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`
  );
}

const FREQUENCIES: Record<RecurrenceUnit, string> = {
  day: 'DAILY',
  week: 'WEEKLY',
  month: 'MONTHLY',
  year: 'YEARLY',
};

/**
 * Whether a rule can be written as an `RRULE` without changing what it means.
 *
 * Two rules cannot:
 *
 * - `after_completion`, because the interval runs from a completion that has not happened
 *   yet. There is no `RRULE` for "three months after you next get round to it".
 * - A monthly or yearly series anchored after the 28th. RFC 5545 **skips** an occurrence
 *   whose date does not exist — a monthly series from the 31st simply has no February —
 *   whereas this application clamps to the last day of the month. Emitting an `RRULE`
 *   would hand the calendar a different schedule from the one shown in the app.
 *
 * Both cases fall back to individually dated events, which are always faithful.
 */
export function canExpressAsRrule(rule: RecurrenceRule): boolean {
  if (rule.kind === 'after_completion') return false;
  if (rule.unit === 'day' || rule.unit === 'week') return true;
  // February is the binding constraint: on or before the 28th, every month has the day.
  return parseDate(rule.anchor).day <= 28;
}

export function buildRrule(rule: RecurrenceRule): string {
  const parts = [`FREQ=${FREQUENCIES[rule.unit]}`];
  if (rule.interval !== 1) parts.push(`INTERVAL=${rule.interval}`);
  if (rule.kind === 'fixed_calendar' && rule.count !== undefined) {
    parts.push(`COUNT=${rule.count}`);
  }
  if (rule.until !== undefined) parts.push(`UNTIL=${formatIcsDate(rule.until)}`);
  return `RRULE:${parts.join(';')}`;
}

/**
 * `TRIGGER` as a negative duration from the start.
 *
 * An all-day event starts at midnight, so "two days before at 09:00" is 39 hours earlier.
 * Expressing it in hours rather than as `-P2D` is what stops the reminder arriving in the
 * middle of the night.
 */
export function buildTrigger(alarm: CalendarAlarm): string {
  const hours = alarm.leadDays * 24 - alarm.hour;
  if (hours <= 0) return 'TRIGGER:PT0S';
  return `TRIGGER:-PT${hours}H`;
}

function alarmLines(alarm: CalendarAlarm): string[] {
  return [
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    buildTrigger(alarm),
    `DESCRIPTION:${escapeText(alarm.description)}`,
    'END:VALARM',
  ];
}

function eventLines(
  event: CalendarEvent,
  start: CalendarStart,
  uid: string,
  stamp: string,
  domain: string,
): string[] {
  const lines = ['BEGIN:VEVENT', `UID:${uid}@${domain}`, `DTSTAMP:${stamp}`];

  if (start.kind === 'date') {
    lines.push(`DTSTART;VALUE=DATE:${formatIcsDate(start.date)}`);
    // DTEND is exclusive, so a one-day event ends on the following day.
    lines.push(`DTEND;VALUE=DATE:${formatIcsDate(addDays(start.date, 1))}`);
  } else {
    const begins = new Date(start.instant);
    const ends = new Date(begins.getTime() + start.durationMinutes * 60_000);
    lines.push(`DTSTART:${formatIcsInstant(begins)}`);
    lines.push(`DTEND:${formatIcsInstant(ends)}`);
  }

  lines.push(`SUMMARY:${escapeText(event.summary)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
  if (event.location) lines.push(`LOCATION:${escapeText(event.location)}`);
  if (event.recurrence && canExpressAsRrule(event.recurrence)) {
    lines.push(buildRrule(event.recurrence));
  }
  if (event.alarm) lines.push(...alarmLines(event.alarm));

  lines.push('END:VEVENT');
  return lines;
}

/**
 * Expands one event into the `VEVENT`s it needs.
 *
 * A rule an `RRULE` can carry produces a single component; anything else is written out as
 * dated occurrences across the window, each with its own derived UID so a calendar client
 * can tell them apart.
 */
function expandEvent(
  event: CalendarEvent,
  options: CalendarOptions,
  stamp: string,
  domain: string,
): string[] {
  const { recurrence } = event;

  if (!recurrence || canExpressAsRrule(recurrence)) {
    return eventLines(event, event.start, event.uid, stamp, domain);
  }

  if (event.start.kind !== 'date') {
    // A timed appointment with an inexpressible rule keeps its single instance rather than
    // being silently multiplied at the wrong hour.
    return eventLines(event, event.start, event.uid, stamp, domain);
  }

  const dates = occurrencesBetween(recurrence, options.window.from, options.window.to);
  return dates.flatMap((date) =>
    eventLines(event, { kind: 'date', date }, `${event.uid}-${formatIcsDate(date)}`, stamp, domain),
  );
}

/** A complete `VCALENDAR` document, CRLF-terminated and folded. */
export function buildCalendar(events: readonly CalendarEvent[], options: CalendarOptions): string {
  const stamp = formatIcsInstant(options.now);
  const domain = options.uidDomain ?? 'pet-care-tracker';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${PRODID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.name)}`,
    ...events.flatMap((event) => expandEvent(event, options, stamp, domain)),
    'END:VCALENDAR',
  ];

  return lines.map(foldLine).join(CRLF) + CRLF;
}

/** Convenience for tests and debugging: the unfolded logical lines of a document. */
export function unfold(document: string): string[] {
  return document
    .replace(/\r\n[ \t]/g, '')
    .split(CRLF)
    .filter(Boolean);
}
