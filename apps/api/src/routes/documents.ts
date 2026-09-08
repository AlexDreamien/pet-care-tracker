import { documentSchema } from '@pet-care-tracker/core';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { documents } from '../db/schema';
import { petForRead, petForWrite } from '../domain/access';
import { findFile } from '../domain/files';
import { uuidv7 } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { badRequest, notFound } from '../http/errors';

const orNull = <T>(value: T | undefined): T | null => value ?? null;

export function registerDocumentRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: { id: string } }>('/pets/:id/documents', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      documents: context.database.db
        .select()
        .from(documents)
        .where(eq(documents.petId, request.params.id))
        .orderBy(asc(documents.expiresOn))
        .all(),
    };
  });

  app.post<{ Params: { id: string } }>('/pets/:id/documents', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet, access } = petForWrite(context.database, user.id, request.params.id);
    const input = documentSchema.parse(request.body);

    if (input.fileId) {
      // A file from another household would attach someone else's scan to this record.
      const file = findFile(context.database, input.fileId);
      if (!file || file.householdId !== access.householdId) {
        throw badRequest('validation_failed', 'no such file');
      }
    }

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(documents)
      .values({
        id,
        petId: pet.id,
        kind: input.kind,
        title: input.title,
        issuedOn: orNull(input.issuedOn),
        expiresOn: orNull(input.expiresOn),
        fileId: orNull(input.fileId),
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      document: context.database.db.select().from(documents).where(eq(documents.id, id)).get(),
    });
  });

  app.patch<{ Params: { id: string } }>('/documents/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(documents)
      .where(eq(documents.id, request.params.id))
      .get();
    if (!row) throw notFound('document');

    const { access } = petForWrite(context.database, user.id, row.petId);
    const input = documentSchema.parse(request.body);

    if (input.fileId) {
      const file = findFile(context.database, input.fileId);
      if (!file || file.householdId !== access.householdId) {
        throw badRequest('validation_failed', 'no such file');
      }
    }

    context.database.db
      .update(documents)
      .set({
        kind: input.kind,
        title: input.title,
        issuedOn: orNull(input.issuedOn),
        expiresOn: orNull(input.expiresOn),
        fileId: orNull(input.fileId),
        notes: orNull(input.notes),
      })
      .where(eq(documents.id, row.id))
      .run();

    return {
      document: context.database.db.select().from(documents).where(eq(documents.id, row.id)).get(),
    };
  });

  app.delete<{ Params: { id: string } }>('/documents/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(documents)
      .where(eq(documents.id, request.params.id))
      .get();
    if (!row) throw notFound('document');

    petForWrite(context.database, user.id, row.petId);
    // The file survives: it may be attached elsewhere, and deleting it is its own action.
    context.database.db.delete(documents).where(eq(documents.id, row.id)).run();
    return { ok: true };
  });
}
