/**
 * Assembling the agenda's input from the database.
 *
 * Everything the calendar shows that is not a scheduled event is derived here and passed
 * to `collectSeries` in the core: next-due dates, document expiries, medication days and
 * birthdays. None of it is stored as a calendar row — a derived item that outlived the
 * record it came from would be a reminder for something that no longer exists.
 */

import {
  type AgendaInput,
  type BirthDatePrecision,
  type DerivedDueInput,
  type IsoDate,
  nextBirthday,
  type RecurrenceRule,
  type ScheduledEventInput,
  zonedDateTimeToInstant,
} from '@pet-care-tracker/core';
import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import type { Database } from '../db/client';
import { careEvents, documents, medicationCourses, medicationDoses, pets } from '../db/schema';
import { currentParasiteDues, currentVaccinationDues } from './medical';

export interface AgendaSourceOptions {
  householdId: string;
  from: IsoDate;
  to: IsoDate;
  petId?: string | undefined;
  /** The household's zone, so a wall-clock appointment becomes the right instant. */
  timeZone: string;
  includeBirthdays?: boolean;
}

const TARGET_LABEL: Record<string, string> = {
  internal: 'parasite.internal',
  external: 'parasite.external',
  both: 'parasite.both',
};

export function collectAgendaInput(database: Database, options: AgendaSourceOptions): AgendaInput {
  const household = database.db
    .select()
    .from(pets)
    .where(and(eq(pets.householdId, options.householdId), isNull(pets.archivedAt)))
    .all();

  const visible = options.petId ? household.filter((pet) => pet.id === options.petId) : household;
  const events: ScheduledEventInput[] = [];
  const derived: DerivedDueInput[] = [];

  for (const pet of visible) {
    for (const event of database.db
      .select()
      .from(careEvents)
      .where(eq(careEvents.petId, pet.id))
      .all()) {
      events.push({
        id: event.id,
        petId: pet.id,
        petName: pet.name,
        type: event.type,
        title: event.title,
        scheduledOn: event.scheduledOn,
        instant: instantFor(event.scheduledOn, event.startTime, options.timeZone),
        durationMinutes: event.durationMinutes ?? undefined,
        recurrence: (event.recurrence as RecurrenceRule | null) ?? undefined,
        lastCompletedOn: event.lastCompletedOn ?? undefined,
        location: event.location ?? undefined,
        notes: event.notes ?? undefined,
      });
    }

    for (const vaccination of currentVaccinationDues(database, pet.id)) {
      derived.push({
        id: vaccination.id,
        petId: pet.id,
        petName: pet.name,
        source: 'vaccination',
        title: vaccination.vaccineCode ?? vaccination.productName ?? 'vaccination',
        dueOn: vaccination.nextDueOn as IsoDate,
      });
    }

    for (const treatment of currentParasiteDues(database, pet.id)) {
      derived.push({
        id: treatment.id,
        petId: pet.id,
        petName: pet.name,
        source: 'parasite_treatment',
        title: TARGET_LABEL[treatment.target] ?? 'parasite',
        dueOn: treatment.nextDueOn as IsoDate,
      });
    }

    for (const document of database.db
      .select()
      .from(documents)
      .where(and(eq(documents.petId, pet.id), ne(documents.expiresOn, '')))
      .all()) {
      if (!document.expiresOn) continue;
      derived.push({
        id: document.id,
        petId: pet.id,
        petName: pet.name,
        source: 'document_expiry',
        title: document.title,
        dueOn: document.expiresOn,
      });
    }

    derived.push(...medicationDays(database, pet.id, pet.name, options));

    if (options.includeBirthdays !== false && pet.birthDate) {
      const birthday = nextBirthday(
        pet.birthDate,
        pet.birthPrecision as BirthDatePrecision,
        options.from,
      );
      if (birthday) {
        derived.push({
          id: `${pet.id}-birthday`,
          petId: pet.id,
          petName: pet.name,
          source: 'birthday',
          title: 'birthday',
          dueOn: birthday,
        });
      }
    }
  }

  return { events, derived };
}

/**
 * One agenda entry per medication day rather than per dose.
 *
 * A course taken three times daily for a fortnight is forty-two doses; putting each one in
 * the calendar would bury everything else. Ticking individual doses belongs on the
 * medication screen.
 */
function medicationDays(
  database: Database,
  petId: string,
  petName: string,
  options: AgendaSourceOptions,
): DerivedDueInput[] {
  const courses = database.db
    .select()
    .from(medicationCourses)
    .where(eq(medicationCourses.petId, petId))
    .all();

  const entries: DerivedDueInput[] = [];

  for (const course of courses) {
    const doses = database.db
      .select()
      .from(medicationDoses)
      .where(
        and(
          eq(medicationDoses.courseId, course.id),
          gte(medicationDoses.dueOn, options.from),
          lte(medicationDoses.dueOn, options.to),
        ),
      )
      .all();

    const outstanding = new Set(
      doses.filter((dose) => dose.takenAt === null).map((dose) => dose.dueOn),
    );

    for (const dueOn of outstanding) {
      entries.push({
        id: `${course.id}-${dueOn}`,
        petId,
        petName,
        source: 'medication_dose',
        title: course.name,
        dueOn,
        notes: course.dose ?? undefined,
      });
    }
  }

  return entries;
}

/**
 * A local `HH:MM` on a civil date becomes the UTC instant a calendar can place.
 *
 * The time was written in the household's zone, so it has to be converted rather than
 * stamped with a `Z` — an appointment at 15:00 in Moscow is not 15:00 UTC.
 */
function instantFor(date: IsoDate, startTime: string | null, timeZone: string): string | undefined {
  if (!startTime) return undefined;
  return zonedDateTimeToInstant(date, startTime, timeZone);
}
