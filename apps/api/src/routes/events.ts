import {
  advanceOnCompletion,
  careEventSchema,
  completeEventSchema,
  type RecurrenceRule,
} from '@pet-care-tracker/core';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { careEvents, eventCompletions } from '../db/schema';
import { petForRead, petForWrite, resolveHousehold } from '../domain/access';
import { uuidv7 } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

const orNull = <T>(value: T | undefined): T | null => value ?? null;

export function registerEventRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: { id: string } }>('/pets/:id/events', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      events: context.database.db
        .select()
        .from(careEvents)
        .where(eq(careEvents.petId, request.params.id))
        .orderBy(asc(careEvents.scheduledOn))
        .all(),
    };
  });

  app.post('/events', async (request, reply) => {
    const { user } = requireAuth(request);
    const input = careEventSchema.parse(request.body);
    const { pet } = petForWrite(context.database, user.id, input.petId);

    const id = uuidv7(context.now().getTime());
    const timestamp = context.now().toISOString();

    context.database.db
      .insert(careEvents)
      .values({
        id,
        petId: pet.id,
        type: input.type,
        title: input.title,
        scheduledOn: input.scheduledOn,
        startTime: orNull(input.startTime),
        durationMinutes: orNull(input.durationMinutes),
        contactId: orNull(input.contactId),
        recurrence: input.recurrence ?? null,
        location: orNull(input.location),
        notes: orNull(input.notes),
        createdAt: timestamp,
        updatedAt: timestamp,
      })
      .run();

    return reply.status(201).send({
      event: context.database.db.select().from(careEvents).where(eq(careEvents.id, id)).get(),
    });
  });

  const loadForWrite = (userId: string, eventId: string) => {
    const row = context.database.db
      .select()
      .from(careEvents)
      .where(eq(careEvents.id, eventId))
      .get();
    if (!row) throw notFound('event');
    petForWrite(context.database, userId, row.petId);
    return row;
  };

  app.patch<{ Params: { id: string } }>('/events/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = loadForWrite(user.id, request.params.id);
    const input = careEventSchema.parse(request.body);

    context.database.db
      .update(careEvents)
      .set({
        type: input.type,
        title: input.title,
        scheduledOn: input.scheduledOn,
        startTime: orNull(input.startTime),
        durationMinutes: orNull(input.durationMinutes),
        contactId: orNull(input.contactId),
        recurrence: input.recurrence ?? null,
        location: orNull(input.location),
        notes: orNull(input.notes),
        updatedAt: context.now().toISOString(),
      })
      .where(eq(careEvents.id, row.id))
      .run();

    return {
      event: context.database.db.select().from(careEvents).where(eq(careEvents.id, row.id)).get(),
    };
  });

  /**
   * Marking an occurrence done.
   *
   * Where the series goes next is the core's decision, and it differs by rule kind: a
   * fixed-calendar series stays on its grid, so a checkup done a fortnight early does not
   * drag the next one forward; an after-completion series restarts from today, so a wormer
   * given late pushes the next one out. Getting this backwards is silent and wrong.
   */
  app.post<{ Params: { id: string } }>('/events/:id/complete', async (request) => {
    const { user } = requireAuth(request);
    const row = loadForWrite(user.id, request.params.id);
    const input = completeEventSchema.parse(request.body);

    const rule = row.recurrence as RecurrenceRule | null;
    const nextScheduledOn = rule
      ? advanceOnCompletion(rule, {
          completedOn: input.completedOn,
          scheduledFor: row.scheduledOn,
        })
      : null;

    context.database.sqlite.transaction(() => {
      context.database.db
        .insert(eventCompletions)
        .values({
          id: uuidv7(context.now().getTime()),
          eventId: row.id,
          completedOn: input.completedOn,
          notes: orNull(input.notes),
          createdAt: context.now().toISOString(),
        })
        .run();

      context.database.db
        .update(careEvents)
        .set({
          lastCompletedOn: input.completedOn,
          // A one-off keeps its date and simply reads as done.
          scheduledOn: nextScheduledOn ?? row.scheduledOn,
          updatedAt: context.now().toISOString(),
        })
        .where(eq(careEvents.id, row.id))
        .run();
    })();

    return {
      event: context.database.db.select().from(careEvents).where(eq(careEvents.id, row.id)).get(),
      nextScheduledOn,
    };
  });

  app.get<{ Params: { id: string } }>('/events/:id/completions', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(careEvents)
      .where(eq(careEvents.id, request.params.id))
      .get();
    if (!row) throw notFound('event');
    petForRead(context.database, user.id, row.petId);

    return {
      completions: context.database.db
        .select()
        .from(eventCompletions)
        .where(eq(eventCompletions.eventId, row.id))
        .orderBy(asc(eventCompletions.completedOn))
        .all(),
    };
  });

  app.delete<{ Params: { id: string } }>('/events/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = loadForWrite(user.id, request.params.id);
    context.database.db.delete(careEvents).where(eq(careEvents.id, row.id)).run();
    return { ok: true };
  });

  /** Everything scheduled across the household, for a calendar view that is not per pet. */
  app.get('/events', async (request) => {
    const { user } = requireAuth(request);
    const access = resolveHousehold(context.database, user.id, undefined);

    return {
      events: context.database.sqlite
        .prepare(
          `SELECT care_events.* FROM care_events
             JOIN pets ON pets.id = care_events.pet_id
            WHERE pets.household_id = ? AND pets.archived_at IS NULL
            ORDER BY care_events.scheduled_on ASC`,
        )
        .all(access.householdId),
    };
  });
}
