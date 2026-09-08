/**
 * Body condition score.
 *
 * The nine-point scale is the one veterinary practice uses, and it says something weight
 * alone cannot: a 30 kg dog is neither fat nor thin until you know its frame.
 */

export type BcsMeaning = 'underweight' | 'ideal' | 'overweight';

export interface BcsLevel {
  score: number;
  meaning: BcsMeaning;
  /** Translation key for the descriptor; the wording lives in the web layer. */
  labelKey: string;
}

export const BCS_MIN = 1;
export const BCS_MAX = 9;
export const BCS_IDEAL = { min: 4, max: 5 } as const;

/** Where a score sits on the nine-point scale. Halves are allowed and round outward. */
export function bcsMeaning(score: number): BcsMeaning {
  if (score < BCS_IDEAL.min) return 'underweight';
  if (score > BCS_IDEAL.max) return 'overweight';
  return 'ideal';
}

export function isValidBcs(score: number): boolean {
  return Number.isFinite(score) && score >= BCS_MIN && score <= BCS_MAX;
}
