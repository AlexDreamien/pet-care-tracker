import { describe, expect, it } from 'vitest';
import {
  changeSincePrevious,
  isPlausible,
  latestReading,
  positionInTarget,
  sizeCard,
  sortReadings,
  trend,
  type Reading,
} from '../src/measurements';

const weights: Reading[] = [
  { measuredOn: '2026-08-01', value: 4.0 },
  { measuredOn: '2026-06-01', value: 3.6 },
  { measuredOn: '2026-09-01', value: 4.2 },
  { measuredOn: '2026-07-01', value: 3.8 },
];

describe('sorting and selection', () => {
  it('orders readings oldest first without mutating the input', () => {
    const sorted = sortReadings(weights);
    expect(sorted.map((r) => r.measuredOn)).toEqual([
      '2026-06-01',
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ]);
    expect(weights[0]?.measuredOn).toBe('2026-08-01');
  });

  it('finds the most recent reading regardless of input order', () => {
    expect(latestReading(weights)?.value).toBe(4.2);
    expect(latestReading([])).toBeNull();
  });
});

describe('changeSincePrevious', () => {
  it('compares the two most recent readings', () => {
    const change = changeSincePrevious(weights);
    expect(change?.from.measuredOn).toBe('2026-08-01');
    expect(change?.to.measuredOn).toBe('2026-09-01');
    expect(change?.absolute).toBeCloseTo(0.2, 10);
    expect(change?.relative).toBeCloseTo(0.05, 10);
    expect(change?.days).toBe(31);
  });

  it('needs two readings', () => {
    expect(changeSincePrevious([{ measuredOn: '2026-09-01', value: 4.2 }])).toBeNull();
  });

  it('reports no relative change against a zero baseline', () => {
    const change = changeSincePrevious([
      { measuredOn: '2026-08-01', value: 0 },
      { measuredOn: '2026-09-01', value: 1 },
    ]);
    expect(change?.relative).toBeNull();
  });
});

describe('trend', () => {
  it('detects a steady gain', () => {
    const result = trend(weights);
    expect(result?.direction).toBe('rising');
    expect(result?.sampleSize).toBe(4);
    expect(result?.slopePerDay).toBeGreaterThan(0);
  });

  it('detects a loss', () => {
    const losing: Reading[] = [
      { measuredOn: '2026-06-01', value: 30 },
      { measuredOn: '2026-07-01', value: 29 },
      { measuredOn: '2026-08-01', value: 27.5 },
      { measuredOn: '2026-09-01', value: 26 },
    ];
    expect(trend(losing)?.direction).toBe('falling');
  });

  it('calls a small wobble stable', () => {
    const steady: Reading[] = [
      { measuredOn: '2026-06-01', value: 30.0 },
      { measuredOn: '2026-07-01', value: 30.1 },
      { measuredOn: '2026-08-01', value: 29.95 },
      { measuredOn: '2026-09-01', value: 30.05 },
    ];
    expect(trend(steady)?.direction).toBe('stable');
  });

  it('has no direction from a single reading', () => {
    expect(trend([{ measuredOn: '2026-09-01', value: 4.2 }])).toBeNull();
  });

  it('has no direction when every reading is from the same day', () => {
    expect(
      trend([
        { measuredOn: '2026-09-01', value: 4.2 },
        { measuredOn: '2026-09-01', value: 4.3 },
      ]),
    ).toBeNull();
  });

  it('ignores readings older than the window', () => {
    const withAncientReading: Reading[] = [{ measuredOn: '2020-01-01', value: 1 }, ...weights];
    expect(trend(withAncientReading)?.sampleSize).toBe(4);
  });
});

describe('positionInTarget', () => {
  it('places a value against its corridor', () => {
    const target = { min: 4, max: 5 };
    expect(positionInTarget(3.5, target)).toBe('below');
    expect(positionInTarget(4.5, target)).toBe('within');
    expect(positionInTarget(5.5, target)).toBe('above');
  });

  it('works with only one side of the corridor set', () => {
    expect(positionInTarget(3.5, { max: 5 })).toBe('within');
    expect(positionInTarget(5.5, { max: 5 })).toBe('above');
  });

  it('says nothing when no corridor is set', () => {
    expect(positionInTarget(4.5, {})).toBeNull();
    expect(positionInTarget(4.5, { value: 4.5 })).toBeNull();
  });
});

describe('isPlausible', () => {
  it('catches a decimal point in the wrong place', () => {
    expect(isPlausible('weight', 4.2)).toBe(true);
    expect(isPlausible('weight', 420)).toBe(false);
    expect(isPlausible('bcs', 5)).toBe(true);
    expect(isPlausible('bcs', 10)).toBe(false);
    expect(isPlausible('temperature', 38.5)).toBe(true);
    expect(isPlausible('temperature', 385)).toBe(false);
  });
});

describe('sizeCard', () => {
  it('collects the latest girths with how stale each one is', () => {
    const card = sizeCard(
      {
        neck_girth: [
          { measuredOn: '2026-03-01', value: 30 },
          { measuredOn: '2026-08-01', value: 32 },
        ],
        chest_girth: [{ measuredOn: '2026-08-01', value: 55 }],
      },
      '2026-09-08',
    );

    expect(card).toEqual([
      { metric: 'neck_girth', value: 32, measuredOn: '2026-08-01', ageInDays: 38 },
      { metric: 'chest_girth', value: 55, measuredOn: '2026-08-01', ageInDays: 38 },
    ]);
  });

  it('omits metrics that have never been measured', () => {
    expect(sizeCard({}, '2026-09-08')).toEqual([]);
  });
});
