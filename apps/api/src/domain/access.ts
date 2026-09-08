/**
 * Authorisation.
 *
 * Every record hangs off a household, and every request is checked against membership of
 * that household. Routes go through these helpers rather than each remembering the join,
 * because the query that forgets it is the one that leaks another family's pet.
 */

import { eq } from 'drizzle-orm';
import type { Database } from '../db/client';
import { householdMembers, households, pets } from '../db/schema';
import { forbidden, notFound } from '../http/errors';
import { membershipRole } from './auth';

export type Pet = typeof pets.$inferSelect;
export type Household = typeof households.$inferSelect;

const WRITABLE = new Set(['owner', 'editor']);

export interface Access {
  householdId: string;
  role: string;
}

/**
 * The household a new record belongs in.
 *
 * With one household the choice is unambiguous and the client need not care. With several,
 * guessing would put a pet in the wrong family, so the request has to say which.
 */
export function resolveHousehold(
  database: Database,
  userId: string,
  requested?: string | undefined,
): Access {
  if (requested !== undefined) {
    const role = membershipRole(database, { userId, householdId: requested });
    if (role === null) throw forbidden('you are not a member of this household');
    return { householdId: requested, role };
  }

  const memberships = database.db
    .select({ householdId: householdMembers.householdId, role: householdMembers.role })
    .from(householdMembers)
    .where(eq(householdMembers.userId, userId))
    .all();

  const only = memberships[0];
  if (!only) throw forbidden('you are not a member of any household');
  if (memberships.length > 1) throw forbidden('say which household this belongs to');

  return { householdId: only.householdId, role: only.role };
}

export function assertWritable(access: Access): Access {
  if (!WRITABLE.has(access.role)) throw forbidden('your role is read-only');
  return access;
}

/**
 * Loads a pet the user is allowed to see.
 *
 * A pet in someone else's household reads as absent rather than forbidden: telling a
 * stranger that an id exists is itself a small leak.
 */
export function petForRead(
  database: Database,
  userId: string,
  petId: string,
): { pet: Pet; access: Access } {
  const pet = database.db.select().from(pets).where(eq(pets.id, petId)).get();
  if (!pet) throw notFound('pet');

  const role = membershipRole(database, { userId, householdId: pet.householdId });
  if (role === null) throw notFound('pet');

  return { pet, access: { householdId: pet.householdId, role } };
}

export function petForWrite(
  database: Database,
  userId: string,
  petId: string,
): { pet: Pet; access: Access } {
  const found = petForRead(database, userId, petId);
  assertWritable(found.access);
  return found;
}

export function householdById(database: Database, householdId: string): Household {
  const household = database.db
    .select()
    .from(households)
    .where(eq(households.id, householdId))
    .get();
  if (!household) throw notFound('household');
  return household;
}
