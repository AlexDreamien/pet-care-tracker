import { petSchema, todayIn } from '@pet-care-tracker/core';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { assertWritable, petForRead, petForWrite, resolveHousehold } from '../domain/access';
import { findFile } from '../domain/files';
import {
  archivePet,
  createPet,
  deletePet,
  listPets,
  petView,
  restorePet,
  updatePet,
} from '../domain/pets';
import { type AppContext, requireAuth } from '../http/context';
import { badRequest } from '../http/errors';

const listQuery = z.object({
  householdId: z.uuid().optional(),
  includeArchived: z
    .enum(['true', 'false'])
    .optional()
    .transform((value) => value === 'true'),
});

const createBody = petSchema.and(z.object({ householdId: z.uuid().optional() }));

export function registerPetRoutes(app: FastifyInstance, context: AppContext): void {
  /** "Today" is the owner's today: an overdue vaccination should not appear a day early. */
  const todayFor = (timeZone: string) => todayIn(context.now(), timeZone);

  app.get('/pets', async (request) => {
    const { user } = requireAuth(request);
    const query = listQuery.parse(request.query);
    const access = resolveHousehold(context.database, user.id, query.householdId);
    const today = todayFor(user.timeZone);

    return {
      pets: listPets(context.database, access.householdId, {
        includeArchived: query.includeArchived,
      }).map((pet) => petView(context.database, pet, today)),
    };
  });

  /** An avatar from another household would put someone else's photo on this pet. */
  const assertOwnFile = (householdId: string, fileId: string | undefined): void => {
    if (!fileId) return;
    const file = findFile(context.database, fileId);
    if (!file || file.householdId !== householdId) {
      throw badRequest('validation_failed', 'no such file');
    }
  };

  app.post('/pets', async (request, reply) => {
    const { user } = requireAuth(request);
    const body = createBody.parse(request.body);
    const access = assertWritable(resolveHousehold(context.database, user.id, body.householdId));
    assertOwnFile(access.householdId, body.avatarFileId);

    const pet = createPet(context.database, {
      householdId: access.householdId,
      pet: body,
      now: context.now(),
    });

    return reply.status(201).send({ pet: petView(context.database, pet, todayFor(user.timeZone)) });
  });

  app.get<{ Params: { id: string } }>('/pets/:id', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForRead(context.database, user.id, request.params.id);
    return { pet: petView(context.database, pet, todayFor(user.timeZone)) };
  });

  app.patch<{ Params: { id: string } }>('/pets/:id', async (request) => {
    const { user } = requireAuth(request);
    const { access } = petForWrite(context.database, user.id, request.params.id);

    const input = petSchema.parse(request.body);
    assertOwnFile(access.householdId, input.avatarFileId);
    const pet = updatePet(context.database, request.params.id, input, context.now());
    return { pet: petView(context.database, pet, todayFor(user.timeZone)) };
  });

  app.post<{ Params: { id: string } }>('/pets/:id/archive', async (request) => {
    const { user } = requireAuth(request);
    petForWrite(context.database, user.id, request.params.id);
    archivePet(context.database, request.params.id, context.now());
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/pets/:id/restore', async (request) => {
    const { user } = requireAuth(request);
    petForWrite(context.database, user.id, request.params.id);
    restorePet(context.database, request.params.id, context.now());
    return { ok: true };
  });

  app.delete<{ Params: { id: string } }>('/pets/:id', async (request, reply) => {
    const { user } = requireAuth(request);
    const { access } = petForWrite(context.database, user.id, request.params.id);
    // Erasing a record for good is the owner's decision alone, not an editor's.
    if (access.role !== 'owner') {
      return reply.status(403).send({
        error: { code: 'forbidden', message: 'only the household owner can delete a pet' },
      });
    }

    deletePet(context.database, request.params.id);
    return { ok: true };
  });
}
