import { describe, expect, it } from 'vitest';
import { bcsMeaning, isValidBcs } from '../src/bcs';

describe('bcsMeaning', () => {
  it('treats four and five as the ideal band', () => {
    expect(bcsMeaning(4)).toBe('ideal');
    expect(bcsMeaning(5)).toBe('ideal');
  });

  it('classifies either side of the band', () => {
    expect(bcsMeaning(1)).toBe('underweight');
    expect(bcsMeaning(3.5)).toBe('underweight');
    expect(bcsMeaning(5.5)).toBe('overweight');
    expect(bcsMeaning(9)).toBe('overweight');
  });
});

describe('isValidBcs', () => {
  it('accepts the nine-point range including halves', () => {
    expect(isValidBcs(1)).toBe(true);
    expect(isValidBcs(4.5)).toBe(true);
    expect(isValidBcs(9)).toBe(true);
  });

  it('rejects anything off the scale', () => {
    expect(isValidBcs(0)).toBe(false);
    expect(isValidBcs(10)).toBe(false);
    expect(isValidBcs(Number.NaN)).toBe(false);
  });
});
