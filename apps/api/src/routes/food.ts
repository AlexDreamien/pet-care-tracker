import { diffDays, foodBagSchema, forecastFood, todayIn } from '@pet-care-tracker/core';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { foodBags } from '../db/schema';
import { petForRead, petForWrite } from '../domain/access';
import { uuidv7 } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

const orNull = <T>(value: T | undefined): T | null => value ?? null;

export function registerFoodRoutes(app: FastifyInstance, context: AppContext): void {
  app.get<{ Params: { id: string } }>('/pets/:id/food', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);
    const today = todayIn(context.now(), user.timeZone);

    const bags = context.database.db
      .select()
      .from(foodBags)
      .where(eq(foodBags.petId, request.params.id))
      .orderBy(desc(foodBags.openedOn))
      .all();

    return {
      bags: bags.map((bag) => ({
        ...bag,
        // A finished bag keeps its record but stops being forecast: the estimate is about
        // what is still in the cupboard.
        forecast:
          bag.finishedOn === null
            ? forecastFood(
                {
                  weightGrams: bag.weightGrams,
                  dailyGrams: bag.dailyGrams,
                  openedOn: bag.openedOn,
                },
                today,
              )
            : null,
      })),
    };
  });

  app.post<{ Params: { id: string } }>('/pets/:id/food', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = foodBagSchema.parse(request.body);

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(foodBags)
      .values({
        id,
        petId: pet.id,
        brand: orNull(input.brand),
        name: input.name,
        weightGrams: input.weightGrams,
        dailyGrams: input.dailyGrams,
        openedOn: input.openedOn,
        finishedOn: orNull(input.finishedOn),
        price: orNull(input.price),
        currency: orNull(input.currency),
        notes: orNull(input.notes),
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply
      .status(201)
      .send({ bag: context.database.db.select().from(foodBags).where(eq(foodBags.id, id)).get() });
  });

  const load = (userId: string, bagId: string) => {
    const row = context.database.db.select().from(foodBags).where(eq(foodBags.id, bagId)).get();
    if (!row) throw notFound('bag');
    petForWrite(context.database, userId, row.petId);
    return row;
  };

  app.patch<{ Params: { id: string } }>('/food/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = load(user.id, request.params.id);
    const input = foodBagSchema.parse(request.body);

    context.database.db
      .update(foodBags)
      .set({
        brand: orNull(input.brand),
        name: input.name,
        weightGrams: input.weightGrams,
        dailyGrams: input.dailyGrams,
        openedOn: input.openedOn,
        finishedOn: orNull(input.finishedOn),
        price: orNull(input.price),
        currency: orNull(input.currency),
        notes: orNull(input.notes),
      })
      .where(eq(foodBags.id, row.id))
      .run();

    return {
      bag: context.database.db.select().from(foodBags).where(eq(foodBags.id, row.id)).get(),
    };
  });

  /**
   * Marking a bag finished.
   *
   * The date it actually ran out is the only correction the forecast ever gets: it is the
   * difference between a ration on the label and what the animal really eats.
   */
  app.post<{ Params: { id: string } }>('/food/:id/finish', async (request) => {
    const { user } = requireAuth(request);
    const row = load(user.id, request.params.id);
    const finishedOn = todayIn(context.now(), user.timeZone);

    context.database.db.update(foodBags).set({ finishedOn }).where(eq(foodBags.id, row.id)).run();

    const actualDays = Math.max(1, diffDays(row.openedOn, finishedOn));
    return {
      finishedOn,
      /** What the ration really worked out at, for the owner to compare with the label. */
      actualDailyGrams: Math.round((row.weightGrams / actualDays) * 10) / 10,
    };
  });

  app.delete<{ Params: { id: string } }>('/food/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = load(user.id, request.params.id);
    context.database.db.delete(foodBags).where(eq(foodBags.id, row.id)).run();
    return { ok: true };
  });
}
