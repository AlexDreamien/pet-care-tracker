import { describe, expect, it } from 'vitest';
import {
  celsiusToFahrenheit,
  centimetresToInches,
  fromDisplay,
  kilogramsToPounds,
  roundTo,
  toDisplay,
} from '../src/units';

describe('conversions', () => {
  it('converts mass, length and temperature', () => {
    expect(kilogramsToPounds(1)).toBeCloseTo(2.2046226, 6);
    expect(centimetresToInches(2.54)).toBeCloseTo(1, 10);
    expect(celsiusToFahrenheit(38.5)).toBeCloseTo(101.3, 10);
  });
});

describe('roundTo', () => {
  it('rounds to the requested decimals without floating-point surprises', () => {
    expect(roundTo(1.005, 2)).toBe(1.01);
    expect(roundTo(4.2049, 2)).toBe(4.2);
    expect(roundTo(38.25, 1)).toBe(38.3);
  });
});

describe('toDisplay', () => {
  it('presents stored metric values in the chosen system', () => {
    expect(toDisplay('mass', 4.237, 'metric')).toEqual({ value: 4.24, unit: 'kg' });
    expect(toDisplay('mass', 4.237, 'imperial')).toEqual({ value: 9.3, unit: 'lb' });
    expect(toDisplay('length', 42.35, 'metric')).toEqual({ value: 42.4, unit: 'cm' });
    expect(toDisplay('length', 2.54, 'imperial')).toEqual({ value: 1, unit: 'in' });
    expect(toDisplay('temperature', 38.5, 'metric')).toEqual({ value: 38.5, unit: '°C' });
    expect(toDisplay('temperature', 38.5, 'imperial')).toEqual({ value: 101.3, unit: '°F' });
  });

  it('leaves a score unitless', () => {
    expect(toDisplay('score', 5, 'imperial')).toEqual({ value: 5, unit: '' });
  });
});

describe('round trip through the display layer', () => {
  it('is exact when nothing is rounded', () => {
    expect(fromDisplay('mass', kilogramsToPounds(12.5), 'imperial')).toBeCloseTo(12.5, 10);
    expect(fromDisplay('length', centimetresToInches(12.5), 'imperial')).toBeCloseTo(12.5, 10);
    expect(fromDisplay('temperature', celsiusToFahrenheit(38.5), 'imperial')).toBeCloseTo(38.5, 10);
  });

  it('stays within half a displayed unit once rounded', () => {
    // 12.5 cm shows as 4.9 in, which converts back to 12.446 cm — the display precision is
    // the only thing lost, and it is bounded.
    const tolerance = { mass: 0.05, length: 0.13, temperature: 0.03 } as const;
    for (const family of ['mass', 'length', 'temperature'] as const) {
      const stored = family === 'temperature' ? 38.5 : 12.5;
      const shown = toDisplay(family, stored, 'imperial');
      const restored = fromDisplay(family, shown.value, 'imperial');
      expect(Math.abs(restored - stored)).toBeLessThanOrEqual(tolerance[family]);
    }
  });
});
