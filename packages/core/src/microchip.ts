/**
 * Microchip numbers.
 *
 * The number an owner copies off a vet's printout comes with spaces, dots or dashes, and
 * comes in more than one standard. Normalising and naming the format lets the interface
 * accept what is on the paper while still catching the digit that went missing.
 */

export type MicrochipFormat = 'iso' | 'fecava' | 'avid' | 'destron' | 'unknown';

export interface MicrochipPrefix {
  code: string;
  kind: 'manufacturer' | 'country' | 'test';
}

export interface MicrochipCheck {
  /** Exactly what was typed. */
  input: string;
  /** Separators removed, letters upper-cased. */
  normalised: string;
  format: MicrochipFormat;
  valid: boolean;
  /** What the leading three digits of an ISO number denote. */
  prefix?: MicrochipPrefix;
}

const SEPARATORS = /[\s.\-_]/g;

export function normaliseMicrochip(input: string): string {
  return input.replace(SEPARATORS, '').toUpperCase();
}

/**
 * ISO 11784/11785 numbers are 15 digits. The first three are a manufacturer code in
 * 900–998, the test range 999, or an ISO 3166 numeric country code — 643 for Russia,
 * 276 for Germany and so on.
 */
function isoPrefix(normalised: string): MicrochipPrefix {
  const code = normalised.slice(0, 3);
  const numeric = Number(code);
  if (numeric === 999) return { code, kind: 'test' };
  if (numeric >= 900 && numeric <= 998) return { code, kind: 'manufacturer' };
  return { code, kind: 'country' };
}

export function checkMicrochip(input: string): MicrochipCheck {
  const normalised = normaliseMicrochip(input);
  const base = { input, normalised };

  if (/^\d{15}$/.test(normalised)) {
    return { ...base, format: 'iso', valid: true, prefix: isoPrefix(normalised) };
  }
  // Pre-ISO European transponders, still in circulation in older animals.
  if (/^\d{10}$/.test(normalised)) {
    return { ...base, format: 'fecava', valid: true };
  }
  if (/^\d{9}$/.test(normalised)) {
    return { ...base, format: 'avid', valid: true };
  }
  // Destron and 24PetWatch chips are ten hexadecimal characters; require at least one
  // letter so a ten-digit FECAVA number is not claimed by this branch.
  if (/^[0-9A-F]{10}$/.test(normalised) && /[A-F]/.test(normalised)) {
    return { ...base, format: 'destron', valid: true };
  }

  return { ...base, format: 'unknown', valid: false };
}

export function isValidMicrochip(input: string): boolean {
  return checkMicrochip(input).valid;
}

/** Groups a normalised number for display: ISO numbers in fives of three digits. */
export function formatMicrochip(input: string): string {
  const check = checkMicrochip(input);
  if (check.format !== 'iso') return check.normalised;
  return (check.normalised.match(/.{1,3}/g) ?? []).join(' ');
}
