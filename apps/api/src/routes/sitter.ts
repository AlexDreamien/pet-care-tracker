import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import {
  addDays,
  compareDates,
  forecastFood,
  type IsoDate,
  sitterLinkSchema,
  todayIn,
} from '@pet-care-tracker/core';
import { and, desc, eq, gte, inArray, isNull, lte } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import {
  careEvents,
  contacts,
  foodBags,
  healthFlags,
  households,
  medicationCourses,
  medicationDoses,
  pets,
  sitterLinkPets,
  sitterLinks,
} from '../db/schema';
import { assertWritable, petForRead, resolveHousehold } from '../domain/access';
import { findFile } from '../domain/files';
import { randomToken, uuidv7 } from '../domain/ids';
import type { Database } from '../db/client';
import { type AppContext, requireAuth } from '../http/context';
import { badRequest, notFound } from '../http/errors';

/** Two weeks is as far ahead as a sitter needs to see. */
const HORIZON_DAYS = 14;

type Pet = typeof pets.$inferSelect;

/**
 * The handover link.
 *
 * Wider than the lost tag on purpose: someone is holding the animal, so they get the
 * allergies, the ration and what to give when. Narrower than an account: read-only, only
 * the pets the owner picked, dead the day after a date they chose, and revocable before
 * then. Those four limits are what make handing it over reasonable.
 */
export function registerSitterRoutes(app: FastifyInstance, context: AppContext): void {
  const linkUrl = (token: string) => `${context.config.PUBLIC_ORIGIN}/sitter/${token}`;

  app.get('/sitter-links', async (request) => {
    const { user } = requireAuth(request);
    const access = resolveHousehold(context.database, user.id, undefined);
    const today = todayIn(context.now(), user.timeZone);

    const links = context.database.db
      .select()
      .from(sitterLinks)
      .where(eq(sitterLinks.householdId, access.householdId))
      .orderBy(desc(sitterLinks.createdAt))
      .all();

    return {
      links: links.map((link) => ({
        id: link.id,
        label: link.label,
        expiresOn: link.expiresOn,
        url: linkUrl(link.token),
        revokedAt: link.revokedAt,
        active: link.revokedAt === null && compareDates(link.expiresOn, today) >= 0,
        petIds: context.database.db
          .select({ petId: sitterLinkPets.petId })
          .from(sitterLinkPets)
          .where(eq(sitterLinkPets.linkId, link.id))
          .all()
          .map((row) => row.petId),
      })),
    };
  });

  app.post('/sitter-links', async (request, reply) => {
    const { user } = requireAuth(request);
    const access = assertWritable(resolveHousehold(context.database, user.id, undefined));
    const input = sitterLinkSchema.parse(request.body);
    const today = todayIn(context.now(), user.timeZone);

    if (compareDates(input.expiresOn, today) < 0) {
      throw badRequest('validation_failed', 'the link would already have expired', {
        fields: [{ path: 'expiresOn', message: 'pick a date that has not passed' }],
      });
    }

    // Every pet must belong to this household, or the link would hand out someone else's.
    for (const petId of input.petIds) petForRead(context.database, user.id, petId);

    const id = uuidv7(context.now().getTime());
    const token = randomToken(16);

    context.database.sqlite.transaction(() => {
      context.database.db
        .insert(sitterLinks)
        .values({
          id,
          householdId: access.householdId,
          token,
          label: input.label,
          expiresOn: input.expiresOn,
          createdAt: context.now().toISOString(),
        })
        .run();

      for (const petId of input.petIds) {
        context.database.db
          .insert(sitterLinkPets)
          .values({ id: uuidv7(context.now().getTime()), linkId: id, petId })
          .run();
      }
    })();

    return reply.status(201).send({ id, url: linkUrl(token) });
  });

  app.delete<{ Params: { id: string } }>('/sitter-links/:id', async (request) => {
    const { user } = requireAuth(request);
    const access = assertWritable(resolveHousehold(context.database, user.id, undefined));

    const link = context.database.db
      .select()
      .from(sitterLinks)
      .where(
        and(eq(sitterLinks.id, request.params.id), eq(sitterLinks.householdId, access.householdId)),
      )
      .get();
    if (!link) throw notFound('link');

    // Revoked rather than deleted: who was given access, and when, is worth keeping.
    context.database.db
      .update(sitterLinks)
      .set({ revokedAt: context.now().toISOString() })
      .where(eq(sitterLinks.id, link.id))
      .run();

    return { ok: true };
  });

  /** Resolves a token to a live link, or throws. Expiry and revocation both read as absent. */
  function liveLink(token: string): { link: typeof sitterLinks.$inferSelect; today: IsoDate } {
    const link = context.database.db
      .select()
      .from(sitterLinks)
      .where(eq(sitterLinks.token, token))
      .get();
    if (!link || link.revokedAt !== null) throw notFound('link');

    const household = context.database.db
      .select()
      .from(households)
      .where(eq(households.id, link.householdId))
      .get();
    if (!household) throw notFound('link');

    // The household's zone decides when "tomorrow" starts, not the sitter's phone.
    const today = todayIn(context.now(), household.timeZone);
    if (compareDates(link.expiresOn, today) < 0) throw notFound('link');

    return { link, today };
  }

  app.get<{ Params: { token: string } }>(
    '/sitter/:token',
    { config: { rateLimit: { max: 120, timeWindow: '5 minutes' } } },
    async (request) => {
      const { link, today } = liveLink(request.params.token);

      const petIds = context.database.db
        .select({ petId: sitterLinkPets.petId })
        .from(sitterLinkPets)
        .where(eq(sitterLinkPets.linkId, link.id))
        .all()
        .map((row) => row.petId);

      const covered =
        petIds.length === 0
          ? []
          : context.database.db.select().from(pets).where(inArray(pets.id, petIds)).all();

      const vet = context.database.db
        .select()
        .from(contacts)
        .where(eq(contacts.householdId, link.householdId))
        .all()
        .find((contact) => contact.kind === 'vet' || contact.kind === 'clinic');

      return {
        label: link.label,
        expiresOn: link.expiresOn,
        today,
        vet: vet ? { name: vet.name, phone: vet.phone, address: vet.address } : null,
        pets: covered.map((pet) => describeForSitter(context.database, pet, today, link.token)),
      };
    },
  );

  /** The photo, by link token, so the URL cannot be walked into the household's files. */
  app.get<{ Params: { token: string; petId: string } }>(
    '/sitter/:token/photo/:petId',
    { config: { rateLimit: { max: 120, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const { link } = liveLink(request.params.token);

      const covered = context.database.db
        .select()
        .from(sitterLinkPets)
        .where(
          and(eq(sitterLinkPets.linkId, link.id), eq(sitterLinkPets.petId, request.params.petId)),
        )
        .get();
      if (!covered) throw notFound('photo');

      const pet = context.database.db
        .select()
        .from(pets)
        .where(eq(pets.id, request.params.petId))
        .get();
      if (!pet?.avatarFileId) throw notFound('photo');

      const file = findFile(context.database, pet.avatarFileId);
      if (!file?.thumbnailPath) throw notFound('photo');

      const exists = await stat(file.thumbnailPath).catch(() => null);
      if (!exists) throw notFound('photo');

      return reply
        .header('content-type', 'image/jpeg')
        .header('content-length', exists.size)
        .header('cache-control', 'private, max-age=3600')
        .send(createReadStream(file.thumbnailPath));
    },
  );
}

/**
 * What a sitter is told about one animal.
 *
 * Everything here answers a question somebody standing in a kitchen actually has: what does
 * it eat, what do I give it today, what must I never offer it, and who do I ring.
 */
function describeForSitter(database: Database, pet: Pet, today: IsoDate, token: string) {
  const openBag = database.db
    .select()
    .from(foodBags)
    .where(and(eq(foodBags.petId, pet.id), isNull(foodBags.finishedOn)))
    .all()[0];

  const courses = database.db
    .select()
    .from(medicationCourses)
    .where(eq(medicationCourses.petId, pet.id))
    .all()
    .filter((course) => course.endsOn === null || compareDates(course.endsOn, today) >= 0);

  const dosesToday = courses.flatMap((course) =>
    database.db
      .select()
      .from(medicationDoses)
      .where(and(eq(medicationDoses.courseId, course.id), eq(medicationDoses.dueOn, today)))
      .all()
      .map((dose) => ({
        course: course.name,
        dose: course.dose,
        sequence: dose.sequence,
        taken: dose.takenAt !== null,
      })),
  );

  const upcoming = database.db
    .select()
    .from(careEvents)
    .where(
      and(
        eq(careEvents.petId, pet.id),
        gte(careEvents.scheduledOn, today),
        lte(careEvents.scheduledOn, addDays(today, HORIZON_DAYS)),
      ),
    )
    .all();

  return {
    id: pet.id,
    name: pet.name,
    species: pet.species,
    speciesLabel: pet.speciesLabel,
    breed: pet.breed,
    photoUrl: pet.avatarFileId ? `/api/v1/sitter/${token}/photo/${pet.id}` : null,
    // A sitter has to know what the animal cannot have before they offer it anything.
    flags: database.db
      .select()
      .from(healthFlags)
      .where(eq(healthFlags.petId, pet.id))
      .all()
      .map((flag) => ({ kind: flag.kind, label: flag.label, severity: flag.severity })),
    food: openBag
      ? {
          brand: openBag.brand,
          name: openBag.name,
          dailyGrams: openBag.dailyGrams,
          forecast: forecastFood(
            {
              weightGrams: openBag.weightGrams,
              dailyGrams: openBag.dailyGrams,
              openedOn: openBag.openedOn,
            },
            today,
          ),
        }
      : null,
    dosesToday,
    upcoming: upcoming.map((event) => ({
      type: event.type,
      title: event.title,
      scheduledOn: event.scheduledOn,
      startTime: event.startTime,
    })),
    notes: pet.notes,
  };
}
