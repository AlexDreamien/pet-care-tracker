/**
 * Units of measure.
 *
 * Storage is always metric: kilograms, centimetres, degrees Celsius. An imperial display
 * is a presentation choice made at read time. Storing a converted number would make every
 * past reading depend on the setting that happened to be active when it was entered.
 */

export type UnitSystem = 'metric' | 'imperial';
export type UnitFamily = 'mass' | 'length' | 'temperature' | 'score';

export const KILOGRAMS_PER_POUND = 0.45359237;
export const CENTIMETRES_PER_INCH = 2.54;

export interface DisplayValue {
  value: number;
  unit: string;
}

export function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function kilogramsToPounds(kilograms: number): number {
  return kilograms / KILOGRAMS_PER_POUND;
}

export function poundsToKilograms(pounds: number): number {
  return pounds * KILOGRAMS_PER_POUND;
}

export function centimetresToInches(centimetres: number): number {
  return centimetres / CENTIMETRES_PER_INCH;
}

export function inchesToCentimetres(inches: number): number {
  return inches * CENTIMETRES_PER_INCH;
}

export function celsiusToFahrenheit(celsius: number): number {
  return celsius * 1.8 + 32;
}

export function fahrenheitToCelsius(fahrenheit: number): number {
  return (fahrenheit - 32) / 1.8;
}

/** Converts a stored metric value into the system the owner reads in. */
export function toDisplay(
  family: UnitFamily,
  storedValue: number,
  system: UnitSystem,
): DisplayValue {
  switch (family) {
    case 'mass':
      return system === 'metric'
        ? { value: roundTo(storedValue, 2), unit: 'kg' }
        : { value: roundTo(kilogramsToPounds(storedValue), 1), unit: 'lb' };
    case 'length':
      return system === 'metric'
        ? { value: roundTo(storedValue, 1), unit: 'cm' }
        : { value: roundTo(centimetresToInches(storedValue), 1), unit: 'in' };
    case 'temperature':
      return system === 'metric'
        ? { value: roundTo(storedValue, 1), unit: '°C' }
        : { value: roundTo(celsiusToFahrenheit(storedValue), 1), unit: '°F' };
    case 'score':
      return { value: roundTo(storedValue, 1), unit: '' };
  }
}

/** Converts a value the owner typed back into the stored metric representation. */
export function fromDisplay(family: UnitFamily, value: number, system: UnitSystem): number {
  switch (family) {
    case 'mass':
      return system === 'metric' ? value : poundsToKilograms(value);
    case 'length':
      return system === 'metric' ? value : inchesToCentimetres(value);
    case 'temperature':
      return system === 'metric' ? value : fahrenheitToCelsius(value);
    case 'score':
      return value;
  }
}
