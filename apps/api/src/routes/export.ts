import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  careEvents,
  contacts,
  documents,
  eventCompletions,
  files,
  healthFlags,
  measurements,
  measurementTargets,
  medicationCourses,
  medicationDoses,
  parasiteTreatments,
  pets,
  vaccinations,
  visits,
} from '../db/schema';
import { householdById, resolveHousehold } from '../domain/access';
import { type AppContext, requireAuth } from '../http/context';

export function registerExportRoutes(app: FastifyInstance, context: AppContext): void {
  /**
   * Everything the household holds, as one JSON document.
   *
   * A record kept for fourteen years should never be trapped in someone else's database.
   * File contents are referenced rather than inlined — they are fetched from `/files/:id`
   * with the same session — but every row that describes them travels.
   */
  app.get('/export', async (request, reply) => {
    const { user } = requireAuth(request);
    const access = resolveHousehold(context.database, user.id, undefined);
    const household = householdById(context.database, access.householdId);
    const db = context.database.db;

    const householdPets = db.select().from(pets).where(eq(pets.householdId, household.id)).all();
    const petIds = householdPets.map((pet) => pet.id);

    const courses = petIds.length
      ? db.select().from(medicationCourses).where(inArray(medicationCourses.petId, petIds)).all()
      : [];
    const eventRows = petIds.length
      ? db.select().from(careEvents).where(inArray(careEvents.petId, petIds)).all()
      : [];

    const payload = {
      exportedAt: context.now().toISOString(),
      schema: 1,
      household: {
        id: household.id,
        name: household.name,
        timeZone: household.timeZone,
        reminderLeadDays: household.reminderLeadDays,
        reminderHour: household.reminderHour,
      },
      pets: householdPets,
      contacts: db.select().from(contacts).where(eq(contacts.householdId, household.id)).all(),
      files: db
        .select({
          id: files.id,
          filename: files.filename,
          mimeType: files.mimeType,
          byteSize: files.byteSize,
          sha256: files.sha256,
          createdAt: files.createdAt,
        })
        .from(files)
        .where(eq(files.householdId, household.id))
        .all(),
      documents: petIds.length
        ? db.select().from(documents).where(inArray(documents.petId, petIds)).all()
        : [],
      healthFlags: petIds.length
        ? db.select().from(healthFlags).where(inArray(healthFlags.petId, petIds)).all()
        : [],
      vaccinations: petIds.length
        ? db.select().from(vaccinations).where(inArray(vaccinations.petId, petIds)).all()
        : [],
      parasiteTreatments: petIds.length
        ? db
            .select()
            .from(parasiteTreatments)
            .where(inArray(parasiteTreatments.petId, petIds))
            .all()
        : [],
      visits: petIds.length
        ? db.select().from(visits).where(inArray(visits.petId, petIds)).all()
        : [],
      medicationCourses: courses,
      medicationDoses: courses.length
        ? db
            .select()
            .from(medicationDoses)
            .where(
              inArray(
                medicationDoses.courseId,
                courses.map((course) => course.id),
              ),
            )
            .all()
        : [],
      measurements: petIds.length
        ? db.select().from(measurements).where(inArray(measurements.petId, petIds)).all()
        : [],
      measurementTargets: petIds.length
        ? db
            .select()
            .from(measurementTargets)
            .where(inArray(measurementTargets.petId, petIds))
            .all()
        : [],
      careEvents: eventRows,
      eventCompletions: eventRows.length
        ? db
            .select()
            .from(eventCompletions)
            .where(
              inArray(
                eventCompletions.eventId,
                eventRows.map((event) => event.id),
              ),
            )
            .all()
        : [],
    };

    return reply
      .header('content-disposition', `attachment; filename="pet-care-tracker-export.json"`)
      .send(payload);
  });
}
