import {
  changeSincePrevious,
  isPlausible,
  measurementSchema,
  measurementTargetSchema,
  type Metric,
  positionInTarget,
  sizeCard,
  todayIn,
  trend,
} from '@pet-care-tracker/core';
import { and, asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { measurements, measurementTargets } from '../db/schema';
import { petForRead, petForWrite } from '../domain/access';
import { uuidv7 } from '../domain/ids';
import { type AppContext, requireAuth } from '../http/context';
import { badRequest, notFound } from '../http/errors';

const listQuery = z.object({ metric: z.string().optional() });

export function registerMeasurementRoutes(app: FastifyInstance, context: AppContext): void {
  const readingsFor = (petId: string, metric?: string) =>
    context.database.db
      .select()
      .from(measurements)
      .where(
        metric
          ? and(eq(measurements.petId, petId), eq(measurements.metric, metric))
          : eq(measurements.petId, petId),
      )
      .orderBy(asc(measurements.measuredOn))
      .all();

  app.get<{ Params: { id: string } }>('/pets/:id/measurements', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);
    const query = listQuery.parse(request.query);

    const rows = readingsFor(request.params.id, query.metric);
    const targets = context.database.db
      .select()
      .from(measurementTargets)
      .where(eq(measurementTargets.petId, request.params.id))
      .all();

    // Grouped by metric, because that is how a chart and a size card both want it.
    const byMetric = new Map<string, typeof rows>();
    for (const row of rows) {
      const bucket = byMetric.get(row.metric) ?? [];
      bucket.push(row);
      byMetric.set(row.metric, bucket);
    }

    const series = [...byMetric.entries()].map(([metric, readings]) => {
      const target = targets.find((candidate) => candidate.metric === metric);
      const latest = readings[readings.length - 1];

      return {
        metric,
        readings,
        target: target ? { value: target.value, min: target.minValue, max: target.maxValue } : null,
        change: changeSincePrevious(readings),
        trend: trend(readings),
        position:
          latest && target
            ? positionInTarget(latest.value, {
                min: target.minValue ?? undefined,
                max: target.maxValue ?? undefined,
              })
            : null,
      };
    });

    return { series };
  });

  app.post<{ Params: { id: string } }>('/pets/:id/measurements', async (request, reply) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = measurementSchema.parse(request.body);

    // A weight of 420 kg is a misplaced decimal point, not a dog.
    if (!isPlausible(input.metric as Metric, input.value)) {
      throw badRequest('validation_failed', 'that value looks like a typo', {
        fields: [{ path: 'value', message: 'outside the plausible range for this metric' }],
      });
    }

    const id = uuidv7(context.now().getTime());
    context.database.db
      .insert(measurements)
      .values({
        id,
        petId: pet.id,
        metric: input.metric,
        measuredOn: input.measuredOn,
        value: input.value,
        notes: input.notes ?? null,
        createdAt: context.now().toISOString(),
      })
      .run();

    return reply.status(201).send({
      measurement: context.database.db
        .select()
        .from(measurements)
        .where(eq(measurements.id, id))
        .get(),
    });
  });

  app.delete<{ Params: { id: string } }>('/measurements/:id', async (request) => {
    const { user } = requireAuth(request);
    const row = context.database.db
      .select()
      .from(measurements)
      .where(eq(measurements.id, request.params.id))
      .get();
    if (!row) throw notFound('measurement');

    petForWrite(context.database, user.id, row.petId);
    context.database.db.delete(measurements).where(eq(measurements.id, row.id)).run();
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>('/pets/:id/targets', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    return {
      targets: context.database.db
        .select()
        .from(measurementTargets)
        .where(eq(measurementTargets.petId, request.params.id))
        .all(),
    };
  });

  app.put<{ Params: { id: string } }>('/pets/:id/targets', async (request) => {
    const { user } = requireAuth(request);
    const { pet } = petForWrite(context.database, user.id, request.params.id);
    const input = measurementTargetSchema.parse(request.body);

    const existing = context.database.db
      .select()
      .from(measurementTargets)
      .where(and(eq(measurementTargets.petId, pet.id), eq(measurementTargets.metric, input.metric)))
      .get();

    const values = {
      value: input.value ?? null,
      minValue: input.min ?? null,
      maxValue: input.max ?? null,
      updatedAt: context.now().toISOString(),
    };

    if (existing) {
      context.database.db
        .update(measurementTargets)
        .set(values)
        .where(eq(measurementTargets.id, existing.id))
        .run();
    } else {
      context.database.db
        .insert(measurementTargets)
        .values({
          id: uuidv7(context.now().getTime()),
          petId: pet.id,
          metric: input.metric,
          ...values,
        })
        .run();
    }

    return { ok: true };
  });

  /**
   * The screen to open in a shop.
   *
   * Each entry carries how old the reading is, because a chest girth measured on a puppy
   * six months ago buys the wrong harness.
   */
  app.get<{ Params: { id: string } }>('/pets/:id/size-card', async (request) => {
    const { user } = requireAuth(request);
    petForRead(context.database, user.id, request.params.id);

    const rows = readingsFor(request.params.id);
    const grouped: Partial<Record<Metric, { measuredOn: string; value: number }[]>> = {};
    for (const row of rows) {
      const metric = row.metric as Metric;
      (grouped[metric] ??= []).push({ measuredOn: row.measuredOn, value: row.value });
    }

    return { entries: sizeCard(grouped, todayIn(context.now(), user.timeZone)) };
  });
}
