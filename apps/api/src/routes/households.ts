import { inviteMemberSchema, reminderPreferenceSchema } from '@pet-care-tracker/core';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { householdById } from '../domain/access';
import { findUserByEmail, membershipRole } from '../domain/auth';
import { randomToken, uuidv7 } from '../domain/ids';
import { householdMembers, households, users } from '../db/schema';
import { type AppContext, requireAuth } from '../http/context';
import { conflict, forbidden, notFound } from '../http/errors';

const updateSchema = z
  .object({ name: z.string().trim().min(1).max(80).optional() })
  .and(reminderPreferenceSchema.partial());

export function registerHouseholdRoutes(app: FastifyInstance, context: AppContext): void {
  const requireRole = (userId: string, householdId: string, allowed: string[]): string => {
    const role = membershipRole(context.database, { userId, householdId });
    if (role === null) throw notFound('household');
    if (!allowed.includes(role)) throw forbidden('your role does not allow this');
    return role;
  };

  app.get<{ Params: { id: string } }>('/households/:id', async (request) => {
    const { user } = requireAuth(request);
    const role = requireRole(user.id, request.params.id, ['owner', 'editor', 'viewer']);
    const household = householdById(context.database, request.params.id);

    const members = context.database.db
      .select({
        userId: householdMembers.userId,
        role: householdMembers.role,
        displayName: users.displayName,
        email: users.email,
      })
      .from(householdMembers)
      .innerJoin(users, eq(users.id, householdMembers.userId))
      .where(eq(householdMembers.householdId, request.params.id))
      .all();

    return {
      household: {
        id: household.id,
        name: household.name,
        reminderLeadDays: household.reminderLeadDays,
        reminderHour: household.reminderHour,
        // The subscription URL is shown only to a member, and only the token is secret.
        calendarUrl: `${context.config.PUBLIC_ORIGIN}/api/v1/calendar/${household.calendarToken}.ics`,
      },
      role,
      members,
    };
  });

  app.patch<{ Params: { id: string } }>('/households/:id', async (request) => {
    const { user } = requireAuth(request);
    requireRole(user.id, request.params.id, ['owner', 'editor']);

    const input = updateSchema.parse(request.body ?? {});
    const patch = Object.fromEntries(
      Object.entries({
        name: input.name,
        reminderLeadDays: input.leadDays,
        reminderHour: input.hour,
      }).filter(([, value]) => value !== undefined),
    );

    if (Object.keys(patch).length === 0) throw conflict('nothing to update');
    context.database.db
      .update(households)
      .set(patch)
      .where(eq(households.id, request.params.id))
      .run();

    return { ok: true };
  });

  /**
   * Rotating the calendar token.
   *
   * The subscription URL is a bearer credential for the agenda. Anyone who shared it with a
   * sitter and later wants it back needs a way to invalidate it; every subscribed calendar
   * then has to be re-added, which is the honest cost of revocation.
   */
  app.post<{ Params: { id: string } }>('/households/:id/calendar-token', async (request) => {
    const { user } = requireAuth(request);
    requireRole(user.id, request.params.id, ['owner']);

    const calendarToken = randomToken();
    context.database.db
      .update(households)
      .set({ calendarToken })
      .where(eq(households.id, request.params.id))
      .run();

    return {
      calendarUrl: `${context.config.PUBLIC_ORIGIN}/api/v1/calendar/${calendarToken}.ics`,
    };
  });

  app.post<{ Params: { id: string } }>('/households/:id/members', async (request, reply) => {
    const { user } = requireAuth(request);
    requireRole(user.id, request.params.id, ['owner']);

    const input = inviteMemberSchema.parse(request.body);
    // No mail service, so the person joins by registering first and being added by email.
    const invitee = findUserByEmail(context.database, input.email);
    if (!invitee) throw notFound('user with that email');

    const already = membershipRole(context.database, {
      userId: invitee.id,
      householdId: request.params.id,
    });
    if (already !== null) throw conflict('that person is already a member');

    context.database.db
      .insert(householdMembers)
      .values({
        id: uuidv7(context.now().getTime()),
        householdId: request.params.id,
        userId: invitee.id,
        role: input.role,
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({ userId: invitee.id, role: input.role });
  });

  app.delete<{ Params: { id: string; userId: string } }>(
    '/households/:id/members/:userId',
    async (request) => {
      const { user } = requireAuth(request);
      requireRole(user.id, request.params.id, ['owner']);

      const target = membershipRole(context.database, {
        userId: request.params.userId,
        householdId: request.params.id,
      });
      if (target === null) throw notFound('member');
      // A household with no owner would be unmanageable and its pets unreachable.
      if (target === 'owner') throw conflict('the owner cannot be removed');

      context.database.sqlite
        .prepare('DELETE FROM household_members WHERE household_id = ? AND user_id = ?')
        .run(request.params.id, request.params.userId);

      return { ok: true };
    },
  );
}
