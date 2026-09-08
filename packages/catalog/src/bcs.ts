/**
 * The nine-point body condition scale, as descriptor keys.
 *
 * The wording of each level lives in the web layer's translations; what belongs here is
 * the structure — which score means what, and that four and five are the ideal band for
 * both species.
 */

import { bcsMeaning, type BcsLevel } from '@pet-care-tracker/core';

function scale(species: 'dog' | 'cat'): readonly BcsLevel[] {
  return Array.from({ length: 9 }, (_, index) => {
    const score = index + 1;
    return { score, meaning: bcsMeaning(score), labelKey: `bcs.${species}.${score}` };
  });
}

export const DOG_BCS_SCALE = scale('dog');
export const CAT_BCS_SCALE = scale('cat');

export const BCS_SCALES = {
  dog: DOG_BCS_SCALE,
  cat: CAT_BCS_SCALE,
} as const;
