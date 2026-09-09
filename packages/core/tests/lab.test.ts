import { describe, expect, it } from 'vitest';
import { classifyLabValue, groupLabReadings, type LabReading } from '../src/lab';

const reading = (over: Partial<LabReading>): LabReading => ({
  id: 'r',
  analyte: 'Creatinine',
  value: 90,
  unit: 'µmol/L',
  measuredOn: '2026-09-01',
  referenceMin: 44,
  referenceMax: 159,
  ...over,
});

describe('classifyLabValue', () => {
  it('places a value against the range printed beside it', () => {
    expect(classifyLabValue(reading({ value: 90 }))).toBe('within');
    expect(classifyLabValue(reading({ value: 30 }))).toBe('below');
    expect(classifyLabValue(reading({ value: 200 }))).toBe('above');
  });

  it('says nothing when the form gave no range', () => {
    // Making one up would be medical content this application has no business producing.
    expect(
      classifyLabValue(reading({ referenceMin: undefined, referenceMax: undefined })),
    ).toBeNull();
  });

  it('works with only one bound', () => {
    expect(classifyLabValue(reading({ value: 200, referenceMin: undefined }))).toBe('above');
    expect(classifyLabValue(reading({ value: 200, referenceMax: undefined }))).toBe('within');
  });
});

describe('groupLabReadings', () => {
  it('makes one series per analyte, oldest first', () => {
    const series = groupLabReadings([
      reading({ id: 'b', measuredOn: '2026-09-01', value: 110 }),
      reading({ id: 'a', measuredOn: '2026-03-01', value: 95 }),
      reading({ id: 'c', analyte: 'Urea', value: 6, unit: 'mmol/L' }),
    ]);

    expect(series.map((entry) => entry.analyte)).toEqual(['Creatinine', 'Urea']);
    expect(series[0]?.readings.map((r) => r.measuredOn)).toEqual(['2026-03-01', '2026-09-01']);
  });

  it('takes the reference range and the verdict from the most recent reading', () => {
    // A clinic that changed laboratories has a new range; the old one is history.
    const series = groupLabReadings([
      reading({ id: 'old', measuredOn: '2026-01-01', value: 90, referenceMax: 159 }),
      reading({ id: 'new', measuredOn: '2026-09-01', value: 90, referenceMax: 80 }),
    ]);

    expect(series[0]?.reference).toEqual({ min: 44, max: 80 });
    expect(series[0]?.position).toBe('above');
  });

  it('flags a series whose readings are not in the same unit', () => {
    // Charting mmol/L against mg/dL as one line draws a cliff that is not in the animal.
    const series = groupLabReadings([
      reading({ id: 'a', unit: 'mmol/L', value: 5 }),
      reading({ id: 'b', unit: 'mg/dL', value: 90, measuredOn: '2026-09-05' }),
    ]);

    expect(series[0]?.mixedUnits).toBe(true);
    expect(series[0]?.unit).toBe('mg/dL');
  });

  it('does not flag a consistent series', () => {
    const series = groupLabReadings([
      reading({ id: 'a' }),
      reading({ id: 'b', measuredOn: '2026-09-05' }),
    ]);
    expect(series[0]?.mixedUnits).toBe(false);
  });

  it('has nothing to group when there is nothing', () => {
    expect(groupLabReadings([])).toEqual([]);
  });

  it('reports no range when the latest reading has none', () => {
    const series = groupLabReadings([
      reading({ id: 'a', measuredOn: '2026-01-01' }),
      reading({
        id: 'b',
        measuredOn: '2026-09-01',
        referenceMin: undefined,
        referenceMax: undefined,
      }),
    ]);

    expect(series[0]?.reference).toBeNull();
    expect(series[0]?.position).toBeNull();
  });
});
