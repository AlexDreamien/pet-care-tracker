import { describe, expect, it } from 'vitest';
import type { Age } from '@pet-care-tracker/core';
import {
  documentUrgency,
  optionsIncluding,
  formatAge,
  formatMeasurement,
  formatRelativeDays,
  groupByDay,
  isStale,
  splitAgenda,
} from '../src/lib/format';
import { plural, translator } from '../src/lib/i18n';
import type { AgendaItem } from '../src/api/types';

const age = (over: Partial<Age>): Age => ({
  years: 0,
  months: 0,
  days: 0,
  approximate: false,
  resolution: 'day',
  ...over,
});

describe('plural', () => {
  it('picks the Russian form the number actually needs', () => {
    const forms: [string, string, string] = ['год', 'года', 'лет'];
    expect(plural('ru', 1, forms)).toBe('год');
    expect(plural('ru', 2, forms)).toBe('года');
    expect(plural('ru', 5, forms)).toBe('лет');
    expect(plural('ru', 11, forms)).toBe('лет');
    expect(plural('ru', 21, forms)).toBe('год');
    expect(plural('ru', 22, forms)).toBe('года');
    expect(plural('ru', 111, forms)).toBe('лет');
  });

  it('needs only singular and plural in English', () => {
    const forms: [string, string, string] = ['day', 'days', 'days'];
    expect(plural('en', 1, forms)).toBe('day');
    expect(plural('en', 2, forms)).toBe('days');
  });
});

describe('formatAge', () => {
  it('declines the Russian year correctly', () => {
    expect(formatAge(age({ years: 1 }), 'ru')).toBe('1 год');
    expect(formatAge(age({ years: 3 }), 'ru')).toBe('3 года');
    expect(formatAge(age({ years: 6 }), 'ru')).toBe('6 лет');
  });

  it('adds months only when there are some', () => {
    expect(formatAge(age({ years: 3, months: 5 }), 'ru')).toBe('3 года 5 месяцев');
    expect(formatAge(age({ years: 3, months: 0 }), 'ru')).toBe('3 года');
  });

  it('falls back to months, then to days, for a young animal', () => {
    expect(formatAge(age({ months: 5 }), 'ru')).toBe('5 месяцев');
    expect(formatAge(age({ days: 12 }), 'ru')).toBe('12 дней');
    expect(formatAge(age({ days: 1 }), 'ru')).toBe('1 день');
  });

  it('says only years when only the year is known, and hedges', () => {
    // Claiming months from a date nobody knows would be a fabrication repeated on every
    // render.
    const yearOnly = age({ years: 7, months: 4, approximate: true, resolution: 'year' });
    expect(formatAge(yearOnly, 'ru')).toBe('около 7 лет');
    expect(formatAge(yearOnly, 'en')).toBe('about 7 years');
  });

  it('works in English', () => {
    expect(formatAge(age({ years: 1 }), 'en')).toBe('1 year');
    expect(formatAge(age({ years: 3, months: 5 }), 'en')).toBe('3 years 5 months');
  });
});

describe('formatRelativeDays', () => {
  it('names the days close to now', () => {
    expect(formatRelativeDays('2026-09-08', '2026-09-08', 'ru')).toBe('сегодня');
    expect(formatRelativeDays('2026-09-09', '2026-09-08', 'ru')).toBe('завтра');
    expect(formatRelativeDays('2026-09-07', '2026-09-08', 'ru')).toBe('вчера');
  });

  it('counts forwards and backwards with the right form', () => {
    expect(formatRelativeDays('2026-09-11', '2026-09-08', 'ru')).toBe('через 3 дня');
    expect(formatRelativeDays('2026-09-13', '2026-09-08', 'ru')).toBe('через 5 дней');
    expect(formatRelativeDays('2026-09-03', '2026-09-08', 'ru')).toBe('5 дней назад');
    expect(formatRelativeDays('2026-09-11', '2026-09-08', 'en')).toBe('in 3 days');
  });
});

describe('formatMeasurement', () => {
  it('shows a stored kilogram in the chosen system', () => {
    // Pounds are rounded to a tenth by the core: a tenth of a pound is finer than most
    // bathroom scales, and more digits would only look precise.
    expect(formatMeasurement('weight', 4.237, 'metric', 'en')).toBe('4.24 kg');
    expect(formatMeasurement('weight', 4.237, 'imperial', 'en')).toBe('9.3 lb');
  });

  it('uses the Russian decimal comma and unit', () => {
    expect(formatMeasurement('weight', 4.2, 'metric', 'ru')).toBe('4,2 кг');
  });

  it('leaves a body condition score unitless', () => {
    expect(formatMeasurement('bcs', 5, 'metric', 'ru')).toBe('5');
  });
});

describe('the agenda', () => {
  const item = (over: Partial<AgendaItem>): AgendaItem =>
    ({
      key: 'k',
      source: 'event',
      sourceId: 's',
      petId: 'p',
      petName: 'Рекс',
      type: 'grooming',
      title: 'Груминг',
      date: '2026-09-08',
      completed: false,
      overdue: false,
      ...over,
    }) as AgendaItem;

  it('groups consecutive items into days', () => {
    const days = groupByDay([
      item({ date: '2026-09-08', key: 'a' }),
      item({ date: '2026-09-08', key: 'b' }),
      item({ date: '2026-09-10', key: 'c' }),
    ]);

    expect(days).toHaveLength(2);
    expect(days[0]?.items).toHaveLength(2);
  });

  it('puts what is late above what is merely coming', () => {
    const sections = splitAgenda(
      [
        item({ date: '2026-09-20', key: 'later' }),
        item({ date: '2026-09-01', key: 'late' }),
        item({ date: '2026-09-08', key: 'now' }),
      ],
      '2026-09-08',
    );

    expect(sections.overdue.map((i) => i.key)).toEqual(['late']);
    expect(sections.today.map((i) => i.key)).toEqual(['now']);
    expect(sections.upcoming.map((i) => i.key)).toEqual(['later']);
  });

  it('drops what is already done', () => {
    const sections = splitAgenda([item({ date: '2026-09-01', completed: true })], '2026-09-08');
    expect(sections.overdue).toHaveLength(0);
  });
});

describe('staleness and expiry', () => {
  it('calls a measurement stale after three months', () => {
    expect(isStale(89)).toBe(false);
    expect(isStale(91)).toBe(true);
  });

  it('warns before a document expires, not after', () => {
    expect(documentUrgency('2026-09-01', '2026-09-08')).toBe('expired');
    expect(documentUrgency('2026-10-01', '2026-09-08')).toBe('expiring');
    expect(documentUrgency('2027-10-01', '2026-09-08')).toBe('fine');
    expect(documentUrgency(null, '2026-09-08')).toBeNull();
  });
});

describe('optionsIncluding', () => {
  it('leaves a list alone when it already holds the value', () => {
    expect(optionsIncluding(['Europe/Berlin', 'Europe/Moscow'], 'Europe/Moscow')).toEqual([
      'Europe/Berlin',
      'Europe/Moscow',
    ]);
  });

  it('adds a value the list is missing, first', () => {
    // Intl omits UTC from its zone list, and a select bound to UTC silently displayed
    // Africa/Abidjan — the first entry — so saving the form moved the household there.
    expect(optionsIncluding(['Africa/Abidjan', 'Europe/Berlin'], 'UTC')).toEqual([
      'UTC',
      'Africa/Abidjan',
      'Europe/Berlin',
    ]);
  });

  it('does not mutate what it was given', () => {
    const available = ['Europe/Berlin'];
    optionsIncluding(available, 'UTC');
    expect(available).toEqual(['Europe/Berlin']);
  });
});

describe('translations', () => {
  it('has the same keys in both languages', () => {
    const ru = translator('ru');
    const en = translator('en');
    // A key that falls through returns itself, which is how a gap shows up here.
    for (const key of ['nav.pets', 'medical.vaccinations', 'settings.calendar'] as const) {
      expect(ru(key)).not.toBe(key);
      expect(en(key)).not.toBe(key);
      expect(ru(key)).not.toBe(en(key));
    }
  });
});
