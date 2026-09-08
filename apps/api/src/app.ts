import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { resolveSession, SESSION_COOKIE } from './domain/auth';
import type { AppContext } from './http/context';
import { ApiError, toErrorBody, validationFailed } from './http/errors';
import { registerAuthRoutes } from './routes/auth';
import { registerPasskeyRoutes } from './routes/passkeys';
import { registerAgendaRoutes } from './routes/agenda';
import { registerContactRoutes } from './routes/contacts';
import { registerDocumentRoutes } from './routes/documents';
import { registerEventRoutes } from './routes/events';
import { registerExpenseRoutes } from './routes/expenses';
import { registerFoodRoutes } from './routes/food';
import { registerExportRoutes } from './routes/export';
import { registerFileRoutes } from './routes/files';
import { registerHouseholdRoutes } from './routes/households';
import { registerMeasurementRoutes } from './routes/measurements';
import { registerMedicalRoutes } from './routes/medical';
import { registerPetRoutes } from './routes/pets';

export interface BuildAppOptions {
  context: AppContext;
  logger?: boolean;
}

export async function buildApp(options: BuildAppOptions): Promise<FastifyInstance> {
  const { context } = options;
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: context.config.MAX_UPLOAD_BYTES,
    // Behind Fly's proxy the client address arrives in a header; rate limiting is useless
    // without it, because every request would look like it came from the proxy.
    trustProxy: context.config.isProduction,
  });

  await app.register(cookie);
  await app.register(multipart, {
    limits: { fileSize: context.config.MAX_UPLOAD_BYTES, files: 1 },
  });
  await app.register(rateLimit, {
    global: false,
    max: 300,
    timeWindow: '1 minute',
  });

  /**
   * Every request carries its session, or none. Route handlers call `requireAuth` rather
   * than each remembering to check, so forgetting the check fails closed at the type level.
   */
  app.addHook('onRequest', async (request) => {
    const token = request.cookies[SESSION_COOKIE];
    if (!token) return;
    const resolved = resolveSession(context.database, token, context.now());
    if (resolved) request.auth = resolved;
  });

  app.setErrorHandler((error: unknown, request, reply) => {
    if (error instanceof ApiError) {
      return reply.status(error.status).send(toErrorBody(error));
    }
    if (error instanceof ZodError) {
      const mapped = validationFailed(error);
      return reply.status(mapped.status).send(toErrorBody(mapped));
    }

    // Fastify and its plugins signal with a status code on the error object.
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 429) {
      return reply
        .status(429)
        .send(toErrorBody(new ApiError(429, 'rate_limited', 'too many attempts, wait a moment')));
    }
    if (status === 413) {
      return reply
        .status(413)
        .send(toErrorBody(new ApiError(413, 'payload_too_large', 'the upload is too large')));
    }

    request.log.error({ err: error }, 'unhandled error');
    return reply
      .status(500)
      .send(toErrorBody(new ApiError(500, 'internal_error', 'something went wrong')));
  });

  app.get('/api/v1/health', async () => ({ status: 'ok' }));

  /**
   * The built SPA is served from the same origin as the API.
   *
   * One origin means no CORS, a plain session cookie, and a service worker whose scope
   * covers everything the application talks to. Fastify allows one not-found handler per
   * prefix, so this is the only place that decides what a 404 means.
   */
  if (context.config.WEB_DIST) {
    await app.register(fastifyStatic, { root: resolve(context.config.WEB_DIST) });
  }

  app.setNotFoundHandler((request, reply) => {
    if (!context.config.WEB_DIST || request.url.startsWith('/api/')) {
      return reply.status(404).send(toErrorBody(new ApiError(404, 'not_found', 'no such route')));
    }
    // Anything else is a client-side route; the SPA decides what it means.
    return reply.sendFile('index.html');
  });

  await app.register(
    async (api) => {
      registerAuthRoutes(api, context);
      registerPasskeyRoutes(api, context);
      registerHouseholdRoutes(api, context);
      registerPetRoutes(api, context);
      registerFileRoutes(api, context);
      registerDocumentRoutes(api, context);
      registerMedicalRoutes(api, context);
      registerMeasurementRoutes(api, context);
      registerContactRoutes(api, context);
      registerEventRoutes(api, context);
      registerFoodRoutes(api, context);
      registerExpenseRoutes(api, context);
      registerAgendaRoutes(api, context);
      registerExportRoutes(api, context);
    },
    { prefix: '/api/v1' },
  );

  return app;
}
