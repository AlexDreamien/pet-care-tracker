import {
  agendaQuerySchema,
  buildAgenda,
  buildCalendar,
  buildCalendarEvents,
  todayIn,
} from '@pet-care-tracker/core';
import { addYears } from '@pet-care-tracker/core';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { households } from '../db/schema';
import { householdById, resolveHousehold } from '../domain/access';
import { collectAgendaInput } from '../domain/agendaSource';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

export function registerAgendaRoutes(app: FastifyInstance, context: AppContext): void {
  /**
   * The merged view the home screen reads.
   *
   * Scheduled events and derived due dates go through the same core function the calendar
   * feed uses, so the two cannot disagree about when anything is due.
   */
  app.get('/agenda', async (request) => {
    const { user } = requireAuth(request);
    const query = agendaQuerySchema.parse(request.query);
    const access = resolveHousehold(context.database, user.id, undefined);
    const household = householdById(context.database, access.householdId);

    const input = collectAgendaInput(context.database, {
      householdId: access.householdId,
      from: query.from,
      to: query.to,
      petId: query.petId,
      timeZone: household.timeZone,
      foodLeadDays: household.foodLeadDays,
    });

    return {
      items: buildAgenda(
        input,
        { from: query.from, to: query.to },
        todayIn(context.now(), user.timeZone),
      ),
    };
  });

  /**
   * The subscription feed.
   *
   * Public by token and deliberately narrow: it carries titles and dates, which is what a
   * calendar needs, and nothing from the medical record. Anyone holding the URL can read
   * the agenda, which is why rotating the token exists.
   */
  app.get<{ Params: { token: string } }>('/calendar/:token.ics', async (request, reply) => {
    const token = request.params.token;
    const household = context.database.db
      .select()
      .from(households)
      .where(eq(households.calendarToken, token))
      .get();
    if (!household) throw notFound('calendar');

    const today = todayIn(context.now(), household.timeZone);
    // A year ahead is what a subscribed calendar needs; it refetches on its own schedule.
    const window = { from: today, to: addYears(today, 1) };

    const input = collectAgendaInput(context.database, {
      householdId: household.id,
      from: window.from,
      to: window.to,
      timeZone: household.timeZone,
      foodLeadDays: household.foodLeadDays,
    });

    const document = buildCalendar(
      buildCalendarEvents(input, {
        alarm: {
          leadDays: household.reminderLeadDays,
          hour: household.reminderHour,
          description: household.name,
        },
      }),
      {
        name: household.name,
        now: context.now(),
        window,
      },
    );

    return (
      reply
        .header('content-type', 'text/calendar; charset=utf-8')
        .header('content-disposition', 'inline; filename="pets.ics"')
        // Calendar clients poll; an hour keeps them from hammering a small machine.
        .header('cache-control', 'private, max-age=3600')
        .send(document)
    );
  });
}
