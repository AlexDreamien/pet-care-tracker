import { contactSchema } from '@pet-care-tracker/core';
import { asc, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { contacts } from '../db/schema';
import { assertWritable, resolveHousehold } from '../domain/access';
import { membershipRole } from '../domain/auth';
import { uuidv7 } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

const listQuery = z.object({ householdId: z.uuid().optional() });
const createBody = contactSchema.and(z.object({ householdId: z.uuid().optional() }));

const orNull = <T>(value: T | undefined): T | null => (value === '' ? null : (value ?? null));

export function registerContactRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/contacts', async (request) => {
    const { user } = requireAuth(request);
    const query = listQuery.parse(request.query);
    const access = resolveHousehold(context.database, user.id, query.householdId);

    return {
      contacts: context.database.db
        .select()
        .from(contacts)
        .where(eq(contacts.householdId, access.householdId))
        // Favourites first: the clinic you actually call should not need scrolling to.
        .orderBy(desc(contacts.favourite), asc(contacts.name))
        .all(),
    };
  });

  app.post('/contacts', async (request, reply) => {
    const { user } = requireAuth(request);
    const input = createBody.parse(request.body);
    const access = assertWritable(resolveHousehold(context.database, user.id, input.householdId));

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(contacts)
      .values({
        id,
        householdId: access.householdId,
        kind: input.kind,
        name: input.name,
        phone: orNull(input.phone),
        email: orNull(input.email),
        address: orNull(input.address),
        website: orNull(input.website),
        favourite: input.favourite,
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      contact: context.database.db.select().from(contacts).where(eq(contacts.id, id)).get(),
    });
  });

  const loadForWrite = (userId: string, contactId: string) => {
    const row = context.database.db.select().from(contacts).where(eq(contacts.id, contactId)).get();
    if (!row) throw notFound('contact');

    const role = membershipRole(context.database, { userId, householdId: row.householdId });
    if (role === null) throw notFound('contact');
    assertWritable({ householdId: row.householdId, role });

    return row;
  };

  app.patch<{ Params: { id: string } }>('/contacts/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = loadForWrite(user.id, request.params.id);
    const input = contactSchema.parse(request.body);

    context.database.db
      .update(contacts)
      .set({
        kind: input.kind,
        name: input.name,
        phone: orNull(input.phone),
        email: orNull(input.email),
        address: orNull(input.address),
        website: orNull(input.website),
        favourite: input.favourite,
        notes: orNull(input.notes),
      })
      .where(eq(contacts.id, row.id))
      .run();

    return {
      contact: context.database.db.select().from(contacts).where(eq(contacts.id, row.id)).get(),
    };
  });

  app.delete<{ Params: { id: string } }>('/contacts/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = loadForWrite(user.id, request.params.id);
    // Visits and events referencing it keep their rows; the link simply goes null.
    context.database.db.delete(contacts).where(eq(contacts.id, row.id)).run();
    return { ok: true };
  });
}
