/**
 * Default vaccination schedules for dogs and cats.
 *
 * These are **reminder defaults**, not a medical protocol. They follow the shape of the
 * WSAVA vaccination guidelines — a primary series through the age at which maternal
 * antibodies stop interfering, a dose at six months that closes it, and core boosters no
 * more often than every three years — but the product leaflet, local law and the
 * veterinarian decide the actual dates. Every date the application proposes from this
 * table is editable, and the `guidance` string is shown next to it so the owner can see
 * where the suggestion came from.
 *
 * Rabies is the one entry where law, not immunology, usually sets the interval: many
 * jurisdictions and every pet-travel scheme require annual documentation, so the default
 * here is annual rather than the longer interval the vaccine itself can support.
 */

import type { VaccineDefinition } from '@pet-care-tracker/core';

const WSAVA = 'WSAVA vaccination guidelines';
const WSAVA_AND_LAW = 'WSAVA vaccination guidelines; local law usually sets the interval';

export const DOG_VACCINES: readonly VaccineDefinition[] = [
  {
    code: 'dhppi',
    species: 'dog',
    core: true,
    covers: ['distemper', 'adenovirus', 'parvovirus', 'parainfluenza'],
    primaryCourse: {
      startAgeWeeks: 8,
      intervalWeeks: 4,
      completeByAgeWeeks: 16,
      firstBoosterAgeMonths: 6,
    },
    boosterInterval: { interval: 3, unit: 'year' },
    guidance: WSAVA,
  },
  {
    code: 'rabies',
    species: 'dog',
    core: true,
    covers: ['rabies'],
    primaryCourse: {
      startAgeWeeks: 12,
      intervalWeeks: 4,
      completeByAgeWeeks: 12,
      firstBoosterAgeMonths: 12,
    },
    boosterInterval: { interval: 1, unit: 'year' },
    guidance: WSAVA_AND_LAW,
  },
  {
    code: 'leptospirosis',
    species: 'dog',
    core: false,
    covers: ['leptospirosis'],
    primaryCourse: {
      startAgeWeeks: 8,
      intervalWeeks: 4,
      completeByAgeWeeks: 12,
      firstBoosterAgeMonths: null,
    },
    boosterInterval: { interval: 1, unit: 'year' },
    guidance: `${WSAVA} — non-core, recommended where exposure is likely`,
  },
  {
    code: 'bordetella',
    species: 'dog',
    core: false,
    covers: ['bordetella', 'parainfluenza'],
    primaryCourse: {
      startAgeWeeks: 8,
      intervalWeeks: 4,
      completeByAgeWeeks: 8,
      firstBoosterAgeMonths: null,
    },
    boosterInterval: { interval: 1, unit: 'year' },
    guidance: `${WSAVA} — non-core; boarding and training facilities often require it`,
  },
];

export const CAT_VACCINES: readonly VaccineDefinition[] = [
  {
    code: 'fvrcp',
    species: 'cat',
    core: true,
    covers: ['panleukopenia', 'herpesvirus', 'calicivirus'],
    primaryCourse: {
      startAgeWeeks: 8,
      intervalWeeks: 4,
      completeByAgeWeeks: 16,
      firstBoosterAgeMonths: 6,
    },
    boosterInterval: { interval: 3, unit: 'year' },
    guidance: WSAVA,
  },
  {
    code: 'rabies',
    species: 'cat',
    core: true,
    covers: ['rabies'],
    primaryCourse: {
      startAgeWeeks: 12,
      intervalWeeks: 4,
      completeByAgeWeeks: 12,
      firstBoosterAgeMonths: 12,
    },
    boosterInterval: { interval: 1, unit: 'year' },
    guidance: WSAVA_AND_LAW,
  },
  {
    code: 'felv',
    species: 'cat',
    core: false,
    covers: ['leukaemia'],
    primaryCourse: {
      startAgeWeeks: 8,
      intervalWeeks: 4,
      completeByAgeWeeks: 12,
      firstBoosterAgeMonths: null,
    },
    boosterInterval: { interval: 1, unit: 'year' },
    guidance: `${WSAVA} — recommended for kittens and for cats with outdoor access`,
  },
  {
    code: 'chlamydia',
    species: 'cat',
    core: false,
    covers: ['chlamydiosis'],
    primaryCourse: {
      startAgeWeeks: 8,
      intervalWeeks: 4,
      completeByAgeWeeks: 12,
      firstBoosterAgeMonths: null,
    },
    boosterInterval: { interval: 1, unit: 'year' },
    guidance: `${WSAVA} — non-core, for multi-cat households with a known problem`,
  },
];

export const VACCINES: readonly VaccineDefinition[] = [...DOG_VACCINES, ...CAT_VACCINES];
