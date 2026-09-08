/**
 * The geometry behind the measurement chart.
 *
 * Kept out of the component so the awkward cases — one reading, a flat series, a target
 * band outside the data — are decided by tested code rather than by whatever the SVG
 * happens to do.
 */

import { compareDates, diffDays, type IsoDate } from '@pet-care-tracker/core';

export interface ChartReading {
  measuredOn: IsoDate;
  value: number;
}

export interface ChartPoint extends ChartReading {
  x: number;
  y: number;
}

export interface ChartBand {
  y: number;
  height: number;
}

export interface ChartTick {
  value: number;
  y: number;
}

export interface ChartXTick {
  date: IsoDate;
  x: number;
}

export interface ChartGeometry {
  points: ChartPoint[];
  /** An SVG path, or an empty string when there is nothing to draw. */
  path: string;
  band: ChartBand | null;
  yTicks: ChartTick[];
  xTicks: ChartXTick[];
  domain: { min: number; max: number };
}

export interface ChartOptions {
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  target?: { min: number | null; max: number | null } | null;
  tickCount?: number;
}

/**
 * Round tick values a person would choose: 1, 2, 2.5 or 5 times a power of ten.
 */
export function niceStep(rough: number): number {
  if (rough <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalised = rough / magnitude;

  if (normalised <= 1) return magnitude;
  if (normalised <= 2) return 2 * magnitude;
  if (normalised <= 2.5) return 2.5 * magnitude;
  if (normalised <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function niceTicks(min: number, max: number, count: number): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return [];
  if (min === max) return [min];

  const step = niceStep((max - min) / Math.max(1, count));
  const first = Math.ceil(min / step) * step;
  const ticks: number[] = [];

  for (let value = first; value <= max + step / 1000 && ticks.length < 20; value += step) {
    // Floating-point accumulation shows up as 4.300000000000001 on an axis label.
    ticks.push(Number(value.toFixed(10)));
  }

  return ticks;
}

export function buildChart(
  readings: readonly ChartReading[],
  options: ChartOptions,
): ChartGeometry {
  const sorted = [...readings].sort((a, b) => compareDates(a.measuredOn, b.measuredOn));
  const empty: ChartGeometry = {
    points: [],
    path: '',
    band: null,
    yTicks: [],
    xTicks: [],
    domain: { min: 0, max: 1 },
  };
  if (sorted.length === 0) return empty;

  const first = sorted[0] as ChartReading;
  const last = sorted[sorted.length - 1] as ChartReading;

  const values = sorted.map((reading) => reading.value);
  const candidates = [...values];
  // The corridor belongs on the chart even when every reading sits outside it.
  if (options.target?.min != null) candidates.push(options.target.min);
  if (options.target?.max != null) candidates.push(options.target.max);

  let min = Math.min(...candidates);
  let max = Math.max(...candidates);

  if (min === max) {
    // A flat series would divide by zero; give it room so the line sits mid-plot.
    const pad = Math.abs(min) * 0.1 || 1;
    min -= pad;
    max += pad;
  } else {
    const headroom = (max - min) * 0.1;
    min -= headroom;
    max += headroom;
  }

  const plotWidth = options.width - options.padding.left - options.padding.right;
  const plotHeight = options.height - options.padding.top - options.padding.bottom;
  const span = diffDays(first.measuredOn, last.measuredOn);

  const xFor = (date: IsoDate): number =>
    span === 0
      ? options.padding.left + plotWidth / 2
      : options.padding.left + (diffDays(first.measuredOn, date) / span) * plotWidth;

  const yFor = (value: number): number =>
    options.padding.top + (1 - (value - min) / (max - min)) * plotHeight;

  const points: ChartPoint[] = sorted.map((reading) => ({
    ...reading,
    x: xFor(reading.measuredOn),
    y: yFor(reading.value),
  }));

  const path = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(2)} ${point.y.toFixed(2)}`)
    .join(' ');

  let band: ChartBand | null = null;
  if (options.target && (options.target.min != null || options.target.max != null)) {
    const top = yFor(options.target.max ?? max);
    const bottom = yFor(options.target.min ?? min);
    band = { y: top, height: Math.max(1, bottom - top) };
  }

  const yTicks = niceTicks(min, max, options.tickCount ?? 4).map((value) => ({
    value,
    y: yFor(value),
  }));

  // Only the ends are labelled: dates in the middle collide long before they inform.
  const xTicks: ChartXTick[] =
    span === 0
      ? [{ date: first.measuredOn, x: xFor(first.measuredOn) }]
      : [
          { date: first.measuredOn, x: xFor(first.measuredOn) },
          { date: last.measuredOn, x: xFor(last.measuredOn) },
        ];

  return { points, path, band, yTicks, xTicks, domain: { min, max } };
}

/** The reading nearest a pointer position, for a hover target bigger than the dot. */
export function nearestPoint(points: readonly ChartPoint[], x: number): ChartPoint | null {
  let best: ChartPoint | null = null;
  let bestDistance = Infinity;

  for (const point of points) {
    const distance = Math.abs(point.x - x);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = point;
    }
  }

  return best;
}
