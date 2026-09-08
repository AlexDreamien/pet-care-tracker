/**
 * Body measurements over time.
 *
 * One narrow shape for every metric: a date, a number and which metric it is. Charting,
 * export and adding a new metric then all work the same way, and the size card is just a
 * particular selection of latest readings.
 */

import { compareDates, diffDays, type IsoDate } from './date';
import type { UnitFamily } from './units';

export type Metric =
  | 'weight'
  | 'height_withers'
  | 'neck_girth'
  | 'chest_girth'
  | 'back_length'
  | 'bcs'
  | 'temperature';

export interface MetricMeta {
  family: UnitFamily;
  /** The unit the value is stored in. */
  storageUnit: string;
  decimals: number;
  /** Values outside this range are almost certainly a typo, not a pet. */
  plausible: { min: number; max: number };
}

export const METRICS: Record<Metric, MetricMeta> = {
  weight: { family: 'mass', storageUnit: 'kg', decimals: 2, plausible: { min: 0.01, max: 150 } },
  height_withers: {
    family: 'length',
    storageUnit: 'cm',
    decimals: 1,
    plausible: { min: 1, max: 120 },
  },
  neck_girth: { family: 'length', storageUnit: 'cm', decimals: 1, plausible: { min: 1, max: 120 } },
  chest_girth: {
    family: 'length',
    storageUnit: 'cm',
    decimals: 1,
    plausible: { min: 1, max: 200 },
  },
  back_length: {
    family: 'length',
    storageUnit: 'cm',
    decimals: 1,
    plausible: { min: 1, max: 150 },
  },
  // Body condition score on the nine-point scale used by WSAVA; halves are allowed.
  bcs: { family: 'score', storageUnit: '', decimals: 1, plausible: { min: 1, max: 9 } },
  temperature: {
    family: 'temperature',
    storageUnit: '°C',
    decimals: 1,
    plausible: { min: 30, max: 45 },
  },
};

export const SIZE_CARD_METRICS = [
  'neck_girth',
  'chest_girth',
  'back_length',
  'height_withers',
] as const satisfies readonly Metric[];

export interface Reading {
  measuredOn: IsoDate;
  value: number;
}

export interface Target {
  /** The value being aimed at, if there is one. */
  value?: number | undefined;
  min?: number | undefined;
  max?: number | undefined;
}

export function isPlausible(metric: Metric, value: number): boolean {
  const { plausible } = METRICS[metric];
  return Number.isFinite(value) && value >= plausible.min && value <= plausible.max;
}

/** Oldest first. Ties keep their original relative order. */
export function sortReadings<T extends Reading>(readings: readonly T[]): T[] {
  return [...readings].sort((a, b) => compareDates(a.measuredOn, b.measuredOn));
}

export function latestReading<T extends Reading>(readings: readonly T[]): T | null {
  const sorted = sortReadings(readings);
  return sorted[sorted.length - 1] ?? null;
}

export interface Change {
  from: Reading;
  to: Reading;
  absolute: number;
  /** Fraction of the earlier value, or `null` when that value is zero. */
  relative: number | null;
  days: number;
}

/** The change between the two most recent readings. */
export function changeSincePrevious(readings: readonly Reading[]): Change | null {
  const sorted = sortReadings(readings);
  const to = sorted[sorted.length - 1];
  const from = sorted[sorted.length - 2];
  if (!to || !from) return null;

  const absolute = to.value - from.value;
  return {
    from,
    to,
    absolute,
    relative: from.value === 0 ? null : absolute / from.value,
    days: diffDays(from.measuredOn, to.measuredOn),
  };
}

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface Trend {
  direction: TrendDirection;
  /** Least-squares slope, in metric units per day. */
  slopePerDay: number;
  /** Projected change across the whole window, for a human-sized number. */
  changeOverWindow: number;
  windowDays: number;
  sampleSize: number;
}

/**
 * Least-squares trend over the readings within `windowDays` of the most recent one.
 *
 * A single reading has no direction, and two readings a day apart should not be allowed to
 * declare a pet is losing weight — hence the relative threshold, expressed as a fraction
 * of the latest value across the window rather than an absolute figure that would mean
 * something different for a chihuahua and a mastiff.
 *
 * The window defaults to half a year because owners weigh monthly at best; a shorter one
 * would routinely see two readings and refuse to say anything.
 */
export function trend(
  readings: readonly Reading[],
  options: { windowDays?: number; relativeThreshold?: number } = {},
): Trend | null {
  const windowDays = options.windowDays ?? 180;
  const relativeThreshold = options.relativeThreshold ?? 0.02;

  const sorted = sortReadings(readings);
  const last = sorted[sorted.length - 1];
  if (!last) return null;

  const window = sorted.filter((r) => diffDays(r.measuredOn, last.measuredOn) <= windowDays);
  if (window.length < 2) return null;

  const points = window.map((r) => ({
    x: diffDays(window[0]!.measuredOn, r.measuredOn),
    y: r.value,
  }));
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  const variance = points.reduce((sum, p) => sum + (p.x - meanX) ** 2, 0);

  // Every reading on the same day: a vertical line has no slope to report.
  if (variance === 0) return null;

  const covariance = points.reduce((sum, p) => sum + (p.x - meanX) * (p.y - meanY), 0);
  const slopePerDay = covariance / variance;
  const changeOverWindow = slopePerDay * windowDays;

  const reference = Math.abs(last.value);
  const significant = reference > 0 && Math.abs(changeOverWindow) / reference >= relativeThreshold;

  return {
    direction: !significant ? 'stable' : slopePerDay > 0 ? 'rising' : 'falling',
    slopePerDay,
    changeOverWindow,
    windowDays,
    sampleSize: n,
  };
}

export type TargetPosition = 'below' | 'within' | 'above';

/** Where a value sits relative to its target corridor, or `null` if no corridor is set. */
export function positionInTarget(value: number, target: Target): TargetPosition | null {
  if (target.min === undefined && target.max === undefined) return null;
  if (target.min !== undefined && value < target.min) return 'below';
  if (target.max !== undefined && value > target.max) return 'above';
  return 'within';
}

export interface SizeCardEntry {
  metric: Metric;
  value: number;
  measuredOn: IsoDate;
  /** Days since the reading was taken; a stale girth buys the wrong harness. */
  ageInDays: number;
}

/**
 * The latest girths and lengths, with how old each one is — the screen to open in a shop.
 */
export function sizeCard(
  readingsByMetric: Partial<Record<Metric, readonly Reading[]>>,
  today: IsoDate,
): SizeCardEntry[] {
  const entries: SizeCardEntry[] = [];

  for (const metric of SIZE_CARD_METRICS) {
    const latest = latestReading(readingsByMetric[metric] ?? []);
    if (!latest) continue;
    entries.push({
      metric,
      value: latest.value,
      measuredOn: latest.measuredOn,
      ageInDays: diffDays(latest.measuredOn, today),
    });
  }

  return entries;
}
