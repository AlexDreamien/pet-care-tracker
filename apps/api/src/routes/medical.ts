import {
  doseProgress,
  expandMedicationCourse,
  healthFlagSchema,
  medicationCourseSchema,
  type ParasiteTarget,
  parasiteTreatmentSchema,
  todayIn,
  vaccinationSchema,
  visitSchema,
} from '@pet-care-tracker/core';
import { vaccinesFor } from '@pet-care-tracker/catalog';
import { and, asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  healthFlags,
  medicationCourses,
  medicationDoses,
  parasiteTreatments,
  vaccinations,
  visits,
} from '../db/schema';
import { petForRead, petForWrite } from '../domain/access';
import { uuidv7 } from '../domain/ids';
import { proposeParasiteDue, proposeVaccinationDue } from '../domain/medical';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

type PetParams = { Params: { id: string } };
type RecordParams = { Params: { id: string } };

const orNull = <T>(value: T | undefined): T | null => value ?? null;

export function registerMedicalRoutes(app: FastifyInstance, context: AppContext): void {
  const today = (timeZone: string) => todayIn(context.now(), timeZone);

  // -- the catalogue the interface offers as defaults --------------------------------------

  app.get<PetParams>('/pets/:id/vaccine-catalogue', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForRead(context.database, user.id, request.params.id);

    return {
      vaccines: vaccinesFor(pet.species as 'dog' | 'cat' | 'other').map((vaccine) => ({
        code: vaccine.code,
        core: vaccine.core,
        covers: vaccine.covers,
        // Shown next to any proposed date, so a default never looks like a prescription.
        guidance: vaccine.guidance,
      })),
    };
  });

  // -- vaccinations --------------------------------------------------------------------------

  app.get<PetParams>('/pets/:id/vaccinations', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      vaccinations: context.database.db
        .select()
        .from(vaccinations)
        .where(eq(vaccinations.petId, request.params.id))
        .orderBy(desc(vaccinations.administeredOn))
        .all(),
    };
  });

  app.post<PetParams>('/pets/:id/vaccinations', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = vaccinationSchema.parse(request.body);

    // The owner's date wins; the catalogue only fills a gap.
    const nextDueOn =
      input.nextDueOn ??
      proposeVaccinationDue(context.database, pet, {
        vaccineCode: orNull(input.vaccineCode),
        administeredOn: input.administeredOn,
        today: today(user.timeZone),
      });

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(vaccinations)
      .values({
        id,
        petId: pet.id,
        vaccineCode: orNull(input.vaccineCode),
        productName: orNull(input.productName),
        batchNumber: orNull(input.batchNumber),
        administeredOn: input.administeredOn,
        nextDueOn,
        contactId: orNull(input.contactId),
        documentId: orNull(input.documentId),
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      vaccination: context.database.db
        .select()
        .from(vaccinations)
        .where(eq(vaccinations.id, id))
        .get(),
      /** True when the date came from the catalogue rather than from the request. */
      dueDateProposed: input.nextDueOn === undefined && nextDueOn !== null,
    });
  });

  app.delete<RecordParams>('/vaccinations/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(vaccinations)
      .where(eq(vaccinations.id, request.params.id))
      .get();
    if (!row) throw notFound('vaccination');

    petForWrite(context.database, user.id, row.petId);
    context.database.db.delete(vaccinations).where(eq(vaccinations.id, row.id)).run();
    return { ok: true };
  });

  // -- antiparasitic treatment -----------------------------------------------------------------

  app.get<PetParams>('/pets/:id/parasite-treatments', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      treatments: context.database.db
        .select()
        .from(parasiteTreatments)
        .where(eq(parasiteTreatments.petId, request.params.id))
        .orderBy(desc(parasiteTreatments.administeredOn))
        .all(),
    };
  });

  app.post<PetParams>('/pets/:id/parasite-treatments', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = parasiteTreatmentSchema.parse(request.body);

    const nextDueOn =
      input.nextDueOn ??
      proposeParasiteDue(pet, {
        target: input.target as ParasiteTarget,
        administeredOn: input.administeredOn,
        today: today(user.timeZone),
      });

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(parasiteTreatments)
      .values({
        id,
        petId: pet.id,
        target: input.target,
        productName: orNull(input.productName),
        administeredOn: input.administeredOn,
        nextDueOn,
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      treatment: context.database.db
        .select()
        .from(parasiteTreatments)
        .where(eq(parasiteTreatments.id, id))
        .get(),
      dueDateProposed: input.nextDueOn === undefined && nextDueOn !== null,
    });
  });

  app.delete<RecordParams>('/parasite-treatments/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(parasiteTreatments)
      .where(eq(parasiteTreatments.id, request.params.id))
      .get();
    if (!row) throw notFound('treatment');

    petForWrite(context.database, user.id, row.petId);
    context.database.db.delete(parasiteTreatments).where(eq(parasiteTreatments.id, row.id)).run();
    return { ok: true };
  });

  // -- visits -----------------------------------------------------------------------------------

  app.get<PetParams>('/pets/:id/visits', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      visits: context.database.db
        .select()
        .from(visits)
        .where(eq(visits.petId, request.params.id))
        .orderBy(desc(visits.visitedOn))
        .all(),
    };
  });

  app.post<PetParams>('/pets/:id/visits', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = visitSchema.parse(request.body);

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(visits)
      .values({
        id,
        petId: pet.id,
        visitedOn: input.visitedOn,
        reason: input.reason,
        findings: orNull(input.findings),
        treatment: orNull(input.treatment),
        cost: orNull(input.cost),
        currency: orNull(input.currency),
        contactId: orNull(input.contactId),
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply
      .status(201)
      .send({ visit: context.database.db.select().from(visits).where(eq(visits.id, id)).get() });
  });

  // -- health flags -------------------------------------------------------------------------------

  app.get<PetParams>('/pets/:id/health-flags', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      flags: context.database.db
        .select()
        .from(healthFlags)
        .where(eq(healthFlags.petId, request.params.id))
        .orderBy(asc(healthFlags.label))
        .all(),
    };
  });

  app.post<PetParams>('/pets/:id/health-flags', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = healthFlagSchema.parse(request.body);

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(healthFlags)
      .values({
        id,
        petId: pet.id,
        kind: input.kind,
        label: input.label,
        severity: input.severity,
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      flag: context.database.db.select().from(healthFlags).where(eq(healthFlags.id, id)).get(),
    });
  });

  app.delete<RecordParams>('/health-flags/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(healthFlags)
      .where(eq(healthFlags.id, request.params.id))
      .get();
    if (!row) throw notFound('flag');

    petForWrite(context.database, user.id, row.petId);
    context.database.db.delete(healthFlags).where(eq(healthFlags.id, row.id)).run();
    return { ok: true };
  });

  // -- medication ------------------------------------------------------------------------------------

  app.get<PetParams>('/pets/:id/medications', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    const courses = context.database.db
      .select()
      .from(medicationCourses)
      .where(eq(medicationCourses.petId, request.params.id))
      .orderBy(desc(medicationCourses.startsOn))
      .all();

    return {
      medications: courses.map((course) => {
        const doses = context.database.db
          .select()
          .from(medicationDoses)
          .where(eq(medicationDoses.courseId, course.id))
          .orderBy(asc(medicationDoses.dueOn), asc(medicationDoses.sequence))
          .all();

        return { ...course, doses, progress: doseProgress(doses, today(user.timeZone)) };
      }),
    };
  });

  app.post<PetParams>('/pets/:id/medications', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = medicationCourseSchema.parse(request.body);

    const id = uuidv7(context.now().getTime());
    const createdAt = context.now().toISOString();
    const planned = expandMedicationCourse({
      startsOn: input.startsOn,
      endsOn: input.endsOn,
      timesPerDay: input.timesPerDay,
    });

    context.database.sqlite.transaction(() => {
      context.database.db
        .insert(medicationCourses)
        .values({
          id,
          petId: pet.id,
          name: input.name,
          dose: orNull(input.dose),
          timesPerDay: input.timesPerDay,
          startsOn: input.startsOn,
          endsOn: orNull(input.endsOn),
          notes: orNull(input.notes),
          createdAt,
        })
        .run();

      for (const dose of planned) {
        context.database.db
          .insert(medicationDoses)
          .values({
            id: uuidv7(context.now().getTime()),
            courseId: id,
            dueOn: dose.dueOn,
            sequence: dose.sequence,
          })
          .run();
      }
    })();

    return reply.status(201).send({
      medication: context.database.db
        .select()
        .from(medicationCourses)
        .where(eq(medicationCourses.id, id))
        .get(),
      doseCount: planned.length,
    });
  });

  const doseParams = z.object({ id: z.string(), doseId: z.string() });

  app.post<{ Params: { id: string; doseId: string } }>(
    '/medications/:id/doses/:doseId/taken',
    async (request) => {
      const { user } = requireAuth(request);
      const params = doseParams.parse(request.params);

      const course = context.database.db
        .select()
        .from(medicationCourses)
        .where(eq(medicationCourses.id, params.id))
        .get();
      if (!course) throw notFound('course');
      petForWrite(context.database, user.id, course.petId);

      const result = context.database.db
        .update(medicationDoses)
        .set({ takenAt: context.now().toISOString() })
        .where(and(eq(medicationDoses.id, params.doseId), eq(medicationDoses.courseId, course.id)))
        .run();
      if (result.changes === 0) throw notFound('dose');

      return { ok: true };
    },
  );

  app.delete<{ Params: { id: string; doseId: string } }>(
    '/medications/:id/doses/:doseId/taken',
    async (request) => {
      const { user } = requireAuth(request);
      const params = doseParams.parse(request.params);

      const course = context.database.db
        .select()
        .from(medicationCourses)
        .where(eq(medicationCourses.id, params.id))
        .get();
      if (!course) throw notFound('course');
      petForWrite(context.database, user.id, course.petId);

      // Un-ticking matters: a dose marked by mistake is otherwise a permanent lie.
      const result = context.database.db
        .update(medicationDoses)
        .set({ takenAt: null })
        .where(and(eq(medicationDoses.id, params.doseId), eq(medicationDoses.courseId, course.id)))
        .run();
      if (result.changes === 0) throw notFound('dose');

      return { ok: true };
    },
  );

  app.delete<RecordParams>('/medications/:id', async (request) => {
    const { user } = requireAuth(request);
    const course = context.database.db
      .select()
      .from(medicationCourses)
      .where(eq(medicationCourses.id, request.params.id))
      .get();
    if (!course) throw notFound('course');

    petForWrite(context.database, user.id, course.petId);
    context.database.db.delete(medicationCourses).where(eq(medicationCourses.id, course.id)).run();
    return { ok: true };
  });
}
