import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { lostTagSchema } from '@pet-care-tracker/core';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { pets } from '../db/schema';
import { petForWrite } from '../domain/access';
import { findFile } from '../domain/files';
import { randomToken } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

/**
 * The lost-pet tag.
 *
 * A QR code on a collar that anyone can scan. What it shows is deliberately narrow — a
 * photo, a name, and a phone number — and none of it is read from the medical record. The
 * note is free text the owner writes themselves, so the page can never disclose something
 * they did not decide to put on it.
 *
 * The microchip number is not shown either: a finder cannot use it, a vet will scan the
 * animal anyway, and it is a lookup key in national registries.
 */
export function registerLostTagRoutes(app: FastifyInstance, context: AppContext): void {
  const tagUrl = (token: string) => `${context.config.PUBLIC_ORIGIN}/found/${token}`;

  app.put<{ Params: { id: string } }>('/pets/:id/lost-tag', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = lostTagSchema.parse(request.body);

    // Turning the tag on twice keeps the token, so a collar already printed still works.
    const lostToken = pet.lostToken ?? randomToken(16);

    context.database.db
      .update(pets)
      .set({
        lostToken,
        lostContactName: input.contactName,
        lostContactPhone: input.contactPhone,
        lostNote: input.note ?? null,
        updatedAt: context.now().toISOString(),
      })
      .where(eq(pets.id, pet.id))
      .run();

    return { token: lostToken, url: tagUrl(lostToken) };
  });

  /**
   * A new token, because a tag that came off in a park is a URL somebody else now holds.
   * The old one stops resolving immediately and the collar has to be reprinted.
   */
  app.post<{ Params: { id: string } }>('/pets/:id/lost-tag/rotate', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    if (!pet.lostToken) throw notFound('lost tag');

    const lostToken = randomToken(16);
    context.database.db
      .update(pets)
      .set({ lostToken, updatedAt: context.now().toISOString() })
      .where(eq(pets.id, pet.id))
      .run();

    return { token: lostToken, url: tagUrl(lostToken) };
  });

  app.delete<{ Params: { id: string } }>('/pets/:id/lost-tag', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);

    context.database.db
      .update(pets)
      .set({ lostToken: null, updatedAt: context.now().toISOString() })
      .where(eq(pets.id, pet.id))
      .run();

    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/pets/:id/lost-tag', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);

    return {
      enabled: pet.lostToken !== null,
      url: pet.lostToken ? tagUrl(pet.lostToken) : null,
      contactName: pet.lostContactName,
      contactPhone: pet.lostContactPhone,
      note: pet.lostNote,
    };
  });

  /** Public, by token. Rate limited: the token space is large but guessing is free. */
  app.get<{ Params: { token: string } }>(
    '/found/:token',
    { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } },
    async (request) => {
      const pet = context.database.db
        .select()
        .from(pets)
        .where(eq(pets.lostToken, request.params.token))
        .get();

      if (!pet || pet.archivedAt !== null) throw notFound('pet');

      return {
        name: pet.name,
        species: pet.species,
        speciesLabel: pet.speciesLabel,
        breed: pet.breed,
        colour: pet.colour,
        sex: pet.sex,
        // The thumbnail, not the full photo: enough to recognise the animal.
        photoUrl: pet.avatarFileId ? `/api/v1/found/${request.params.token}/photo` : null,
        contactName: pet.lostContactName,
        contactPhone: pet.lostContactPhone,
        note: pet.lostNote,
      };
    },
  );

  /**
   * The photo for a found page, served by tag token rather than by file id.
   *
   * Handing out the file id would let a stranger walk the household's other files; the
   * token only ever resolves to this one pet's avatar.
   */
  app.get<{ Params: { token: string } }>(
    '/found/:token/photo',
    { config: { rateLimit: { max: 60, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const pet = context.database.db
        .select()
        .from(pets)
        .where(eq(pets.lostToken, request.params.token))
        .get();
      if (!pet?.avatarFileId || pet.archivedAt !== null) throw notFound('photo');

      const file = findFile(context.database, pet.avatarFileId);
      if (!file?.thumbnailPath) throw notFound('photo');

      const exists = await stat(file.thumbnailPath).catch(() => null);
      if (!exists) throw notFound('photo');

      return reply
        .header('content-type', 'image/jpeg')
        .header('content-length', exists.size)
        .header('cache-control', 'public, max-age=3600')
        .send(createReadStream(file.thumbnailPath));
    },
  );
}
