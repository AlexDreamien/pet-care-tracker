/**
 * Default antiparasitic schedules.
 *
 * Shaped after ESCCAP guidance: worming at least four times a year for an adult, more
 * often where risk is high, and a tighter cadence for puppies and kittens — fortnightly
 * through weaning, then monthly until six months.
 *
 * There is deliberately no tick season encoded here. Tick activity depends on latitude,
 * altitude and a warming climate far more than on the month number, and a built-in season
 * would be confidently wrong for half the people using the application. The external
 * protocol simply repeats until the owner ends it, which is a decision they can make from
 * their own weather.
 */

import type { ParasiteProtocol } from '@pet-care-tracker/core';

const ESCCAP = 'ESCCAP guidance — at least four treatments a year, monthly where risk is high';
const PRODUCT_LED =
  'Set the interval from the product leaflet: most spot-ons last a month, some collars and chews considerably longer';

function internalProtocol(species: 'dog' | 'cat'): ParasiteProtocol {
  return {
    code: 'internal_routine',
    species,
    target: 'internal',
    startAgeWeeks: 2,
    juvenile: [
      { untilAgeMonths: 3, interval: 2, unit: 'week' },
      { untilAgeMonths: 6, interval: 1, unit: 'month' },
    ],
    adult: { interval: 3, unit: 'month' },
    guidance: ESCCAP,
  };
}

function externalProtocol(species: 'dog' | 'cat'): ParasiteProtocol {
  return {
    code: 'external_routine',
    species,
    target: 'external',
    startAgeWeeks: 8,
    juvenile: [],
    adult: { interval: 1, unit: 'month' },
    guidance: PRODUCT_LED,
  };
}

export const DOG_PARASITE_PROTOCOLS: readonly ParasiteProtocol[] = [
  internalProtocol('dog'),
  externalProtocol('dog'),
];

export const CAT_PARASITE_PROTOCOLS: readonly ParasiteProtocol[] = [
  internalProtocol('cat'),
  externalProtocol('cat'),
];

export const PARASITE_PROTOCOLS: readonly ParasiteProtocol[] = [
  ...DOG_PARASITE_PROTOCOLS,
  ...CAT_PARASITE_PROTOCOLS,
];
