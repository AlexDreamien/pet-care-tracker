/**
 * The medical record, and the dates it implies.
 *
 * When a vaccination or an antiparasitic treatment is recorded without a next-due date,
 * one is proposed from the catalogue: the owner is holding a vaccination booklet, not a
 * calculator. The proposal is stored as an ordinary editable field, never as something the
 * interface recomputes behind them — a veterinarian who says "come back in eighteen
 * months" must win over the default and keep winning.
 */

import {
  type IsoDate,
  type BirthDatePrecision,
  nextParasiteDue,
  nextVaccinationDue,
  type ParasiteTarget,
  type Species,
} from '@pet-care-tracker/core';
import { findParasiteProtocol, findVaccine } from '@pet-care-tracker/catalog';
import { and, desc, eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { parasiteTreatments, vaccinations } from '../db/schema';
import type { Pet } from './access';

function birthContext(pet: Pet): {
  birthDate?: IsoDate | undefined;
  birthPrecision?: BirthDatePrecision | undefined;
} {
  if (pet.birthDate === null) return {};
  return {
    birthDate: pet.birthDate,
    birthPrecision: pet.birthPrecision as BirthDatePrecision,
  };
}

/**
 * The next due date for a vaccine, from the animal's history and the published default.
 *
 * Returns null when the vaccine is not in the catalogue for this species — including every
 * pet whose species has no guidance at all — because a schedule invented for a rabbit is
 * worse than no schedule.
 */
export function proposeVaccinationDue(
  database: Database,
  pet: Pet,
  input: { vaccineCode: string | null; administeredOn: IsoDate; today: IsoDate },
): IsoDate | null {
  if (!input.vaccineCode) return null;

  const definition = findVaccine(pet.species as Species, input.vaccineCode);
  if (!definition) return null;

  const history = database.db
    .select({ administeredOn: vaccinations.administeredOn })
    .from(vaccinations)
    .where(and(eq(vaccinations.petId, pet.id), eq(vaccinations.vaccineCode, input.vaccineCode)))
    .all()
    .map((row) => row.administeredOn);

  // The dose being recorded is part of the history the next date is computed from.
  const due = nextVaccinationDue(definition, {
    history: [...history, input.administeredOn],
    today: input.today,
    ...birthContext(pet),
  });

  return due?.dueOn ?? null;
}

const PROTOCOL_FOR_TARGET: Record<ParasiteTarget, string> = {
  internal: 'internal_routine',
  external: 'external_routine',
  // A combined product covers both; the shorter external cadence is the binding one.
  both: 'external_routine',
};

export function proposeParasiteDue(
  pet: Pet,
  input: { target: ParasiteTarget; administeredOn: IsoDate; today: IsoDate },
): IsoDate | null {
  const protocol = findParasiteProtocol(pet.species as Species, PROTOCOL_FOR_TARGET[input.target]);
  if (!protocol) return null;

  return nextParasiteDue(protocol, {
    lastGivenOn: input.administeredOn,
    today: input.today,
    ...birthContext(pet),
  }).dueOn;
}

/**
 * The most recent record per vaccine, which is the only one whose next-due date still
 * means anything. An older row's `next_due_on` describes a due date that has already been
 * met, and surfacing it would put a permanent phantom in the agenda.
 */
export function currentVaccinationDues(database: Database, petId: string) {
  const rows = database.db
    .select()
    .from(vaccinations)
    .where(eq(vaccinations.petId, petId))
    .orderBy(desc(vaccinations.administeredOn))
    .all();

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const key = row.vaccineCode ?? `free:${row.productName ?? row.id}`;
    if (!latest.has(key)) latest.set(key, row);
  }

  return [...latest.values()].filter((row) => row.nextDueOn !== null);
}

export function currentParasiteDues(database: Database, petId: string) {
  const rows = database.db
    .select()
    .from(parasiteTreatments)
    .where(eq(parasiteTreatments.petId, petId))
    .orderBy(desc(parasiteTreatments.administeredOn))
    .all();

  const latest = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    if (!latest.has(row.target)) latest.set(row.target, row);
  }

  return [...latest.values()].filter((row) => row.nextDueOn !== null);
}
