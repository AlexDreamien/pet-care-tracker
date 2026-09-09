import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  dispatchDueReminders,
  listSubscriptions,
  removeSubscription,
  saveSubscription,
  sendToUser,
} from '../domain/push';
import { safeEquals } from '../domain/auth';
import { type AppContext, requireAuth } from '../http/context';
import { ApiError, badRequest } from '../http/errors';

const subscriptionSchema = z.object({
  endpoint: z.url().max(1000),
  keys: z.object({ p256dh: z.string().min(1).max(500), auth: z.string().min(1).max(500) }),
  deviceLabel: z.string().trim().max(60).optional(),
});

/**
 * Web push, as an addition to the calendar feed rather than a replacement.
 *
 * With no VAPID keys configured the whole feature reports itself as unavailable and nothing
 * errors — a deployment without push is a supported deployment.
 */
export function registerPushRoutes(app: FastifyInstance, context: AppContext): void {
  app.get('/push/key', async (request) => {
    requireAuth(request);
    return {
      enabled: context.config.pushEnabled,
      // The public key is public by design; the browser needs it to subscribe.
      publicKey: context.config.pushEnabled ? context.config.VAPID_PUBLIC_KEY : null,
    };
  });

  app.get('/push/subscriptions', async (request) => {
    const { user } = requireAuth(request);
    return {
      subscriptions: listSubscriptions(context.database, user.id).map((row) => ({
        id: row.id,
        deviceLabel: row.deviceLabel,
        createdAt: row.createdAt,
        lastSentAt: row.lastSentAt,
      })),
    };
  });

  app.post('/push/subscribe', async (request, reply) => {
    const { user } = requireAuth(request);
    if (!context.config.pushEnabled) {
      throw badRequest('validation_failed', 'push is not configured on this instance');
    }

    const subscription = subscriptionSchema.parse(request.body);
    saveSubscription(context.database, {
      userId: user.id,
      subscription,
      now: context.now(),
    });

    return reply.status(201).send({ ok: true });
  });

  app.post('/push/unsubscribe', async (request) => {
    requireAuth(request);
    const { endpoint } = z.object({ endpoint: z.url().max(1000) }).parse(request.body);
    removeSubscription(context.database, endpoint);
    return { ok: true };
  });

  /** Proves the whole chain works before the owner relies on it. */
  app.post('/push/test', async (request) => {
    const { user } = requireAuth(request);
    const delivered = await sendToUser(
      context.database,
      context.config,
      user.id,
      {
        title: user.displayName,
        body: user.locale === 'ru' ? 'Уведомления работают' : 'Notifications are working',
        url: `${context.config.PUBLIC_ORIGIN}/`,
      },
      context.now(),
    );

    return { delivered };
  });

  /**
   * The sweep, exposed so something outside can trigger it.
   *
   * The in-process scheduler only runs while the machine is awake, and a machine that
   * suspends when idle is asleep at nine in the morning. An external ping — a scheduled
   * workflow, a cron box — wakes it and makes the sweep happen.
   */
  app.post('/push/dispatch', async (request) => {
    const secret = context.config.PUSH_DISPATCH_SECRET;
    const offered = request.headers['x-dispatch-secret'];

    const authorised =
      request.auth !== undefined ||
      (secret !== '' && typeof offered === 'string' && safeEquals(secret, offered));
    if (!authorised) throw new ApiError(401, 'unauthenticated', 'sign in or present the secret');

    return dispatchDueReminders(context.database, context.config, context.now());
  });
}
