import { expenseQuerySchema, expenseSchema, summariseExpenses } from '@pet-care-tracker/core';
import { desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { expenses } from '../db/schema';
import { assertWritable, householdById, petForRead, resolveHousehold } from '../domain/access';
import { uuidv7 } from '../domain/ids';
import { collectExpenseEntries } from '../domain/money';
import { type AppContext, requireAuth } from '../http/context';
import { notFound } from '../http/errors';

export function registerExpenseRoutes(app: FastifyInstance, context: AppContext): void {
  /**
   * The summary, merged from every place money is already recorded.
   *
   * The entries are returned alongside the totals so the interface can show where a figure
   * came from — a vet fee is not an expense row and cannot be edited as one.
   */
  app.get('/expenses', async (request) => {
    const { user } = requireAuth(request);
    const query = expenseQuerySchema.parse(request.query);
    const access = resolveHousehold(context.database, user.id, undefined);
    const household = householdById(context.database, access.householdId);

    if (query.petId) petForRead(context.database, user.id, query.petId);

    const entries = collectExpenseEntries(context.database, {
      householdId: household.id,
      from: query.from,
      to: query.to,
      currency: household.currency,
      petId: query.petId,
    });

    return {
      summary: summariseExpenses(entries, {
        from: query.from,
        to: query.to,
        currency: household.currency,
      }),
      entries: [...entries].sort((a, b) => b.spentOn.localeCompare(a.spentOn)),
    };
  });

  app.post('/expenses', async (request, reply) => {
    const { user } = requireAuth(request);
    const access = assertWritable(resolveHousehold(context.database, user.id, undefined));
    const household = householdById(context.database, access.householdId);
    const input = expenseSchema.parse(request.body);

    if (input.petId) petForRead(context.database, user.id, input.petId);

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(expenses)
      .values({
        id,
        householdId: household.id,
        petId: input.petId ?? null,
        category: input.category,
        amount: input.amount,
        currency: input.currency ?? household.currency,
        spentOn: input.spentOn,
        note: input.note ?? null,
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      expense: context.database.db.select().from(expenses).where(eq(expenses.id, id)).get(),
    });
  });

  const load = (userId: string, expenseId: string) => {
    const row = context.database.db.select().from(expenses).where(eq(expenses.id, expenseId)).get();
    if (!row) throw notFound('expense');

    const access = resolveHousehold(context.database, userId, row.householdId);
    assertWritable(access);
    return row;
  };

  app.patch<{ Params: { id: string } }>('/expenses/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = load(user.id, request.params.id);
    const input = expenseSchema.parse(request.body);

    context.database.db
      .update(expenses)
      .set({
        petId: input.petId ?? null,
        category: input.category,
        amount: input.amount,
        currency: input.currency ?? row.currency,
        spentOn: input.spentOn,
        note: input.note ?? null,
      })
      .where(eq(expenses.id, row.id))
      .run();

    return {
      expense: context.database.db.select().from(expenses).where(eq(expenses.id, row.id)).get(),
    };
  });

  app.delete<{ Params: { id: string } }>('/expenses/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = load(user.id, request.params.id);
    context.database.db.delete(expenses).where(eq(expenses.id, row.id)).run();
    return { ok: true };
  });

  /** The rows the owner entered, for a plain list that can be edited. */
  app.get('/expenses/entries', async (request) => {
    const { user } = requireAuth(request);
    const access = resolveHousehold(context.database, user.id, undefined);

    return {
      expenses: context.database.db
        .select()
        .from(expenses)
        .where(eq(expenses.householdId, access.householdId))
        .orderBy(desc(expenses.spentOn))
        .limit(200)
        .all(),
    };
  });
}
