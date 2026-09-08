import { describe, expect, it } from 'vitest';
import { buildChart, nearestPoint, niceStep, niceTicks } from '../src/lib/chart';

const options = {
  width: 600,
  height: 200,
  padding: { top: 10, right: 10, bottom: 30, left: 40 },
};

const readings = [
  { measuredOn: '2026-06-01', value: 30 },
  { measuredOn: '2026-07-01', value: 31 },
  { measuredOn: '2026-09-01', value: 34 },
];

describe('niceStep', () => {
  it('rounds to a step a person would pick', () => {
    expect(niceStep(0.7)).toBe(1);
    expect(niceStep(1.3)).toBe(2);
    expect(niceStep(2.2)).toBe(2.5);
    expect(niceStep(4)).toBe(5);
    expect(niceStep(7)).toBe(10);
    expect(niceStep(230)).toBe(250);
  });
});

describe('niceTicks', () => {
  it('produces round values inside the range', () => {
    const ticks = niceTicks(28, 36, 4);
    expect(ticks[0]).toBeGreaterThanOrEqual(28);
    expect(ticks[ticks.length - 1]).toBeLessThanOrEqual(36);
    expect(ticks.every((tick) => Number.isFinite(tick))).toBe(true);
  });

  it('does not leave floating-point dust on an axis label', () => {
    // 4.300000000000001 next to 4.2 is the giveaway that nobody looked.
    for (const tick of niceTicks(4.1, 4.6, 4)) {
      expect(String(tick).length).toBeLessThan(8);
    }
  });

  it('handles a range of zero width', () => {
    expect(niceTicks(5, 5, 4)).toEqual([5]);
  });
});

describe('buildChart', () => {
  it('draws nothing from nothing', () => {
    const chart = buildChart([], options);
    expect(chart.points).toEqual([]);
    expect(chart.path).toBe('');
  });

  it('places points left to right in date order', () => {
    const chart = buildChart([...readings].reverse(), options);
    expect(chart.points.map((point) => point.measuredOn)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-09-01',
    ]);
    expect(chart.points[0]!.x).toBeLessThan(chart.points[2]!.x);
  });

  it('spaces points by elapsed time, not by index', () => {
    // 30 days then 62: the second gap must be about twice the first, or a gap in weighing
    // would be invisible on the chart.
    const [a, b, c] = buildChart(readings, options).points;
    const first = b!.x - a!.x;
    const second = c!.x - b!.x;
    expect(second / first).toBeCloseTo(62 / 30, 1);
  });

  it('puts a higher value higher on the screen', () => {
    const chart = buildChart(readings, options);
    expect(chart.points[2]!.y).toBeLessThan(chart.points[0]!.y);
  });

  it('centres a single reading instead of dividing by zero', () => {
    const chart = buildChart([{ measuredOn: '2026-09-01', value: 30 }], options);
    expect(chart.points[0]!.x).toBe(options.padding.left + (600 - 50) / 2);
    expect(Number.isFinite(chart.points[0]!.y)).toBe(true);
  });

  it('gives a flat series room rather than collapsing it', () => {
    const flat = buildChart(
      [
        { measuredOn: '2026-06-01', value: 30 },
        { measuredOn: '2026-09-01', value: 30 },
      ],
      options,
    );
    expect(flat.domain.min).toBeLessThan(flat.domain.max);
    expect(flat.points.every((point) => Number.isFinite(point.y))).toBe(true);
  });

  it('keeps the corridor on the chart even when no reading is inside it', () => {
    const chart = buildChart(readings, { ...options, target: { min: 50, max: 60 } });
    expect(chart.band).not.toBeNull();
    expect(chart.domain.max).toBeGreaterThanOrEqual(60);
  });

  it('draws a one-sided corridor', () => {
    const chart = buildChart(readings, { ...options, target: { min: null, max: 32 } });
    expect(chart.band?.height).toBeGreaterThan(0);
  });

  it('has no corridor when none is set', () => {
    expect(buildChart(readings, { ...options, target: null }).band).toBeNull();
    expect(buildChart(readings, { ...options, target: { min: null, max: null } }).band).toBeNull();
  });

  it('labels only the ends of the time axis', () => {
    const chart = buildChart(readings, options);
    expect(chart.xTicks.map((tick) => tick.date)).toEqual(['2026-06-01', '2026-09-01']);
  });
});

describe('nearestPoint', () => {
  it('finds the reading closest to a pointer, not the one under it', () => {
    const chart = buildChart(readings, options);
    const [first, second] = chart.points;

    expect(nearestPoint(chart.points, first!.x + 5)?.measuredOn).toBe('2026-06-01');
    expect(nearestPoint(chart.points, second!.x - 3)?.measuredOn).toBe('2026-07-01');
  });

  it('has nothing to find in an empty chart', () => {
    expect(nearestPoint([], 100)).toBeNull();
  });
});
