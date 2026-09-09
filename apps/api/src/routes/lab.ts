import { COMMON_ANALYTES, groupLabReadings, labValueSchema } from '@pet-care-tracker/core';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { documents, labValues } from '../db/schema';
import { petForRead, petForWrite } from '../domain/access';
import { uuidv7 } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { badRequest, notFound } from '../http/errors';

const orNull = <T>(value: T | undefined): T | null => value ?? null;

/**
 * Laboratory results.
 *
 * The application stores the numbers and draws them against the range the laboratory
 * printed. It does not supply a range of its own, and it does not say what a value means —
 * that is a conversation with a vet.
 */
export function registerLabRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: { id: string } }>('/pets/:id/labs', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    const rows = context.database.db
      .select()
      .from(labValues)
      .where(eq(labValues.petId, request.params.id))
      .orderBy(asc(labValues.measuredOn))
      .all();

    return {
      series: groupLabReadings(
        rows.map((row) => ({
          id: row.id,
          analyte: row.analyte,
          value: row.value,
          unit: row.unit,
          measuredOn: row.measuredOn,
          referenceMin: row.referenceMin ?? undefined,
          referenceMax: row.referenceMax ?? undefined,
        })),
      ),
      /** Suggestions only, so one analyte does not become two spellings on two charts. */
      suggestions: COMMON_ANALYTES,
    };
  });

  app.post<{ Params: { id: string } }>('/pets/:id/labs', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = labValueSchema.parse(request.body);

    // The scan a value was read off must belong to the same animal, or the chart would
    // point at somebody else's form.
    if (input.documentId) {
      const document = context.database.db
        .select()
        .from(documents)
        .where(eq(documents.id, input.documentId))
        .get();
      if (!document || document.petId !== pet.id) {
        throw badRequest('validation_failed', 'no such document for this pet');
      }
    }

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(labValues)
      .values({
        id,
        petId: pet.id,
        documentId: orNull(input.documentId),
        analyte: input.analyte,
        value: input.value,
        unit: input.unit,
        measuredOn: input.measuredOn,
        referenceMin: orNull(input.referenceMin),
        referenceMax: orNull(input.referenceMax),
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      value: context.database.db.select().from(labValues).where(eq(labValues.id, id)).get(),
    });
  });

  app.delete<{ Params: { id: string } }>('/labs/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(labValues)
      .where(eq(labValues.id, request.params.id))
      .get();
    if (!row) throw notFound('value');

    petForWrite(context.database, user.id, row.petId);
    context.database.db.delete(labValues).where(eq(labValues.id, row.id)).run();
    return { ok: true };
  });
}
