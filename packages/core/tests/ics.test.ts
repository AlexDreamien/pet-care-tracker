import { describe, expect, it } from 'vitest';
import {
  buildCalendar,
  buildRrule,
  buildTrigger,
  canExpressAsRrule,
  escapeText,
  foldLine,
  formatIcsDate,
  formatIcsInstant,
  unfold,
  type CalendarEvent,
} from '../src/ics';
import type { AfterCompletionRule, FixedCalendarRule } from '../src/recurrence';

const now = new Date('2026-09-08T10:30:00Z');
const window = { from: '2026-01-01', to: '2027-01-01' };
const options = { name: 'Pets', now, window };

describe('escapeText', () => {
  it('escapes the characters that carry meaning in a TEXT value', () => {
    expect(escapeText('a,b;c\\d')).toBe('a\\,b\\;c\\\\d');
    expect(escapeText('line one\nline two')).toBe('line one\\nline two');
    expect(escapeText('carriage\r\nreturn')).toBe('carriage\\nreturn');
  });

  it('escapes the backslash before anything else, not after', () => {
    expect(escapeText('\\;')).toBe('\\\\\\;');
  });
});

describe('foldLine', () => {
  it('leaves a short line alone', () => {
    expect(foldLine('SUMMARY:short')).toBe('SUMMARY:short');
  });

  it('folds at 75 octets with a leading space on continuations', () => {
    const line = `SUMMARY:${'a'.repeat(100)}`;
    const folded = foldLine(line);
    const parts = folded.split('\r\n');
    expect(parts[0]).toHaveLength(75);
    expect(parts[1]?.startsWith(' ')).toBe(true);
    // Unfolding must give back exactly what went in.
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });

  it('counts octets, not characters, so Cyrillic folds at the right place', () => {
    // Two bytes per letter: 60 characters is 120 octets and must fold.
    const line = `SUMMARY:${'ф'.repeat(60)}`;
    const encoder = new TextEncoder();
    for (const part of foldLine(line).split('\r\n')) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
  });

  it('never splits a multi-byte character', () => {
    const line = `SUMMARY:${'я'.repeat(60)}`;
    for (const part of foldLine(line).split('\r\n')) {
      expect(part).not.toMatch(/�/);
    }
    expect(foldLine(line).replace(/\r\n /g, '')).toBe(line);
  });
});

describe('date and instant formatting', () => {
  it('writes DATE and UTC DATE-TIME forms', () => {
    expect(formatIcsDate('2026-09-08')).toBe('20260908');
    expect(formatIcsInstant(new Date('2026-09-08T10:30:00Z'))).toBe('20260908T103000Z');
    expect(formatIcsInstant('2026-01-02T03:04:05Z')).toBe('20260102T030405Z');
  });

  it('refuses an unparseable instant', () => {
    expect(() => formatIcsInstant('not a date')).toThrow(/valid instant/);
  });
});

describe('canExpressAsRrule', () => {
  const monthlyOn: (day: string) => FixedCalendarRule = (day) => ({
    kind: 'fixed_calendar',
    interval: 1,
    unit: 'month',
    anchor: `2026-01-${day}`,
  });

  it('accepts daily and weekly rules whatever the anchor', () => {
    expect(canExpressAsRrule({ ...monthlyOn('31'), unit: 'week' })).toBe(true);
    expect(canExpressAsRrule({ ...monthlyOn('31'), unit: 'day' })).toBe(true);
  });

  it('accepts a monthly rule anchored on or before the 28th', () => {
    expect(canExpressAsRrule(monthlyOn('28'))).toBe(true);
  });

  it('refuses a monthly rule anchored after the 28th', () => {
    // RFC 5545 skips a month that has no 31st; this application clamps to the 30th. An
    // RRULE would hand the calendar a different schedule from the one shown in the app.
    expect(canExpressAsRrule(monthlyOn('31'))).toBe(false);
    expect(canExpressAsRrule(monthlyOn('29'))).toBe(false);
  });

  it('refuses an after-completion rule', () => {
    const rule: AfterCompletionRule = {
      kind: 'after_completion',
      interval: 3,
      unit: 'month',
      anchor: '2026-03-01',
    };
    expect(canExpressAsRrule(rule)).toBe(false);
  });
});

describe('buildRrule', () => {
  it('omits INTERVAL when it is one', () => {
    expect(
      buildRrule({ kind: 'fixed_calendar', interval: 1, unit: 'year', anchor: '2026-03-01' }),
    ).toBe('RRULE:FREQ=YEARLY');
  });

  it('carries interval, count and until', () => {
    expect(
      buildRrule({
        kind: 'fixed_calendar',
        interval: 3,
        unit: 'month',
        anchor: '2026-03-01',
        count: 4,
        until: '2027-03-01',
      }),
    ).toBe('RRULE:FREQ=MONTHLY;INTERVAL=3;COUNT=4;UNTIL=20270301');
  });
});

describe('buildTrigger', () => {
  it('expresses the lead time in hours so the alarm lands in daylight', () => {
    // Two days before at 09:00, from a midnight start, is 39 hours earlier.
    expect(buildTrigger({ leadDays: 2, hour: 9, description: 'x' })).toBe('TRIGGER:-PT39H');
    expect(buildTrigger({ leadDays: 1, hour: 9, description: 'x' })).toBe('TRIGGER:-PT15H');
  });

  it('fires at the start when the lead time works out to nothing', () => {
    expect(buildTrigger({ leadDays: 0, hour: 9, description: 'x' })).toBe('TRIGGER:PT0S');
  });
});

describe('buildCalendar', () => {
  const allDay: CalendarEvent = {
    uid: 'event-1',
    summary: 'Барсик: прививка',
    start: { kind: 'date', date: '2026-03-01' },
  };

  it('appends the domain to every UID', () => {
    expect(unfold(buildCalendar([allDay], options))).toContain('UID:event-1@pet-care-tracker');
  });

  it('wraps events in a VCALENDAR with CRLF endings', () => {
    const document = buildCalendar([allDay], options);
    expect(document.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(document.endsWith('END:VCALENDAR\r\n')).toBe(true);
    expect(document).toContain('VERSION:2.0');
    expect(document).toContain('PRODID:-//pet-care-tracker//EN');
  });

  it('gives an all-day event an exclusive end on the following day', () => {
    const lines = unfold(buildCalendar([allDay], options));
    expect(lines).toContain('DTSTART;VALUE=DATE:20260301');
    expect(lines).toContain('DTEND;VALUE=DATE:20260302');
  });

  it('stamps every event with the generation time', () => {
    expect(unfold(buildCalendar([allDay], options))).toContain('DTSTAMP:20260908T103000Z');
  });

  it('writes a timed appointment in UTC with its duration', () => {
    const appointment: CalendarEvent = {
      uid: 'event-2',
      summary: 'Vet',
      start: { kind: 'instant', instant: '2026-03-01T13:00:00Z', durationMinutes: 45 },
    };
    const lines = unfold(buildCalendar([appointment], options));
    expect(lines).toContain('DTSTART:20260301T130000Z');
    expect(lines).toContain('DTEND:20260301T134500Z');
  });

  it('emits an RRULE for a rule that survives the translation', () => {
    const yearly: CalendarEvent = {
      ...allDay,
      recurrence: { kind: 'fixed_calendar', interval: 1, unit: 'year', anchor: '2026-03-01' },
    };
    const lines = unfold(buildCalendar([yearly], options));
    expect(lines).toContain('RRULE:FREQ=YEARLY');
    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(1);
  });

  it('writes out dated occurrences when a rule cannot be an RRULE', () => {
    const monthlyFromThe31st: CalendarEvent = {
      uid: 'event-3',
      summary: 'Nail trim',
      start: { kind: 'date', date: '2026-01-31' },
      recurrence: {
        kind: 'fixed_calendar',
        interval: 1,
        unit: 'month',
        anchor: '2026-01-31',
        until: '2026-04-30',
      },
    };
    const lines = unfold(
      buildCalendar([monthlyFromThe31st], {
        ...options,
        window: { from: '2026-01-01', to: '2026-06-01' },
      }),
    );

    expect(lines.filter((line) => line === 'BEGIN:VEVENT')).toHaveLength(4);
    expect(lines).toContain('DTSTART;VALUE=DATE:20260228');
    expect(lines).toContain('DTSTART;VALUE=DATE:20260331');
    expect(lines).not.toContain('RRULE:FREQ=MONTHLY');
  });

  it('gives each written-out occurrence its own UID', () => {
    const wormer: CalendarEvent = {
      uid: 'parasite-1',
      summary: 'Wormer',
      start: { kind: 'date', date: '2026-03-01' },
      recurrence: { kind: 'after_completion', interval: 3, unit: 'month', anchor: '2026-03-01' },
    };
    const lines = unfold(buildCalendar([wormer], options));
    const uids = lines.filter((line) => line.startsWith('UID:'));
    expect(uids).toEqual(['UID:parasite-1-20260301@pet-care-tracker']);
  });

  it('attaches an alarm when one is configured', () => {
    const lines = unfold(
      buildCalendar(
        [{ ...allDay, alarm: { leadDays: 2, hour: 9, description: 'Скоро' } }],
        options,
      ),
    );
    expect(lines).toContain('BEGIN:VALARM');
    expect(lines).toContain('ACTION:DISPLAY');
    expect(lines).toContain('TRIGGER:-PT39H');
    expect(lines).toContain('DESCRIPTION:Скоро');
  });

  it('escapes a summary containing punctuation', () => {
    const tricky: CalendarEvent = {
      ...allDay,
      summary: 'Барсик: прививка, ревакцинация; см. паспорт',
    };
    expect(unfold(buildCalendar([tricky], options))).toContain(
      'SUMMARY:Барсик: прививка\\, ревакцинация\\; см. паспорт',
    );
  });
});
