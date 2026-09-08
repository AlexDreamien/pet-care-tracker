import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import { createSession, SESSION_COOKIE, SESSION_DAYS } from '../domain/auth';
import {
  deleteCredential,
  finishAuthentication,
  finishRegistration,
  FLOW_TTL_SECONDS,
  listCredentials,
  type RelyingParty,
  startAuthentication,
  startRegistration,
  WEBAUTHN_COOKIE,
} from '../domain/passkeys';
import { type AppContext, requireAuth } from '../http/context';
import { ApiError, badRequest, notFound } from '../http/errors';

const verifySchema = z.object({
  response: z.record(z.string(), z.unknown()),
  deviceLabel: z.string().trim().max(60).optional(),
});

function relyingParty(context: AppContext): RelyingParty {
  return {
    origin: context.config.PUBLIC_ORIGIN,
    rpId: context.config.rpId,
    name: 'pet-care-tracker',
  };
}

function setFlowCookie(reply: FastifyReply, context: AppContext, flowId: string): void {
  reply.setCookie(WEBAUTHN_COOKIE, flowId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: context.config.isProduction,
    path: '/',
    maxAge: FLOW_TTL_SECONDS,
  });
}

const flowMissing = () =>
  new ApiError(400, 'validation_failed', 'the passkey ceremony expired, start again');

export function registerPasskeyRoutes(app: FastifyInstance, context: AppContext): void {
  app.post('/auth/passkey/register/options', async (request, reply) => {
    const { user } = requireAuth(request);
    const { flowId, options } = await startRegistration(context.database, {
      userId: user.id,
      rp: relyingParty(context),
      now: context.now(),
    });

    setFlowCookie(reply, context, flowId);
    return options;
  });

  app.post('/auth/passkey/register/verify', async (request, reply) => {
    const { user } = requireAuth(request);
    const flowId = request.cookies[WEBAUTHN_COOKIE];
    if (!flowId) throw flowMissing();

    const input = verifySchema.parse(request.body);
    const result = await finishRegistration(context.database, {
      userId: user.id,
      flowId,
      response: input.response as never,
      deviceLabel: input.deviceLabel,
      rp: relyingParty(context),
      now: context.now(),
    });

    reply.clearCookie(WEBAUTHN_COOKIE, { path: '/' });
    if (!result.verified) throw badRequest('validation_failed', 'the passkey was not accepted');
    return reply.status(201).send({ credentialId: result.credentialId });
  });

  app.post(
    '/auth/passkey/login/options',
    { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (_request, reply) => {
      const { flowId, options } = await startAuthentication(context.database, {
        rp: relyingParty(context),
        now: context.now(),
      });

      setFlowCookie(reply, context, flowId);
      return options;
    },
  );

  app.post(
    '/auth/passkey/login/verify',
    { config: { rateLimit: { max: 20, timeWindow: '5 minutes' } } },
    async (request, reply) => {
      const flowId = request.cookies[WEBAUTHN_COOKIE];
      if (!flowId) throw flowMissing();

      const input = verifySchema.parse(request.body);
      const result = await finishAuthentication(context.database, {
        flowId,
        response: input.response as never,
        rp: relyingParty(context),
        now: context.now(),
      });

      reply.clearCookie(WEBAUTHN_COOKIE, { path: '/' });
      if (!result.verified || !result.userId) {
        throw new ApiError(401, 'invalid_credentials', 'the passkey was not accepted');
      }

      const { token } = createSession(context.database, {
        userId: result.userId,
        userAgent: request.headers['user-agent'],
        now: context.now(),
      });

      reply.setCookie(SESSION_COOKIE, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: context.config.isProduction,
        path: '/',
        maxAge: SESSION_DAYS * 86_400,
      });

      return { userId: result.userId };
    },
  );

  app.get('/auth/passkeys', async (request) => {
    const { user } = requireAuth(request);
    return {
      passkeys: listCredentials(context.database, user.id).map((credential) => ({
        id: credential.id,
        deviceLabel: credential.deviceLabel,
        createdAt: credential.createdAt,
        lastUsedAt: credential.lastUsedAt,
      })),
    };
  });

  app.delete<{ Params: { id: string } }>('/auth/passkeys/:id', async (request) => {
    const { user } = requireAuth(request);
    const removed = deleteCredential(context.database, {
      userId: user.id,
      credentialId: request.params.id,
    });
    if (!removed) throw notFound('passkey');
    return { ok: true };
  });
}
