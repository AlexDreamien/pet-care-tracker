/**
 * Presentation logic.
 *
 * Everything here is a pure function of its arguments, which is why it is unit-tested and
 * the components that call it are not. When a component starts deciding how something
 * reads, the decision moves in here.
 */

import {
  type Age,
  compareDates,
  diffDays,
  type IsoDate,
  METRICS,
  type Metric,
  toDisplay,
  type UnitSystem,
} from '@pet-care-tracker/core';
import type { AgendaItem } from '../api/types';
import { type Locale, plural } from './i18n';

const YEARS: Record<Locale, [string, string, string]> = {
  ru: ['год', 'года', 'лет'],
  en: ['year', 'years', 'years'],
};
const MONTHS: Record<Locale, [string, string, string]> = {
  ru: ['месяц', 'месяца', 'месяцев'],
  en: ['month', 'months', 'months'],
};
const DAYS: Record<Locale, [string, string, string]> = {
  ru: ['день', 'дня', 'дней'],
  en: ['day', 'days', 'days'],
};

function unit(locale: Locale, count: number, forms: Record<Locale, [string, string, string]>) {
  return `${count} ${plural(locale, count, forms[locale])}`;
}

/**
 * Age in the units the precision actually supports.
 *
 * A year-only birth date says "about 7 years" and stops there; claiming months and days
 * from a date nobody knows would be a fabrication the interface repeats every time it
 * renders.
 */
export function formatAge(age: Age, locale: Locale): string {
  const about = locale === 'ru' ? 'около ' : 'about ';
  const prefix = age.approximate ? about : '';

  if (age.resolution === 'year' || (age.years > 0 && age.months === 0)) {
    return `${prefix}${unit(locale, age.years, YEARS)}`;
  }

  if (age.years > 0) {
    return `${prefix}${unit(locale, age.years, YEARS)} ${unit(locale, age.months, MONTHS)}`;
  }

  if (age.months > 0) return `${prefix}${unit(locale, age.months, MONTHS)}`;
  return `${prefix}${unit(locale, age.days, DAYS)}`;
}

/**
 * A civil date, formatted as UTC so the day cannot slide across a time zone.
 *
 * Passing `today` drops the year from dates in the current one: on a list where almost
 * every row says the same year, the year is noise.
 */
export function formatDate(date: IsoDate, locale: Locale, today?: IsoDate): string {
  const [year, month, day] = date.split('-').map(Number);
  const sameYear = today !== undefined && today.slice(0, 4) === date.slice(0, 4);

  return new Intl.DateTimeFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  }).format(Date.UTC(year as number, (month as number) - 1, day as number));
}

/** "today", "in 3 days", "5 days ago" — the phrasing due dates actually need. */
export function formatRelativeDays(date: IsoDate, today: IsoDate, locale: Locale): string {
  const days = diffDays(today, date);

  if (days === 0) return locale === 'ru' ? 'сегодня' : 'today';
  if (days === 1) return locale === 'ru' ? 'завтра' : 'tomorrow';
  if (days === -1) return locale === 'ru' ? 'вчера' : 'yesterday';

  if (days > 0) {
    return locale === 'ru' ? `через ${unit(locale, days, DAYS)}` : `in ${unit(locale, days, DAYS)}`;
  }
  return locale === 'ru'
    ? `${unit(locale, -days, DAYS)} назад`
    : `${unit(locale, -days, DAYS)} ago`;
}

const UNIT_LABELS: Record<Locale, Record<string, string>> = {
  ru: { kg: 'кг', lb: 'lb', cm: 'см', in: 'in', '°C': '°C', '°F': '°F', '': '' },
  en: { kg: 'kg', lb: 'lb', cm: 'cm', in: 'in', '°C': '°C', '°F': '°F', '': '' },
};

export function formatMeasurement(
  metric: Metric,
  value: number,
  system: UnitSystem,
  locale: Locale,
): string {
  const meta = METRICS[metric];
  const shown = toDisplay(meta.family, value, system);
  const number = new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-GB', {
    maximumFractionDigits: meta.decimals,
  }).format(shown.value);

  const label = UNIT_LABELS[locale][shown.unit] ?? shown.unit;
  return label ? `${number} ${label}` : number;
}

export interface AgendaDay {
  date: IsoDate;
  items: AgendaItem[];
}

/** Groups the agenda into days, keeping the server's order inside each one. */
export function groupByDay(items: readonly AgendaItem[]): AgendaDay[] {
  const days: AgendaDay[] = [];

  for (const item of items) {
    const last = days[days.length - 1];
    if (last && last.date === item.date) {
      last.items.push(item);
    } else {
      days.push({ date: item.date, items: [item] });
    }
  }

  return days;
}

export interface AgendaSections {
  overdue: AgendaItem[];
  today: AgendaItem[];
  upcoming: AgendaItem[];
}

/**
 * Overdue first, then today, then the rest.
 *
 * What is late is the only thing on this screen that needs acting on right now, so it does
 * not get to sit below a birthday three weeks away.
 */
export function splitAgenda(items: readonly AgendaItem[], today: IsoDate): AgendaSections {
  const sections: AgendaSections = { overdue: [], today: [], upcoming: [] };

  for (const item of items) {
    if (item.completed) continue;
    const order = compareDates(item.date, today);
    if (order < 0) sections.overdue.push(item);
    else if (order === 0) sections.today.push(item);
    else sections.upcoming.push(item);
  }

  return sections;
}

/** After three months a girth is a guess, and a guess buys the wrong harness. */
export const STALE_MEASUREMENT_DAYS = 90;

export function isStale(ageInDays: number): boolean {
  return ageInDays > STALE_MEASUREMENT_DAYS;
}

/** "Expires in 12 days" needs to become a warning before it becomes a problem. */
export function documentUrgency(
  expiresOn: string | null,
  today: IsoDate,
): 'expired' | 'expiring' | 'fine' | null {
  if (!expiresOn) return null;
  const days = diffDays(today, expiresOn);
  if (days < 0) return 'expired';
  if (days <= 60) return 'expiring';
  return 'fine';
}

export function initials(name: string): string {
  return [...name.trim()].slice(0, 1).join('').toUpperCase() || '?';
}
