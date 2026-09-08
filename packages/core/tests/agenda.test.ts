import { describe, expect, it } from 'vitest';
import { buildAgenda, buildCalendarEvents, collectSeries, type AgendaInput } from '../src/agenda';
import { buildCalendar, formatIcsDate, unfold } from '../src/ics';

const today = '2026-09-08';
const window = { from: '2026-09-01', to: '2026-12-31' };

const input: AgendaInput = {
  events: [
    {
      id: 'e1',
      petId: 'p1',
      petName: 'Барсик',
      type: 'grooming',
      title: 'Груминг',
      scheduledOn: '2026-09-20',
    },
    {
      id: 'e2',
      petId: 'p1',
      petName: 'Барсик',
      type: 'nail_trim',
      title: 'Когти',
      scheduledOn: '2026-09-05',
      recurrence: {
        kind: 'fixed_calendar',
        interval: 1,
        unit: 'month',
        anchor: '2026-09-05',
      },
      lastCompletedOn: '2026-09-05',
    },
  ],
  derived: [
    {
      id: 'v1',
      petId: 'p1',
      petName: 'Барсик',
      source: 'vaccination',
      title: 'Бешенство',
      dueOn: '2026-09-02',
    },
    {
      id: 'd1',
      petId: 'p2',
      petName: 'Рекс',
      source: 'document_expiry',
      title: 'Ветпаспорт истекает',
      dueOn: '2026-11-15',
    },
  ],
};

describe('collectSeries', () => {
  it('normalises both kinds of input into one list', () => {
    const series = collectSeries(input);
    expect(series).toHaveLength(4);
    expect(series.map((s) => s.key)).toEqual([
      'event-e1',
      'event-e2',
      'vaccination-v1',
      'document_expiry-d1',
    ]);
  });
});

describe('buildAgenda', () => {
  it('merges events and derived dates in date order', () => {
    const items = buildAgenda(input, window, today);
    expect(items.map((item) => item.date)).toEqual([
      '2026-09-02',
      '2026-09-05',
      '2026-09-20',
      '2026-10-05',
      '2026-11-05',
      '2026-11-15',
      '2026-12-05',
    ]);
  });

  it('marks a past date overdue unless it has been completed', () => {
    const items = buildAgenda(input, window, today);
    const vaccination = items.find((item) => item.source === 'vaccination');
    const doneNailTrim = items.find((item) => item.date === '2026-09-05');

    expect(vaccination?.overdue).toBe(true);
    expect(doneNailTrim?.completed).toBe(true);
    expect(doneNailTrim?.overdue).toBe(false);
  });

  it('keeps a derived date out of the agenda when it falls outside the window', () => {
    const narrow = buildAgenda(input, { from: '2026-09-01', to: '2026-09-30' }, today);
    expect(narrow.some((item) => item.source === 'document_expiry')).toBe(false);
  });

  it('gives a recurring occurrence a key of its own', () => {
    const items = buildAgenda(input, window, today);
    const keys = items.filter((item) => item.sourceId === 'e2').map((item) => item.key);
    expect(keys).toEqual([
      'event-e2@2026-09-05',
      'event-e2@2026-10-05',
      'event-e2@2026-11-05',
      'event-e2@2026-12-05',
    ]);
  });

  it('yields a single date for an after-completion rule', () => {
    const wormer: AgendaInput = {
      events: [
        {
          id: 'e3',
          petId: 'p1',
          petName: 'Барсик',
          type: 'parasite_treatment',
          title: 'Глистогонное',
          scheduledOn: '2026-09-15',
          recurrence: {
            kind: 'after_completion',
            interval: 3,
            unit: 'month',
            anchor: '2026-09-15',
          },
        },
      ],
      derived: [],
    };
    expect(buildAgenda(wormer, window, today).map((item) => item.date)).toEqual(['2026-09-15']);
  });
});

describe('buildCalendarEvents', () => {
  it('produces one event per series, recurrence intact', () => {
    const events = buildCalendarEvents(input);
    expect(events).toHaveLength(4);
    expect(events[1]?.uid).toBe('event-e2');
    expect(events[1]?.recurrence?.kind).toBe('fixed_calendar');
  });

  it('prefixes the summary with the pet, so a shared calendar is readable', () => {
    expect(buildCalendarEvents(input)[0]?.summary).toBe('Барсик: Груминг');
  });

  it('carries the household alarm onto every event', () => {
    const alarm = { leadDays: 2, hour: 9, description: 'Напоминание' };
    expect(buildCalendarEvents(input, { alarm }).every((event) => event.alarm === alarm)).toBe(
      true,
    );
  });
});

describe('the agenda and the calendar cannot disagree', () => {
  it('writes exactly the agenda dates when a rule has to be expanded', () => {
    // A monthly series from the 31st is the case where an RRULE would say something
    // different, so it is written out — and it must be written out to the same dates the
    // application shows.
    const fromThe31st: AgendaInput = {
      events: [
        {
          id: 'e4',
          petId: 'p1',
          petName: 'Барсик',
          type: 'nail_trim',
          title: 'Когти',
          scheduledOn: '2026-01-31',
          recurrence: {
            kind: 'fixed_calendar',
            interval: 1,
            unit: 'month',
            anchor: '2026-01-31',
          },
        },
      ],
      derived: [],
    };
    const wide = { from: '2026-01-01', to: '2026-06-30' };

    const agendaDates = buildAgenda(fromThe31st, wide, today).map((item) => item.date);
    const document = buildCalendar(buildCalendarEvents(fromThe31st), {
      name: 'Pets',
      now: new Date('2026-09-08T10:30:00Z'),
      window: wide,
    });
    const calendarDates = unfold(document)
      .filter((line) => line.startsWith('DTSTART;VALUE=DATE:'))
      .map((line) => line.slice('DTSTART;VALUE=DATE:'.length));

    expect(calendarDates).toEqual(agendaDates.map(formatIcsDate));
    expect(agendaDates).toEqual([
      '2026-01-31',
      '2026-02-28',
      '2026-03-31',
      '2026-04-30',
      '2026-05-31',
      '2026-06-30',
    ]);
  });
});
