import { describe, expect, it } from 'vitest';
import { checkMicrochip, formatMicrochip, normaliseMicrochip } from '../src/microchip';

describe('normaliseMicrochip', () => {
  it('strips the separators people copy off a printout', () => {
    expect(normaliseMicrochip('643 094 100 123 456')).toBe('643094100123456');
    expect(normaliseMicrochip('941-000-012-345-678')).toBe('941000012345678');
    expect(normaliseMicrochip('4b7d5f1a2c')).toBe('4B7D5F1A2C');
  });
});

describe('checkMicrochip', () => {
  it('accepts a 15-digit ISO number and names its prefix', () => {
    const country = checkMicrochip('643094100123456');
    expect(country.valid).toBe(true);
    expect(country.format).toBe('iso');
    expect(country.prefix).toEqual({ code: '643', kind: 'country' });

    const manufacturer = checkMicrochip('941000012345678');
    expect(manufacturer.prefix).toEqual({ code: '941', kind: 'manufacturer' });

    const test = checkMicrochip('999000012345678');
    expect(test.prefix).toEqual({ code: '999', kind: 'test' });
  });

  it('accepts the pre-ISO formats still found in older animals', () => {
    expect(checkMicrochip('1234567890').format).toBe('fecava');
    expect(checkMicrochip('123456789').format).toBe('avid');
    expect(checkMicrochip('4B7D5F1A2C').format).toBe('destron');
  });

  it('does not mistake a ten-digit number for a hexadecimal chip', () => {
    expect(checkMicrochip('1234567890').format).toBe('fecava');
  });

  it('rejects a number with a digit missing or a stray character', () => {
    expect(checkMicrochip('64309410012345').valid).toBe(false);
    expect(checkMicrochip('6430941001234567').valid).toBe(false);
    expect(checkMicrochip('643094X00123456').valid).toBe(false);
    expect(checkMicrochip('').valid).toBe(false);
  });
});

describe('formatMicrochip', () => {
  it('groups an ISO number in threes', () => {
    expect(formatMicrochip('643094100123456')).toBe('643 094 100 123 456');
  });

  it('leaves other formats alone', () => {
    expect(formatMicrochip('4b7d5f1a2c')).toBe('4B7D5F1A2C');
  });
});
