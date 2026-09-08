import {
  type BirthDatePrecision,
  computeAge,
  type IsoDate,
  nextBirthday,
  type PetInput,
  type Species,
} from '@pet-care-tracker/core';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { Database } from '../db/client';
import { healthFlags, pets } from '../db/schema';
import type { Pet } from './access';
import { uuidv7 } from './ids';

/** Undefined means "not provided"; the database wants an explicit null. */
function orNull<T>(value: T | undefined): T | null {
  return value ?? null;
}

function toRow(input: PetInput) {
  return {
    name: input.name,
    species: input.species,
    speciesLabel: orNull(input.speciesLabel),
    breed: orNull(input.breed),
    sex: input.sex,
    colour: orNull(input.colour),
    birthDate: orNull(input.birthDate),
    birthPrecision: input.birthPrecision,
    acquiredOn: orNull(input.acquiredOn),
    microchip: orNull(input.microchip),
    microchipImplantedOn: orNull(input.microchipImplantedOn),
    tattoo: orNull(input.tattoo),
    pedigreeNumber: orNull(input.pedigreeNumber),
    registrationNumber: orNull(input.registrationNumber),
    neutered: input.neutered,
    neuteredOn: orNull(input.neuteredOn),
    avatarFileId: orNull(input.avatarFileId),
    notes: orNull(input.notes),
  };
}

export function createPet(
  database: Database,
  input: { householdId: string; pet: PetInput; now: Date },
): Pet {
  const id = uuidv7(input.now.getTime());
  const timestamp = input.now.toISOString();

  database.db
    .insert(pets)
    .values({
      id,
      householdId: input.householdId,
      ...toRow(input.pet),
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .run();

  return database.db.select().from(pets).where(eq(pets.id, id)).get() as Pet;
}

export function updatePet(database: Database, petId: string, input: PetInput, now: Date): Pet {
  database.db
    .update(pets)
    .set({ ...toRow(input), updatedAt: now.toISOString() })
    .where(eq(pets.id, petId))
    .run();

  return database.db.select().from(pets).where(eq(pets.id, petId)).get() as Pet;
}

/**
 * Archiving rather than deleting.
 *
 * A pet's record outlives the pet, and an owner who has just lost one should not be one
 * mis-tap away from erasing fourteen years of it. Deletion stays available and explicit.
 */
export function archivePet(database: Database, petId: string, now: Date): void {
  database.db
    .update(pets)
    .set({ archivedAt: now.toISOString(), updatedAt: now.toISOString() })
    .where(eq(pets.id, petId))
    .run();
}

export function restorePet(database: Database, petId: string, now: Date): void {
  database.db
    .update(pets)
    .set({ archivedAt: null, updatedAt: now.toISOString() })
    .where(eq(pets.id, petId))
    .run();
}

export function deletePet(database: Database, petId: string): void {
  database.db.delete(pets).where(eq(pets.id, petId)).run();
}

export function listPets(
  database: Database,
  householdId: string,
  options: { includeArchived?: boolean } = {},
): Pet[] {
  const where = options.includeArchived
    ? eq(pets.householdId, householdId)
    : and(eq(pets.householdId, householdId), isNull(pets.archivedAt));

  return database.db.select().from(pets).where(where).orderBy(asc(pets.name)).all();
}

export interface PetView extends Pet {
  age: ReturnType<typeof computeAge> | null;
  nextBirthday: IsoDate | null;
  flags: (typeof healthFlags.$inferSelect)[];
}

/**
 * The pet as the interface needs it: the record, its age at the precision the birth date
 * supports, and the health flags — the one piece of medical data shown without being asked
 * for, because it is the piece a vet needs to hear before anything else.
 */
export function petView(database: Database, pet: Pet, today: IsoDate): PetView {
  const flags = database.db.select().from(healthFlags).where(eq(healthFlags.petId, pet.id)).all();

  const precision = pet.birthPrecision as BirthDatePrecision;
  const hasUsableBirthDate = pet.birthDate !== null && pet.birthDate <= today;

  return {
    ...pet,
    age: hasUsableBirthDate ? computeAge(pet.birthDate as IsoDate, precision, today) : null,
    nextBirthday: hasUsableBirthDate
      ? nextBirthday(pet.birthDate as IsoDate, precision, today)
      : null,
    flags,
  };
}

export function speciesOf(pet: Pet): Species {
  return pet.species as Species;
}
